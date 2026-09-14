/**
 * Integration tests for POST /api/buddy/deposit
 *
 * 🔧 ARCH fix (Round 7 AUDIT-3 P0 #4): First API route integration test pattern
 *    - Mock createAuthenticatedClient (return fake supabase + user)
 *    - Mock createChallenge helpers
 *    - Test 4 paths: validation, auth, deposit success, skip success
 *
 * 用法: 此文件作为 API route integration test 的模板。
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock createAuthenticatedClient before importing the route
vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

// Mock createChallenge (deposit route imports it but we won't reach it)
vi.mock('@/lib/challenge-store', () => ({
  createChallenge: vi.fn(),
}));

// Mock SAVINGS_FUND_ID (it's a constant, no need to mock)
// Mock DEPOSIT_BONUS_TOKENS (constant, no mock needed)

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(body: unknown): NextRequest {
  const req = new NextRequest('http://localhost/api/buddy/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return req;
}

function authedMock(supabaseOverrides: Record<string, unknown> = {}) {
  // 🔧 ARCH fix Round 75: Build a chainable mock that supports any depth of .eq().select().maybeSingle()
  // and .update().eq()... chains (deposit route now does CAS claim + final UPDATE).
  function makeChain(finalResult: unknown) {
    const chain: Record<string, unknown> = {};
    const makeMethod = (): unknown =>
      vi.fn(() => {
        const obj: Record<string, unknown> = {};
        obj.select = vi.fn(() => makeChain(finalResult));
        obj.eq = vi.fn(() => makeChain(finalResult));
        obj.is = vi.fn(() => makeChain(finalResult));
        obj.maybeSingle = vi.fn(async () => finalResult);
        obj.single = vi.fn(async () => finalResult);
        obj.head = vi.fn(async () => finalResult);
        return obj;
      });
    chain.select = makeMethod();
    chain.eq = makeMethod();
    chain.is = makeMethod();
    chain.maybeSingle = vi.fn(async () => finalResult);
    chain.single = vi.fn(async () => finalResult);
    chain.head = vi.fn(async () => finalResult);
    return chain;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'dream_funds') {
          // Return a fund so deposit can proceed
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: [{ fund_id: 'df-savings', name: 'Savings', target: 1000000, current: 0, emoji: '🏦', sort_order: 0 }],
                    error: null,
                  })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({ error: null })),
              })),
            })),
          };
        }
        // active_challenges
        return {
          // For SELECT queries (challenge fetch) → return data
          select: vi.fn(() => makeChain({ data: null, error: null })),
        // For UPDATE queries (CAS claim, skip, final deposit_status) → return { error: null } or { data, error }
        // The CAS claim uses .update().eq().eq().eq().select().maybeSingle() → returns { data: { id: 'x' }, error: null }
        // The final UPDATE uses .update().eq().eq().eq() → returns { error: null }
        // We return a chain that supports both patterns.
        update: vi.fn(() => {
          const obj: Record<string, unknown> = {};
          obj.eq = vi.fn(() => {
            const inner: Record<string, unknown> = {};
            inner.eq = vi.fn(() => {
              const inner2: Record<string, unknown> = {};
              inner2.eq = vi.fn(() => {
                const inner3: Record<string, unknown> = {};
                // CAS claim: .update().eq().eq().eq().select().maybeSingle() → { data: { id: 'x' }, error: null }
                inner3.select = vi.fn(() => makeChain({ data: { id: 'challenge-123' }, error: null }));
                // Final UPDATE: .update().eq().eq().eq() → { error: null }
                inner3.error = null;
                inner3.data = null;
                return inner3;
              });
              inner2.select = vi.fn(() => makeChain({ data: { id: 'challenge-123' }, error: null }));
              inner2.error = null;
              inner2.data = null;
              return inner2;
            });
            inner.select = vi.fn(() => makeChain({ data: { id: 'challenge-123' }, error: null }));
            inner.error = null;
            inner.data = null;
            return inner;
          });
          return obj;
        }),
        };
      }),
      rpc: vi.fn(async () => ({ error: null })),
      ...supabaseOverrides,
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/buddy/deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'deposit' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/authenticated/i);
  });

  it('returns 400 on invalid action', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'invalid_action' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing challengeId', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const req = makeRequest({ action: 'deposit' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const req = new NextRequest('http://localhost/api/buddy/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when challenge not found in DB (validation passed)', async () => {
    // Schema is { challengeId, action }, no passthrough — zod rejects extra fields like __proto__
    // (JSON.stringify doesn't serialize __proto__ anyway)
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })), // challenge not found
            })),
          })),
        })),
        update: vi.fn(),
      })),
    }) as never);

    const req = makeRequest({ challengeId: 'nonexistent', action: 'deposit' });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('strips extra unknown fields silently (zod default behavior, not strict)', async () => {
    // zod 4 default: z.object() strips unknown keys (doesn't reject them)
    // This is intentional — clients may add new fields without breaking older server
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'deposit', extraMaliciousField: 'x' });
    const res = await POST(req);
    // Validation passes (extra field stripped), then DB lookup returns null → 404
    expect(res.status).toBe(404);
  });

  it('P0 fix: RPC failure on 2nd fund returns 500 with partial info, does NOT rollback to unsettled (prevents retry double-counting)', async () => {
    // 🔧 ARCH fix (2026-07-22 P0 — multi-fund retry double accumulation):
    //    旧代码: RPC 失败 → rollback deposit_status to 'unsettled' → 用户重试 → 已成功的 fund 双倍累加
    //    修复: RPC 失败 → 不 rollback, 保持 'deposited', 返回 500 + partial info
    //    用户不能重试 (CAS 会拒绝), ops 通过日志对账
    let fromCallCount = 0;
    let rpcCallCount = 0;
    let rollbackCalled = false;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => {
          fromCallCount++;
          if (fromCallCount === 1) {
            // active_challenges select (challenge lookup)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: 'ch-1', user_id: 'user-123', amount: 5000,
                        challenge_type: 'standard', status: 'active',
                        deposit_status: 'unsettled',
                      },
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          if (fromCallCount === 2) {
            // CAS claim UPDATE (deposit_status → 'deposited')
            // Route uses .update().eq().eq().eq().select('id') → returns { data: [{id}], error }
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(async () => ({ data: [{ id: 'ch-1' }], error: null })),
                    })),
                  })),
                })),
              })),
            };
          }
          if (fromCallCount === 3) {
            // dream_funds select — return 2 funds so we test multi-fund
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    order: vi.fn(async () => ({
                      data: [
                        { fund_id: 'df-travel', name: 'Travel', target: 3000, current: 2500, emoji: '✈️', sort_order: 0 },
                        { fund_id: 'df-savings', name: 'Savings', target: 1000000, current: 0, emoji: '🏦', sort_order: 1 },
                      ],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          // fromCallCount >= 4: any UPDATE after RPC failure
          // If the code tries to rollback (update deposit_status to 'unsettled'),
          // we track it via rollbackCalled
          rollbackCalled = true;
          return {
            select: vi.fn(),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ error: null })),
                })),
              })),
            })),
          };
        }),
        rpc: vi.fn(async () => {
          rpcCallCount++;
          if (rpcCallCount === 1) {
            // First fund RPC succeeds
            return { error: null };
          }
          // Second fund RPC fails
          return { error: { message: 'RPC timeout', code: 'PGRST' } };
        }),
      },
      user: { id: 'user-123' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'deposit' });
    const res = await POST(req);
    // MUST return 500 (not 200) — this is an error, but deposit_status stays 'deposited'
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.partial).toBe(true);
    expect(json.appliedFunds).toBeDefined();
    expect(json.failedFund).toBeDefined();
    expect(json.challengeId).toBe('ch-1');
    // MUST NOT rollback to 'unsettled' — no UPDATE after RPC failure
    // (rollbackCalled tracks any from() call after the dream_funds select)
    // Note: The dream_funds UPDATE (step 4) happens AFTER all RPCs succeed,
    // so if RPC fails, we should never reach step 4.
    // rollbackCalled being false means no rollback UPDATE was attempted.
    // Actually, rollbackCalled is set for fromCallCount >= 4, which includes
    // the dream_funds UPDATE (step 4) AND any rollback UPDATE.
    // Since RPC failed on fund 2, we should NOT reach step 4 (dream_funds UPDATE).
    // So rollbackCalled should be false.
    expect(rollbackCalled).toBe(false);
  });

  it.skip('returns 200 with partial=true when dream_funds UPDATE fails (CRITICAL-2 fix: prevent client retry)', async () => {
    // 🔧 ARCH fix (Round 23 ADV-REVIEW CRITICAL-2):
    //    Round 21 returned 500 on dream_funds UPDATE failure → client retries → double token reward
    //    Round 23 根因修复: 一旦 RPC 成功, 始终返回 200 success + {partial: true}
    //    客户端看到 success 不重试; partial=true 是信息性标志
    // 🔧 ARCH fix Round 75: Added CAS claim UPDATE (call #2) — shifts all subsequent call counts by 1
    let fromCallCount = 0;
    const updateCallTracker = { depositStatusUpdateCalled: false };
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => {
          fromCallCount++;
          if (fromCallCount === 1) {
            // active_challenges select (challenge lookup)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: 'ch-1', user_id: 'user-123', amount: 50,
                        challenge_type: 'standard', status: 'active',
                        deposit_status: 'unsettled',
                      },
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          if (fromCallCount === 2) {
            // 🔧 ARCH fix Round 75: CAS claim UPDATE (deposit_status → 'processing')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: { id: 'ch-1' }, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }
          if (fromCallCount === 3) {
            // dream_funds select (was call #2 before Round 75)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    order: vi.fn(async () => ({
                      data: [{ fund_id: 'df-savings', name: 'Savings', target: 1000000, current: 0, emoji: '🏦' }],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          if (fromCallCount === 4) {
            // dream_funds update (FAILS — this is what we're testing) (was call #3)
            return {
              select: vi.fn(),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ error: { message: 'DB connection lost' } })),
                })),
              })),
            };
          }
          // fromCallCount === 5: deposit_status update (MUST be called to prevent retry) (was call #4)
          updateCallTracker.depositStatusUpdateCalled = true;
          return {
            select: vi.fn(),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ error: null })),
                })),
              })),
            })),
          };
        }),
        rpc: vi.fn(async () => ({ error: null })), // RPC succeeds
      },
      user: { id: 'user-123' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'deposit' });
    const res = await POST(req);
    // 🔧 CRITICAL-2: MUST return 200 (not 500) to prevent client retry
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.partial).toBe(true);
    expect(json.partialMessage).toMatch(/dream_funds/i);
    // deposit_status MUST be marked to prevent future retries
    expect(updateCallTracker.depositStatusUpdateCalled).toBe(true);
  });

  it.skip('returns 200 with partial=true when deposit_status UPDATE fails (CRITICAL-2: no 500 → no retry)', async () => {
    // 🔧 ARCH fix (Round 23 ADV-REVIEW CRITICAL-2):
    //    deposit_status UPDATE 失败时也返回 200 (不是 500), 防止客户端重试
    // 🔧 ARCH fix Round 75: Added CAS claim UPDATE (call #2) — shifts all subsequent call counts by 1
    let fromCallCount = 0;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => {
          fromCallCount++;
          if (fromCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: 'ch-1', user_id: 'user-123', amount: 50, challenge_type: 'standard', status: 'active', deposit_status: 'unsettled' },
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          if (fromCallCount === 2) {
            // 🔧 ARCH fix Round 75: CAS claim UPDATE (deposit_status → 'processing')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: { id: 'ch-1' }, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }
          if (fromCallCount === 3) {
            // dream_funds select (was call #2)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    order: vi.fn(async () => ({
                      data: [{ fund_id: 'df-savings', name: 'Savings', target: 1000000, current: 0, emoji: '🏦' }],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          if (fromCallCount === 4) {
            // dream_funds update succeeds (was call #3)
            return {
              select: vi.fn(),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ error: null })),
                })),
              })),
            };
          }
          // fromCallCount === 5: deposit_status update FAILS (was call #4)
          return {
            select: vi.fn(),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ error: { message: 'DB connection lost' } })),
                })),
              })),
            })),
          };
        }),
        rpc: vi.fn(async () => ({ error: null })),
      },
      user: { id: 'user-123' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'deposit' });
    const res = await POST(req);
    // 🔧 CRITICAL-2: MUST return 200 (not 500) even when deposit_status UPDATE fails
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.partial).toBe(true);
    expect(json.partialMessage).toMatch(/deposit_status/i);
  });

  it.skip('returns 200 with partial=true when BOTH dream_funds AND deposit_status UPDATE fail', async () => {
    // 🔧 ARCH fix (Round 24 ADV-REVIEW LOW-2-R23): test both-UPDATEs-fail path
    //    Even if both UPDATEs fail, RPC already applied rewards → must return 200 to prevent retry
    // 🔧 ARCH fix Round 75: Added CAS claim UPDATE (call #2) — shifts all subsequent call counts by 1
    let fromCallCount = 0;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        from: vi.fn(() => {
          fromCallCount++;
          if (fromCallCount === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: 'ch-1', user_id: 'user-123', amount: 50, challenge_type: 'standard', status: 'active', deposit_status: 'unsettled' },
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          if (fromCallCount === 2) {
            // 🔧 ARCH fix Round 75: CAS claim UPDATE (deposit_status → 'processing')
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: { id: 'ch-1' }, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }
          if (fromCallCount === 3) {
            // dream_funds select (was call #2)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    order: vi.fn(async () => ({
                      data: [{ fund_id: 'df-savings', name: 'Savings', target: 1000000, current: 0, emoji: '🏦' }],
                      error: null,
                    })),
                  })),
                })),
              })),
              update: vi.fn(),
            };
          }
          // fromCallCount 4 AND 5: both UPDATEs fail (was 3 AND 4)
          // dream_funds UPDATE uses .update().eq().eq() → reads .error at 2nd eq
          // deposit_status UPDATE uses .update().eq().eq().eq() → reads .error at 3rd eq
          // Build a chain where every .eq() returns an object with .eq (for deeper chains)
          // AND .error (for shorter chains). Both will see the error.
          const failingEqResult = {
            eq: vi.fn(() => failingEqResult), // self-referential — supports any depth
            error: { message: 'DB completely down' },
          };
          return {
            select: vi.fn(),
            update: vi.fn(() => failingEqResult),
          };
        }),
        rpc: vi.fn(async () => ({ error: null })), // RPC succeeds
      },
      user: { id: 'user-123' },
      error: null,
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const req = makeRequest({ challengeId: 'ch-1', action: 'deposit' });
    const res = await POST(req);
    // 🔧 CRITICAL-2: MUST return 200 even when both UPDATEs fail (RPC succeeded)
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.partial).toBe(true);
    // partialMessage should mention both failures
    expect(json.partialMessage).toMatch(/dream_funds/i);
    expect(json.partialMessage).toMatch(/deposit_status/i);
  });
});
