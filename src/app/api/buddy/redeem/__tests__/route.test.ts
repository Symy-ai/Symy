/**
 * Integration tests for POST /api/buddy/redeem
 *
 * 🔧 2026-07-21 audit: 新增测试 (该 route 此前零覆盖)。
 *   关键回归测试: redeem 的 UPDATE 必须经 createAdminClient (而非 authenticated client),
 *   因为 migration 111 把 daily_see_it_count/date 列级 GRANT 收归 server-only —— 用
 *   authenticated client 写会 42501 整体失败 (连 tokens 都扣不了), 整个功能在生产是坏的。
 *   见 route.ts 的 2026-07-21 audit fix 注释。
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// --- Mocks -------------------------------------------------------------

// Track which client performed the UPDATE — the core regression assertion.
const authedUpdateSpy = vi.fn();
const adminUpdateSpy = vi.fn();

// withAuth: extract handler, call with mocked { request, supabase, user }.
let mockUser: { id: string } | null = { id: 'user-123' };
let mockBuddyState: { tokens: number | null; daily_see_it_count: number | null; daily_see_it_date: string | null } | null = { tokens: 100, daily_see_it_count: 3, daily_see_it_date: null };
let mockFetchError: { message: string } | null = null;

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; supabase: unknown; user: { id: string } }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      if (!mockUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      // authenticated client — used only for SELECT in redeem.
      const authedSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: mockBuddyState, error: mockFetchError })),
            })),
          })),
          // Track if authenticated client is (wrongly) used for UPDATE.
          update: authedUpdateSpy.mockReturnValue({ eq: vi.fn(() => ({ error: null })) }),
        })),
      };
      return handler({ request, supabase: authedSupabase, user: mockUser });
    };
  },
}));

// createAdminClient — must be used for the UPDATE (migration 111 fix).
let mockAdminError: string | null = null;
let mockAdminUpdateError: { message: string } | null = null;
let mockAdminUpdateData: { tokens: number } | null = { tokens: 80 };
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => ({
        // 🔧 ARCH fix (2026-07-22): CAS chain now includes .gte().select().maybeSingle()
        update: adminUpdateSpy.mockReturnValue({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockAdminUpdateData, error: mockAdminUpdateError })),
              })),
            })),
          })),
        }),
      })),
    },
    error: mockAdminError,
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function resetState() {
  mockUser = { id: 'user-123' };
  mockBuddyState = { tokens: 100, daily_see_it_count: 3, daily_see_it_date: null };
  mockFetchError = null;
  mockAdminError = null;
  mockAdminUpdateError = null;
  mockAdminUpdateData = { tokens: 80 };
  authedUpdateSpy.mockClear();
  adminUpdateSpy.mockClear();
}

describe('POST /api/buddy/redeem', () => {
  beforeEach(resetState);

  it('returns 400 on invalid body (missing/invalid type)', async () => {
    const res = await POST(makeRequest({ type: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when insufficient tokens', async () => {
    mockBuddyState = { tokens: 5, daily_see_it_count: 0, daily_see_it_date: null };
    const res = await POST(makeRequest({ type: 'see_it' })); // costs 20
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/insufficient/i);
    expect(json.cost).toBe(20);
    // Should not have attempted any UPDATE
    expect(adminUpdateSpy).not.toHaveBeenCalled();
  });

  it('redeems see_it successfully and deducts tokens via ADMIN client (migration 111 regression guard)', async () => {
    const res = await POST(makeRequest({ type: 'see_it' })); // costs 20, tokens 100 → 80
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.type).toBe('see_it');
    expect(json.cost).toBe(20);
    expect(json.tokens).toBe(80);

    // 🔑 Core regression assertion: UPDATE went through admin client (createAdminClient),
    //    NOT the authenticated client. If this breaks, the route silently 42501-fails in prod
    //    (migration 111 revoked authenticated UPDATE on daily_see_it_count/date).
    expect(adminUpdateSpy).toHaveBeenCalledTimes(1);
    expect(authedUpdateSpy).not.toHaveBeenCalled();
    // The admin update payload deducts tokens and sets daily_see_it fields.
    const updatePayload = adminUpdateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.tokens).toBe(80);
    expect(updatePayload).toHaveProperty('daily_see_it_count');
    expect(updatePayload).toHaveProperty('daily_see_it_date');
  });

  it('redeems gacha (50 tokens) successfully', async () => {
    mockBuddyState = { tokens: 60, daily_see_it_count: 0, daily_see_it_date: null };
    const res = await POST(makeRequest({ type: 'gacha' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tokens).toBe(10); // 60 - 50
    expect(json.cost).toBe(50);
  });

  it('returns 500 when buddy_state fetch fails', async () => {
    mockFetchError = { message: 'connection refused' };
    const res = await POST(makeRequest({ type: 'see_it' }));
    expect(res.status).toBe(500);
    expect(adminUpdateSpy).not.toHaveBeenCalled();
  });

  it('returns 500 when buddy_state row is missing', async () => {
    mockBuddyState = null;
    const res = await POST(makeRequest({ type: 'see_it' }));
    expect(res.status).toBe(500);
  });

  it('returns 500 when admin client is unavailable', async () => {
    mockAdminError = 'SUPABASE_SERVICE_ROLE_KEY not set';
    const res = await POST(makeRequest({ type: 'see_it' }));
    expect(res.status).toBe(500);
    // Must not fall back to authenticated UPDATE (would 42501 in prod).
    expect(authedUpdateSpy).not.toHaveBeenCalled();
  });

  it('returns 500 when admin UPDATE errors', async () => {
    mockAdminUpdateError = { message: 'violates not-null' };
    const res = await POST(makeRequest({ type: 'see_it' }));
    expect(res.status).toBe(500);
  });

  it('P1 fix: returns 409 on CAS race condition (concurrent redemption)', async () => {
    // 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
    //    CAS UPDATE returns null data when another concurrent request
    //    already consumed the tokens (tokens < cost after concurrent update).
    //    Route should return 409, not 200.
    mockAdminUpdateData = null; // CAS failed — concurrent request already consumed
    const res = await POST(makeRequest({ type: 'see_it' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/concurrent/i);
  });
});
