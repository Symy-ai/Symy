/**
 * Integration tests for POST /api/buddy/healing-kit
 *
 * 🔧 ARCH fix Round 73 — Audit Finding 4.1 + 7.5:
 *   - Finding 4.1: route had 0 tests (HIGH criticality — daily limit + data write)
 *   - Finding 7.5: 409 missing lastHealingKitAt caused silent 409 loop in client
 *
 * 🔧 2026-07-21: Updated to work with withAuth HOF migration.
 *    - authedMock() now includes `supabase` for profile query (handled by withAuth)
 *    - adminMock() only handles RPC call (profile query moved to authenticated client)
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/companion-rpc', () => ({
  fireReplenishDailyNeed: vi.fn(async () => ({ success: true })),
  fireBumpIntimacy: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/buddy/healing-kit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/**
 * Mock for createAuthenticatedClient — includes `supabase` for profile query.
 * 🔧 2026-07-21: withAuth expects { supabase, user, error, mergeCookies, mergeCookiesOnResponse }
 */
function authedMock(profileTz?: string | null) {
  return {
    user: { id: 'user-123' },
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: profileTz === undefined ? null : { timezone: profileTz },
              error: null,
            })),
          })),
        })),
      })),
    },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

/**
 * Mock for createAdminClient — only handles RPC call.
 * 🔧 2026-07-21: Profile query moved to authenticated client (withAuth).
 */
function adminMock(rpcResult: unknown, rpcError: { message: string } | null = null) {
  return {
    supabase: {
      rpc: vi.fn(async () => ({ data: rpcResult, error: rpcError })),
    },
    error: null as string | null,
  } as never;
}

describe('POST /api/buddy/healing-kit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      user: null,
      supabase: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 503 when admin client unavailable', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: null, error: 'no-key' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('Service unavailable');
  });

  it('returns 500 when RPC errors', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(createAdminClient).mockReturnValueOnce(adminMock(null, { message: 'RPC failed' }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to use healing kit');
  });

  it('returns 500 when RPC returns malformed result (zod validation)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    // success is a number, not a boolean — zod should reject
    vi.mocked(createAdminClient).mockReturnValueOnce(adminMock({ success: 1 }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Malformed RPC response');
  });

  it('returns 200 on successful healing-kit use', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(createAdminClient).mockReturnValueOnce(
      adminMock({ success: true, vitality_delta: 10, tokens_delta: 5 })
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.vitality_delta).toBe(10);
    expect(json.tokens_delta).toBe(5);
    expect(json.timezoneUsed).toBe('UTC'); // fallback when profile is null
  });

  it('returns 409 with lastHealingKitAt when already used today (RPC provides timestamp)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(createAdminClient).mockReturnValueOnce(
      adminMock({ success: false, lastHealingKitAt: '2026-07-08T10:00:00Z' })
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.lastHealingKitAt).toBe('2026-07-08T10:00:00Z');
  });

  // 🔧 ARCH fix Round 73 — Finding 7.5: previously lastHealingKitAt was undefined
  // when RPC didn't return it, causing client to skip state update → silent 409 loop
  it('returns 409 with fallback lastHealingKitAt when RPC omits the field (Finding 7.5)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    // RPC returns success=false but no lastHealingKitAt field
    vi.mocked(createAdminClient).mockReturnValueOnce(adminMock({ success: false }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.success).toBe(false);
    // Fallback must be a valid ISO string
    expect(json.lastHealingKitAt).toBeTruthy();
    expect(typeof json.lastHealingKitAt).toBe('string');
    const parsed = new Date(json.lastHealingKitAt);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });

  it('uses user timezone from profile when available', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock('Asia/Shanghai') as never);
    vi.mocked(createAdminClient).mockReturnValueOnce(
      adminMock({ success: true })
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.timezoneUsed).toBe('Asia/Shanghai');
    expect(json.timezoneFetchFailed).toBe(false);
  });

  it('falls back to UTC and sets timezoneFetchFailed when profile fetch throws', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      user: { id: 'user-123' },
      supabase: {
        from: vi.fn(() => { throw new Error('profile fetch network error'); }),
      },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);
    vi.mocked(createAdminClient).mockReturnValueOnce(
      adminMock({ success: true })
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.timezoneUsed).toBe('UTC');
    expect(json.timezoneFetchFailed).toBe(true);
  });
});
