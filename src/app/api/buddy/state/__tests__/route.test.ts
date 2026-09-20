/**
 * Integration tests for GET/PUT /api/buddy/state
 *
 * 🔧 ARCH fix Round 77 (Finding 39): buddy/state route had ZERO tests.
 * This is the most critical route — called on every app load + every buddy state push.
 *
 * Critical paths:
 *   GET:
 *     - 401 when not authenticated
 *     - 200 with buddyState when data exists
 *     - 200 with buddyState: null when no row (first-time user)
 *     - 500 on DB error (not 200 + null — Round 11 H6 fix)
 *     - 500 on dream_funds table query failure (no JSONB fallback — Round 12 DB-13 fix)
 *   PUT:
 *     - 401 when not authenticated
 *     - 400 on invalid body (missing required fields)
 *     - 200 on successful CAS update (version bump)
 *     - 409 on version mismatch (CAS conflict)
 *     - 200 on first-time upsert (version=1)
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

import { GET, PUT } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/buddy/state', { method: 'GET' });
}

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock(supabaseOverrides: Record<string, unknown> = {}) {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      ...supabaseOverrides,
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

function unauthedMock() {
  return {
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('GET /api/buddy/state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(unauthedMock() as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with buddyState: null when no row (first-time user)', async () => {
    const authed = authedMock();
    // buddy_state returns null (no row), dream_funds returns empty
    authed.supabase.from = vi.fn((table: string) => {
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === 'dream_funds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }
      if (table === 'invitations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ count: 0, error: null })),
            })),
          })),
        };
      }
      return {};
    }) as never;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authed as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.buddyState).toBeNull();
  });

  it('returns 200 with buddyState when data exists', async () => {
    const authed = authedMock();
    const buddyStateRow = {
      vitality: 80, tokens: 200, health: 'healthy', level: 5, xp: 50, xp_to_next: 100,
      streak: 7, dream_funds: [], badges: ['first_save'], total_saved: 500,
      challenges_completed: 10, last_drain_at: '2026-07-01T00:00:00Z',
      last_healing_kit_at: null, updated_at: '2026-07-08T00:00:00Z', version: 3,
    };
    authed.supabase.from = vi.fn((table: string) => {
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: buddyStateRow, error: null })),
            })),
          })),
        };
      }
      if (table === 'dream_funds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [
                { fund_id: 'df-1', name: 'Savings', target: 10000, current: 500, emoji: '🏦', sort_order: 0 },
              ], error: null })),
            })),
          })),
        };
      }
      if (table === 'invitations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ count: 3, error: null })),
            })),
          })),
        };
      }
      return {};
    }) as never;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authed as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.buddyState).not.toBeNull();
    expect(json.buddyState.vitality).toBe(80);
    expect(json.buddyState.tokens).toBe(200);
    expect(json.buddyState.version).toBe(3);
    expect(json.buddyState.invitedCount).toBe(3);
    expect(json.buddyState.dreamFunds).toHaveLength(1);
    expect(json.buddyState.dreamFunds[0].id).toBe('df-1');
  });

  it('returns 500 on DB error (not 200 + null — Round 11 H6 fix)', async () => {
    const authed = authedMock();
    authed.supabase.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'RLS denied', code: '42501' } })),
        })),
      })),
    })) as never;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authed as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to load');
  });

  it('returns 500 on dream_funds table query failure (no JSONB fallback — Round 12 DB-13 fix)', async () => {
    const authed = authedMock();
    authed.supabase.from = vi.fn((table: string) => {
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { vitality: 80, tokens: 200, version: 1 }, error: null })),
            })),
          })),
        };
      }
      if (table === 'dream_funds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: null, error: { message: 'Connection lost' } })),
            })),
          })),
        };
      }
      return {};
    }) as never;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authed as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('dream funds');
  });
});

describe('PUT /api/buddy/state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(unauthedMock() as never);
    const res = await PUT(makePutRequest({ buddyState: {}, version: 1 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (missing buddyState)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await PUT(makePutRequest({ version: 1 }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful CAS update (version bump)', async () => {
    const authed = authedMock();
    authed.supabase.from = vi.fn((table: string) => {
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { version: 2 }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { version: 3, vitality: 90 }, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }) as never;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authed as never);

    const res = await PUT(makePutRequest({
      buddyState: { vitality: 90, tokens: 200, health: 'healthy', level: 5, xp: 50, xpToNext: 100, streak: 7, dreamFunds: [], badges: [], totalSaved: 500, challengesCompleted: 10, lastDrainAt: '2026-07-01T00:00:00Z', version: 2 },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.version).toBe(3);
  });

  it('returns 409 on version mismatch (CAS conflict)', async () => {
    const authed = authedMock();
    authed.supabase.from = vi.fn((table: string) => {
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { version: 5 }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })), // 0 rows = CAS failed
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }) as never;
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authed as never);

    const res = await PUT(makePutRequest({
      buddyState: { vitality: 90, tokens: 200, health: 'healthy', level: 5, xp: 50, xpToNext: 100, streak: 7, dreamFunds: [], badges: [], totalSaved: 500, challengesCompleted: 10, lastDrainAt: '2026-07-01T00:00:00Z', version: 2 }, // client expects version=2, CAS fails → 409
    }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.conflict).toBe(true);
  });
});
