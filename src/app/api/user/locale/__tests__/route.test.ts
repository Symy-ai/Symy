/**
 * Integration tests for POST /api/user/locale
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/user/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock() {
  return {
    supabase: {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ error: null })),
        })),
      })),
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/user/locale', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await POST(makeRequest({ locale: 'en' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid locale (not en/zh)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ locale: 'ja' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid timezone format', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ timezone: 'Not/A/Timezone!@#' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on no fields to update', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('accepts valid locale en', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ locale: 'en' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.locale).toBe('en');
  });

  it('accepts valid locale zh', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ locale: 'zh' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.locale).toBe('zh');
  });

  it('accepts valid IANA timezone Asia/Shanghai', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ timezone: 'Asia/Shanghai' }));
    expect(res.status).toBe(200);
  });

  it('accepts UTC as valid timezone', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ timezone: 'UTC' }));
    expect(res.status).toBe(200);
  });

  it('accepts multi-segment IANA timezone America/Argentina/Buenos_Aires', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ timezone: 'America/Argentina/Buenos_Aires' }));
    expect(res.status).toBe(200);
  });

  it('accepts timezone with hyphen America/Port-au-Prince', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ timezone: 'America/Port-au-Prince' }));
    expect(res.status).toBe(200);
  });
});
