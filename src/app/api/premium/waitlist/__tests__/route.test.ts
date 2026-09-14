/**
 * Integration tests for POST /api/premium/waitlist
 *
 * 🔧 ARCH fix Round 74 (Finding 8): Zero tests for new feature code.
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/premium/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock(supabaseOverrides: Record<string, unknown> = {}) {
  return {
    supabase: {
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({ error: null })),
      })),
      ...supabaseOverrides,
    },
    user: { id: 'user-123', email: 'user@example.com' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/premium/waitlist', () => {
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

    const res = await POST(makeRequest({ email: 'test@example.com' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid email', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing email', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns success on valid email + successful upsert', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.degraded).toBeUndefined();
  });

  it('returns success + degraded when table does not exist (graceful degradation)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => ({
          upsert: vi.fn(async () => ({
            error: { message: 'Could not find the table', code: '42P01' },
          })),
        })),
      },
      user: { id: 'user-123', email: 'user@example.com' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await POST(makeRequest({ email: 'user@example.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.degraded).toBe(true);
  });

  it('returns 500 on other upsert errors (RLS, connection, etc.) — not swallowed as success', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => ({
          upsert: vi.fn(async () => ({
            error: { message: 'RLS denial', code: '42501' },
          })),
        })),
      },
      user: { id: 'user-123', email: 'user@example.com' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await POST(makeRequest({ email: 'user@example.com' }));
    // 🔧 ARCH fix Round 75 (Finding 30): Real errors return 500 (not success: true)
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('DB_ERROR');
    expect(json.requestId).toBeTruthy();
  });

  it('returns 500 on unhandled exception — not swallowed as success', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => { throw new Error('Unexpected'); }),
      },
      user: { id: 'user-123', email: 'user@example.com' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await POST(makeRequest({ email: 'user@example.com' }));
    // 🔧 ARCH fix Round 75 (Finding 30): Unhandled exceptions return 500 (not success: true)
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('INTERNAL');
    expect(json.requestId).toBeTruthy();
  });
});
