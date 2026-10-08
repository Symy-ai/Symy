import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const authMock = vi.hoisted(() => ({ getUser: vi.fn() }));
const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

import { createAuthenticatedClient } from '../supabase-api';

const URL = 'https://supabase.test';
const ANON_KEY = 'test-anon-key';
const cookies = {
  getAll: vi.fn<(typeof NextRequest.prototype.cookies)['getAll']>(() => []),
  set: vi.fn(),
};

function setupEnv(publishable = false) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
  if (publishable) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
}

function setupClient() {
  const request = { cookies } as unknown as NextRequest;
  createServerClientMock.mockReturnValue({ auth: authMock });
  return request;
}

describe('createAuthenticatedClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEnv();
    cookies.set.mockClear();
  });

  it('returns a configured null client when Supabase env is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = await createAuthenticatedClient({} as NextRequest);

    expect(result).toMatchObject({ supabase: null, user: null, error: 'Supabase not configured', pendingCookies: [] });
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it('creates the SSR client with request cookies and auth result', async () => {
    const request = setupClient();
    const user = { id: 'user-1', email: 'user@test' };
    authMock.getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await createAuthenticatedClient(request);

    expect(createServerClientMock).toHaveBeenCalledWith(URL, ANON_KEY, expect.objectContaining({ cookies: expect.any(Object) }));
    expect(result.user).toEqual(user);
    expect(result.error).toBeNull();
    expect(result.supabase).toEqual({ auth: authMock });
  });

  it('supports the publishable key as the anon-key fallback', async () => {
    setupEnv(true);
    const request = setupClient();
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await createAuthenticatedClient(request);

    expect(createServerClientMock).toHaveBeenCalledWith(URL, 'sb_publishable_test', expect.any(Object));
  });

  it('returns null user and the auth error without swallowing it', async () => {
    const request = setupClient();
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid JWT' } });

    const result = await createAuthenticatedClient(request);

    expect(result.user).toBeNull();
    expect(result.error).toBe('Invalid JWT');
  });

  it('keeps later cookie batches and overwrites duplicates on response merge', async () => {
    const request = setupClient();
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await createAuthenticatedClient(request);
    const setAll = createServerClientMock.mock.calls.at(-1)![2].cookies.setAll;

    setAll([
      { name: 'old', value: '1', options: {} },
      { name: 'shared', value: 'first', options: {} },
    ]);
    setAll([
      { name: 'shared', value: 'second', options: {} },
      { name: 'new', value: '2', options: {} },
    ]);
    const response = result.mergeCookies(new NextResponse());
    expect(response.cookies.get('shared')?.value).toBe('second');
    expect(response.cookies.get('new')?.value).toBe('2');
    expect(response.cookies.get('old')?.value).toBe('1');
    expect(cookies.set).toHaveBeenNthCalledWith(1, 'old', '1');
    expect(cookies.set).toHaveBeenNthCalledWith(2, 'shared', 'first');
    expect(cookies.set).toHaveBeenNthCalledWith(3, 'shared', 'second');
    expect(cookies.set).toHaveBeenNthCalledWith(4, 'new', '2');
  });

  it('json auto-merges pending cookies onto a JSON NextResponse', async () => {
    const request = setupClient();
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await createAuthenticatedClient(request);
    const setAll = createServerClientMock.mock.calls.at(-1)![2].cookies.setAll;
    setAll([{ name: 'auth', value: 'refreshed', options: { path: '/', httpOnly: true } }]);

    const response = result.json({ ok: true }, { status: 201 });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.cookies.get('auth')?.value).toBe('refreshed');
  });

  it('merges cookies onto both NextResponse and plain Response forms', async () => {
    const request = setupClient();
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await createAuthenticatedClient(request);
    const setAll = createServerClientMock.mock.calls.at(-1)![2].cookies.setAll;
    const cookie = { name: 'session', value: 'next', options: { maxAge: 60, sameSite: 'Lax', secure: true, httpOnly: true } };
    setAll([cookie]);

    const nextResponse = result.mergeCookies(new NextResponse('next'));
    const plainResponse = result.mergeCookiesOnResponse(new Response('stream'));

    expect(nextResponse.cookies.get('session')?.value).toBe('next');
    expect(plainResponse.headers.getSetCookie()).toContain('session=next; Max-Age=60; SameSite=Lax; Secure; HttpOnly');
  });
});
