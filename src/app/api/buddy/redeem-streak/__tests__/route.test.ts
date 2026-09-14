/**
 * Tests for POST /api/buddy/redeem-streak
 *
 * 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
 *    - Normal redemption: tokens deducted, streak updated
 *    - Insufficient tokens: 400
 *    - CAS race condition: concurrent redemption returns 409
 */

/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
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

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/redeem-streak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mockAuthedClient(supabaseMock: unknown) {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: supabaseMock,
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  });
}

describe('POST /api/buddy/redeem-streak', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: (resp: Response) => resp,
      mergeCookiesOnResponse: (resp: Response) => resp,
      pendingCookies: [],
    });
    const res = await POST(makeRequest({ prevStreak: 5 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when insufficient tokens', async () => {
    mockAuthedClient({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { tokens: 10, streak: 0 }, // Less than STREAK_REDEEM_COST (50)
              error: null,
            })),
          })),
        })),
      })),
    });
    const res = await POST(makeRequest({ prevStreak: 5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/insufficient/i);
  });

  it('successfully redeems streak with CAS update', async () => {
    let updateCallCount = 0;
    mockAuthedClient({
      from: vi.fn(() => {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { tokens: 100, streak: 0 },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    updateCallCount++;
                    return {
                      data: { tokens: 50, streak: 1 }, // CAS succeeded
                      error: null,
                    };
                  }),
                })),
              })),
            })),
          })),
        };
      }),
    });
    const res = await POST(makeRequest({ prevStreak: 5 }));
    expect(res.status).toBe(200);
    expect(updateCallCount).toBe(1);
    const json = await res.json();
    expect(json.tokens).toBe(50);
    expect(json.newStreak).toBe(6); // prevStreak(5) + 1
  });

  it('P1 fix: returns 409 on CAS race condition (concurrent redemption)', async () => {
    // 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
    //    CAS UPDATE returns null data when another concurrent request
    //    already consumed the tokens (tokens < cost after concurrent update).
    //    Route should return 409, not 200.
    mockAuthedClient({
      from: vi.fn(() => {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { tokens: 100, streak: 0 },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: null, // CAS failed — concurrent request already consumed
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }),
    });
    const res = await POST(makeRequest({ prevStreak: 5 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/concurrent/i);
  });
});
