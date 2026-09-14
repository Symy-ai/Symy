/**
 * Integration tests for GET /api/email/callback
 *
 * 🔧 ARCH fix Round 73 — Audit Finding 4.9:
 *   Email OAuth callback route had ZERO tests. This is the OAuth security boundary —
 *   CSRF state validation, code-for-token exchange, encrypted token storage.
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Define mock functions at module scope so tests can access them
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockGetProfile = vi.fn();

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/email/gmail-config', () => ({
  GMAIL_OAUTH_CONFIG: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/api/email/callback',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  },
}));

vi.mock('@/lib/crypto-helpers', () => ({
  encryptSensitive: vi.fn((s: string) => `encrypted:${s}`),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      // Mock as a class (used with `new`) — function declaration form so `new` works.
      OAuth2: class MockOAuth2 {
        getToken = mockGetToken;
        setCredentials = mockSetCredentials;
      },
    },
    gmail: vi.fn(() => ({
      users: { getProfile: mockGetProfile },
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(params: Record<string, string> = {}, cookies: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/email/callback');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const req = new NextRequest(url.toString(), { method: 'GET' });
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  return req;
}

function authedMock(supabaseOverrides: Record<string, unknown> = {}) {
  return {
    supabase: {
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({ error: null })),
      })),
      ...supabaseOverrides,
    },
    user: { id: 'user-123', email: 'test@example.com' },
    error: null,
    mergeCookies: <T extends NextResponse>(res: T): T => res,
    mergeCookiesOnResponse: <T extends NextResponse>(res: T): T => res,
    pendingCookies: [],
  };
}

describe('GET /api/email/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 🔧 2026-07-21: Use mockReset to clear mockResolvedValueOnce queue
    //    (clearAllMocks only clears calls/results, not implementations)
    vi.mocked(createAuthenticatedClient).mockReset();
    mockGetToken.mockReset();
    mockGetProfile.mockReset();
    mockSetCredentials.mockReset();
  });

  it('redirects with email_error when OAuth provider returns error param (user denied)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(makeRequest({ error: 'access_denied' }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_error=access_denied');
  });

  it('redirects with email_error=missing_code when code param absent', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(makeRequest({}));
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_error=missing_code');
  });

  it('redirects with email_error=state_mismatch when state cookie missing (CSRF defense)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(makeRequest({ code: 'test-code', state: 'some-nonce' }));
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_error=state_mismatch');
  });

  it('redirects with email_error=state_mismatch when state nonce does not match cookie', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(
      makeRequest({ code: 'test-code', state: 'wrong-nonce' }, { 'symy-oauth-state': 'different-nonce' }),
    );
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_error=state_mismatch');
  });

  it('clears the OAuth state cookie on every response (single-use nonce)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(makeRequest({ error: 'access_denied' }));
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie.toLowerCase()).toContain('symy-oauth-state=');
    const isCleared = /max-age=0/i.test(setCookie) || /expires=thu, 01 jan 1970/i.test(setCookie) || /symy-oauth-state=;/i.test(setCookie);
    expect(isCleared).toBe(true);
  });

  it('proceeds to token exchange when state matches cookie (mocked success)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    mockGetToken.mockResolvedValueOnce({
      tokens: {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600_000,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      },
    });
    mockGetProfile.mockResolvedValueOnce({
      data: { emailAddress: 'user@gmail.com' },
    });

    const res = await GET(
      makeRequest(
        { code: 'test-code', state: 'matching-nonce' },
        { 'symy-oauth-state': 'matching-nonce' },
      ),
    );
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_connected=gmail');
  });

  it('redirects with email_error=oauth_callback_failed when token exchange throws', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    mockGetToken.mockRejectedValueOnce(new Error('Network error'));

    const res = await GET(
      makeRequest(
        { code: 'test-code', state: 'matching-nonce' },
        { 'symy-oauth-state': 'matching-nonce' },
      ),
    );
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_error=oauth_callback_failed');
  });

  it('redirects with email_error=not_authenticated when user is not logged in', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T extends NextResponse>(res: T): T => res,
      mergeCookiesOnResponse: <T extends NextResponse>(res: T): T => res,
      pendingCookies: [],
    } as never);

    const res = await GET(
      makeRequest(
        { code: 'test-code', state: 'matching-nonce' },
        { 'symy-oauth-state': 'matching-nonce' },
      ),
    );
    const location = res.headers.get('location') || '';
    expect(location).toContain('email_error=not_authenticated');
  });
});
