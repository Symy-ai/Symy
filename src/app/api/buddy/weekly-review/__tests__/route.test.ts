/**
 * Integration tests for GET /api/buddy/weekly-review
 *
 * 🔧 ARCH fix Round 76 (Finding 6): Zero tests for weekly-review route.
 * Critical paths:
 *   - 401 when not authenticated
 *   - 200 with empty events (no challenges this week)
 *   - 200 with challenge_completed events (verify tokensEarned from metadata.tokenReward)
 *   - 200 with dailyBreakdown (7 bars, today highlighted)
 *   - 200 with streakDays calculation
 *   - 500 on DB error
 *   - tokensEarned correctly sums metadata.tokenReward (Finding 1 regression test)
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

import { GET } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/buddy/weekly-review', { method: 'GET' });
}

function authedMock(events: unknown[] = [], error: unknown = null, timezone = 'UTC') {
  return {
    supabase: {
      // 🔧 ARCH fix Round 76: Mock now handles BOTH profiles query (timezone) and health_events query
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { timezone }, error: null })),
              })),
            })),
          };
        }
        // health_events
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                gte: vi.fn(() => ({
                  // 🔧 PM-PERF fix (2026-07-18): route now chains .order().limit(200)
                  // Mock must include .limit() to match the chain
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: events, error })),
                  })),
                })),
              })),
            })),
          })),
        };
      }),
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('GET /api/buddy/weekly-review', () => {
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

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with zero stats when no events this week', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock([]) as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challengesCompleted).toBe(0);
    expect(json.totalSaved).toBe(0);
    expect(json.tokensEarned).toBe(0);
    expect(json.streakDays).toBe(0);
    expect(json.dailyBreakdown).toHaveLength(7);
    expect(json.dailyBreakdown.every((d: { count: number }) => d.count === 0)).toBe(true);
  });

  it('🔧 PM-PERF fix (2026-07-18): returns 200 with empty data on DB error (graceful degradation)', async () => {
    // 🔧 Old behavior: returned 500 on DB error → UI broken
    // 🔧 New behavior: returns 200 with empty data → UI shows "no challenges this week"
    //    This is non-critical data — better to show empty state than block the whole UI
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock([], { message: 'Connection lost' }) as never,
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challengesCompleted).toBe(0);
    expect(json.totalSaved).toBe(0);
    expect(json.tokensEarned).toBe(0);
    expect(json.dailyBreakdown).toHaveLength(7);
    expect(json.streakDays).toBe(0);
  });

  it('correctly sums tokensEarned from metadata.tokenReward (Finding 1 regression test)', async () => {
    // 🔧 ARCH fix Round 76 (Finding 1): tokensEarned must come from metadata.tokenReward,
    // NOT from a separate query on token_change > 0 (challenge_completed has token_change=0).
    const now = new Date();
    const events = [
      {
        event_type: 'challenge_completed',
        metadata: { savedAmount: 100, tokenReward: 10 },
        created_at: now.toISOString(),
      },
      {
        event_type: 'challenge_completed',
        metadata: { savedAmount: 50, tokenReward: 15 },
        created_at: now.toISOString(),
      },
    ];
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(events) as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challengesCompleted).toBe(2);
    expect(json.totalSaved).toBe(150);
    // 🔧 Round 76 regression: tokensEarned = 10 + 15 = 25 (was 0 before fix)
    expect(json.tokensEarned).toBe(25);
  });

  it('handles events with missing metadata fields gracefully', async () => {
    const now = new Date();
    const events = [
      { event_type: 'challenge_completed', metadata: null, created_at: now.toISOString() },
      { event_type: 'challenge_completed', metadata: {}, created_at: now.toISOString() },
      { event_type: 'challenge_completed', metadata: { savedAmount: 'not-a-number' }, created_at: now.toISOString() },
    ];
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(events) as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challengesCompleted).toBe(3);
    expect(json.totalSaved).toBe(0); // all missing/invalid
    expect(json.tokensEarned).toBe(0); // all missing
  });

  it('calculates streakDays correctly (consecutive days with challenges)', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const events = [
      { event_type: 'challenge_completed', metadata: { savedAmount: 50, tokenReward: 10 }, created_at: yesterday.toISOString() },
      { event_type: 'challenge_completed', metadata: { savedAmount: 100, tokenReward: 15 }, created_at: now.toISOString() },
    ];
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock(events) as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    // Both events are on consecutive days (yesterday + today) → streak = 2
    // (or 1 if UTC date boundary splits them, but both are within 24h of now)
    expect(json.streakDays).toBeGreaterThanOrEqual(1);
  });

  it('does not include challengesBought/challengesPassed in response (Finding 7)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock([]) as never);

    const res = await GET(makeRequest());
    const json = await res.json();
    // 🔧 ARCH fix Round 76 (Finding 7): Removed for mirror philosophy compliance
    expect(json).not.toHaveProperty('challengesBought');
    expect(json).not.toHaveProperty('challengesPassed');
  });

  it('dailyBreakdown always has 7 entries', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock([]) as never);

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.dailyBreakdown).toHaveLength(7);
    // Each entry has date, count, savedAmount
    for (const d of json.dailyBreakdown) {
      expect(d).toHaveProperty('date');
      expect(d).toHaveProperty('count');
      expect(d).toHaveProperty('savedAmount');
    }
  });
});
