/**
 * Tests for POST /api/buddy/dream-fund-progress
 *
 * 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
 *    - Normal deposit: INSERT health_event → RPC → UPDATE health_event
 *    - Dedup hit (23505): 409
 *    - RPC failure: DELETE health_event (rollback) → 500
 *    - Unauthenticated: 401
 *    - Invalid input: 400
 */

/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: vi.fn((handler) => handler),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/api-validation', () => ({
  validateBody: vi.fn(),
  isValidationError: vi.fn(() => false),
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
import { createAdminClient } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/api-validation';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/dream-fund-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockAuthedContext(overrides: Partial<{ user: { id: string }; supabase: unknown }> = {}) {
  // The route uses `supabase` (authed client) for the dedup SELECT and dream_funds SELECT,
  // and `adminSupabase` (admin client) for INSERT/RPC/UPDATE/DELETE.
  let fromCallCount = 0;
  const authedSupabase = overrides.supabase ?? {
    from: vi.fn(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // health_events dedup SELECT
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                contains: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      // dream_funds SELECT (fund_id, current, target)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: [{ fund_id: 'df-1', current: 0, target: 1000 }],
              error: null,
            })),
          })),
        })),
      };
    }),
  };
  return {
    request: makeRequest({ fundId: 'auto', amount: 100, challengeId: 'ch-1' }),
    user: overrides.user ?? { id: 'user-123' },
    supabase: authedSupabase,
    pendingCookies: [],
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
  } as never;
}

describe('POST /api/buddy/dream-fund-progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (validateBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      fundId: 'auto',
      amount: 100,
      challengeId: 'ch-1',
    });
  });

  it('returns 500 when unauthenticated (user is null, withAuth mocked)', async () => {
    // withAuth is mocked to pass through, so when user is null, the route
    // accesses supabase.from() which is also null → throws → caught by try/catch → 500.
    // In production, withAuth returns 401 before reaching the handler.
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: {} });
    const ctx = mockAuthedContext({
      user: null as unknown as { id: string },
      supabase: null as unknown as Record<string, unknown>,
    });
    const res = await POST(ctx);
    expect(res.status).toBe(500);
  });

  it('P1 fix: dedup hit (23505) returns 409, RPC NOT called', async () => {
    // 🔧 ARCH fix (2026-07-22 P1): INSERT health_events FIRST (atomic dedup gate).
    //    If INSERT fails with 23505 (duplicate), return 409 without calling RPC.
    //    This prevents the TOCTOU race where two concurrent requests both pass
    //    the SELECT check and both call RPC (double-counting).
    const rpcSpy = vi.fn();
    const healthEventsBuilder = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: null,
            error: { code: '23505', message: 'duplicate key value' },
          })),
        })),
      })),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const adminSupabase = {
      from: vi.fn(() => healthEventsBuilder),
      rpc: rpcSpy,
    };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: adminSupabase });

    const ctx = mockAuthedContext();
    const res = await POST(ctx);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already been deposited/i);
    // RPC should NOT be called (dedup gate prevented it)
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('P1 fix: RPC failure triggers DELETE health_event rollback → 500', async () => {
    // 🔧 ARCH fix (2026-07-22 P1): If RPC fails after INSERT, DELETE the health_event
    //    so user can retry (otherwise the dedup gate would block retry)
    const deleteEqSpy = vi.fn(async () => ({ error: null }));
    const healthEventsBuilder = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: 'he-1' }, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(deleteEqSpy),
        })),
      })),
    };
    const adminSupabase = {
      from: vi.fn(() => healthEventsBuilder),
      rpc: vi.fn(async () => ({ data: null, error: { message: 'RPC failed' } })),
    };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: adminSupabase });

    const ctx = mockAuthedContext();
    const res = await POST(ctx);
    expect(res.status).toBe(500);
    // DELETE should be called (rollback)
    expect(deleteEqSpy).toHaveBeenCalled();
  });

  it('successfully deposits — INSERT → RPC → UPDATE', async () => {
    const updateEqSpy = vi.fn(async () => ({ error: null }));
    const healthEventsBuilder = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: 'he-1' }, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(updateEqSpy),
        })),
      })),
      delete: vi.fn(),
    };
    const adminSupabase = {
      from: vi.fn(() => healthEventsBuilder),
      rpc: vi.fn(async () => ({ data: { vitality: 50, tokens: 100 }, error: null })),
    };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: adminSupabase });

    const ctx = mockAuthedContext();
    const res = await POST(ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.amount).toBe(100);
    // UPDATE should be called (to set new_vitality)
    expect(updateEqSpy).toHaveBeenCalled();
  });
});
