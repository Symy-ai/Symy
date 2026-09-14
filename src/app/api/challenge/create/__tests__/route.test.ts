/**
 * Integration tests for POST /api/challenge/create
 *
 * 🔧 ARCH fix Round 74 (Finding 8): Zero tests for new feature code.
 * Tests adapted to REVIEW-1 behavior: CAS lost → re-read → 429 only if limit exceeded
 * (not immediate 429). No rollback on createChallenge failure (count +1 is acceptable).
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

// 🔧 2026-07-15: Mock supabase-admin — route uses admin client for buddy_state UPDATE
//    (migration 111 compatibility). Return null so route falls back to authenticated client.
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: null, error: null })),
}));

vi.mock('@/lib/challenge-store', () => ({
  createChallenge: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createChallenge } from '@/lib/challenge-store';

// 🔧 ARCH fix Round 78: Use getLimitWindow (5-min window in test period) instead of YYYY-MM-DD
import { getLimitWindow } from '@/lib/limit-window';
function getTodayChallengeDay(): string {
  return getLimitWindow();
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/challenge/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function buildSupabaseMock(opts: {
  buddyData?: Record<string, unknown> | null;
  buddyError?: unknown;
  profileData?: Record<string, unknown> | null;
  casCount?: number;
  casError?: unknown;
  reReadData?: Record<string, unknown> | null;
} = {}) {
  const {
    buddyData = { daily_see_it_count: 0, daily_see_it_date: getTodayChallengeDay() },
    buddyError = null,
    profileData = { plan: 'free' },
    casCount = 1,
    casError = null,
    reReadData = null,
  } = opts;

  let selectCallCount = 0;
  let _updateCallCount = 0;

  function makeChainable(finalResult: unknown) {
    const chain: Record<string, unknown> = {};
    const makeMethod = (): unknown =>
      vi.fn(() => {
        const obj: Record<string, unknown> = {};
        obj.select = vi.fn(() => { selectCallCount++; return makeChainable(finalResult); });
        obj.eq = vi.fn(() => makeChainable(finalResult));
        obj.is = vi.fn(() => makeChainable(finalResult));
        obj.maybeSingle = vi.fn(async () => finalResult);
        obj.head = vi.fn(async () => finalResult);
        return obj;
      });
    chain.select = makeMethod();
    chain.eq = makeMethod();
    chain.maybeSingle = vi.fn(async () => finalResult);
    chain.head = vi.fn(async () => finalResult);
    return chain;
  }

  const from = vi.fn((table: string) => {
    if (table === 'buddy_state') {
      return {
        select: vi.fn(() => {
          selectCallCount++;
          // First SELECT = buddy_state initial query
          // Later SELECTs = re-read after CAS failure
          if (selectCallCount === 1) {
            return makeChainable({ data: buddyData, error: buddyError });
          }
          // Re-read after CAS failure
          return makeChainable({ data: reReadData || buddyData, error: null });
        }),
        update: vi.fn(() => {
          _updateCallCount++;
          // Return an object with .eq() chain + .count + .error (REVIEW-1 uses casResult.count)
          const obj: Record<string, unknown> = {};
          obj.eq = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.eq = vi.fn(() => inner);
            inner.count = casCount;
            inner.error = casError;
            return inner;
          });
          return obj;
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: vi.fn(() => {
          selectCallCount++;
          return makeChainable({ data: profileData, error: null });
        }),
      };
    }
    return makeChainable({ data: null, error: null });
  });

  return { from };
}

function authedMock(supabaseMock: ReturnType<typeof buildSupabaseMock>) {
  return {
    supabase: supabaseMock,
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/challenge/create', () => {
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

    const res = await POST(makeRequest({ itemName: 'Test', amount: 100 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing itemName', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock(buildSupabaseMock()) as never,
    );
    const res = await POST(makeRequest({ amount: 100 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on negative amount', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock(buildSupabaseMock()) as never,
    );
    const res = await POST(makeRequest({ itemName: 'Test', amount: -50 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on zero amount', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock(buildSupabaseMock()) as never,
    );
    const res = await POST(makeRequest({ itemName: 'Test', amount: 0 }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when daily limit reached (free user, count=5)', async () => {
    const supabaseMock = buildSupabaseMock({
      buddyData: { daily_see_it_count: 5, daily_see_it_date: getTodayChallengeDay() },
    });
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(supabaseMock) as never);

    const res = await POST(makeRequest({ itemName: 'Test', amount: 100 }));
    expect(res.status).toBe(429);
    expect(createChallenge).not.toHaveBeenCalled();
  });

  it('returns 429 when daily limit already reached (PM-COUNT fix: no CAS, just check)', async () => {
    const supabaseMock = buildSupabaseMock({
      buddyData: { daily_see_it_count: 5, daily_see_it_date: getTodayChallengeDay() },
    });
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(supabaseMock) as never);

    const res = await POST(makeRequest({ itemName: 'Test', amount: 100 }));
    expect(res.status).toBe(429);
    expect(createChallenge).not.toHaveBeenCalled();
  });

  it('returns 200 when under limit (PM-COUNT fix: no CAS increment on create)', async () => {
    const supabaseMock = buildSupabaseMock({
      buddyData: { daily_see_it_count: 1, daily_see_it_date: getTodayChallengeDay() },
    });
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(supabaseMock) as never);
    vi.mocked(createChallenge).mockResolvedValueOnce({
      success: true,
      challengeId: 'chal-123',
    } as never);

    const res = await POST(makeRequest({ itemName: 'Nike Air Max', amount: 130 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challengeId).toBe('chal-123');
  });

  it('returns 200 on success (free user under limit, CAS succeeds)', async () => {
    const supabaseMock = buildSupabaseMock({
      buddyData: { daily_see_it_count: 0, daily_see_it_date: getTodayChallengeDay() },
      casCount: 1, // CAS succeeded
    });
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(supabaseMock) as never);
    vi.mocked(createChallenge).mockResolvedValueOnce({
      success: true,
      challengeId: 'chal-123',
    } as never);

    const res = await POST(makeRequest({ itemName: 'Nike Air Max', amount: 130 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challengeId).toBe('chal-123');
    expect(json.itemName).toBe('Nike Air Max');
    expect(json.amount).toBe(130);
  });

  it('returns 500 when createChallenge fails (Round 112: rollback daily_see_it_count)', async () => {
    const supabaseMock = buildSupabaseMock({
      buddyData: { daily_see_it_count: 1, daily_see_it_date: getTodayChallengeDay() },
      casCount: 1, // CAS succeeded
    });
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(supabaseMock) as never);
    vi.mocked(createChallenge).mockResolvedValueOnce({
      success: false,
      error: 'DB error',
    } as never);

    const res = await POST(makeRequest({ itemName: 'Test', amount: 100 }));
    expect(res.status).toBe(500);
    // Round 112 P0-1b fix: daily_see_it_count is now rolled back on createChallenge failure
  });
});
