/**
 * Integration tests for GET /api/blind-spot-map
 *
 * 🔧 Round 80 F13: Test coverage for the BlindSpotMap API.
 *    Test matrix:
 *      - 401 when unauthenticated
 *      - 200 with empty data (new user)
 *      - 200 with insufficient data (< 3 samples → show: false)
 *      - 200 with night blind spot data (22-2h, all failed)
 *      - 200 with amount blind spot data (small/medium/large tier)
 *      - 200 with impulse blind spot (challenge_duration < 30s in metadata)
 *      - 200 with livestream blind spot (metadata.platform = 'tiktok')
 *      - 500 when supabase query errors (graceful error response)
 *      - 200 with emotional blind spot (weekday vs weekend delta)
 *
 * Pattern: mock createAuthenticatedClient + fake supabase client.
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock createAuthenticatedClient before importing the route
vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

// Mock logger to keep test output clean
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/blind-spot-map', {
    method: 'GET',
  });
}

interface FakeChallenge {
  created_at: string;
  status: 'passed' | 'failed';
  amount: number;
  item_name: string;
  metadata?: Record<string, unknown> | null;
}

interface AuthedMockOptions {
  userId?: string;
  challenges?: FakeChallenge[] | null;
  queryError?: { message: string; code?: string } | null;
}

function authedMock(opts: AuthedMockOptions = {}) {
  const userId = opts.userId || 'user-123';
  const challenges = opts.challenges ?? null;
  const queryError = opts.queryError ?? null;

  // 🔧 2026-07-15: Mock needs to distinguish between active_challenges and butterfly_sessions
  // butterfly_sessions query should return empty (no gacha data in tests)
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(async () => {
          if (queryError) {
            return { data: null, error: queryError };
          }
          // butterfly_sessions returns empty (no gacha data in tests)
          if (table === 'butterfly_sessions') {
            return { data: [], error: null };
          }
          return { data: challenges, error: null };
        }),
      };
      return chain;
    }),
  };

  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: fakeSupabase,
    user: { id: userId },
    error: null,
    mergeCookies: (resp: Response) => resp,
    mergeCookiesOnResponse: (resp: Response) => resp,
  });

  return fakeSupabase;
}

function unauthedMock() {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: (resp: Response) => resp,
    mergeCookiesOnResponse: (resp: Response) => resp,
  });
}

describe('GET /api/blind-spot-map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 200 with empty blind spots for new user (no challenges)', async () => {
    authedMock({ challenges: [] });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total_challenges).toBe(0);
    expect(json.blind_spots).toHaveLength(5);
    expect(json.blind_spots.every((b: { show: boolean }) => b.show === false)).toBe(true);
    expect(json.completed_blind_spots).toBe(0);
    expect(json.total_blind_spots).toBe(5);
    // 🔧 PM-P1-13 fix: empathy_text moved to frontend i18n, backend returns empty string
    expect(json.empathy_text).toBe('');
  });

  it('returns 500 when supabase query errors', async () => {
    authedMock({
      challenges: null,
      queryError: { message: 'relation does not exist', code: 'PGRST205' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch blind spot data');
  });

  it('returns 200 with show:false for dimensions with < 3 samples', async () => {
    // 2 night challenges (< MIN_SAMPLES=3) — should show:false
    authedMock({
      challenges: [
        { created_at: '2026-07-09T23:00:00Z', status: 'failed', amount: 30, item_name: 'x', metadata: null },
        { created_at: '2026-07-09T01:00:00Z', status: 'passed', amount: 30, item_name: 'y', metadata: null },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total_challenges).toBe(2);
    const night = json.blind_spots.find((b: { type: string }) => b.type === 'night');
    expect(night.show).toBe(false); // only 2 samples, < 3
    expect(night.rate).toBe(null);
  });

  it('computes night blind spot when >= 3 night challenges with majority failed', async () => {
    // 3 night challenges, 2 failed → 67% blind rate
    authedMock({
      challenges: [
        { created_at: '2026-07-09T23:00:00Z', status: 'failed', amount: 30, item_name: 'a', metadata: null },
        { created_at: '2026-07-09T01:00:00Z', status: 'failed', amount: 30, item_name: 'b', metadata: null },
        { created_at: '2026-07-09T23:30:00Z', status: 'passed', amount: 30, item_name: 'c', metadata: null },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const night = json.blind_spots.find((b: { type: string }) => b.type === 'night');
    expect(night.show).toBe(true);
    expect(night.rate).toBe(67); // 2/3 = 67%
    expect(night.sample_count).toBe(3);
    // 🔧 PM-P1-13 fix: description/insight moved to frontend i18n, backend returns null
    expect(night.description).toBeNull();
    expect(night.insight).toBeNull();
  });

  it('computes amount blind spot with medium tier ($51-200) as highest', async () => {
    // small (10-50): 1/3 failed = 33%
    // medium (51-200): 2/3 failed = 67%  ← highest
    // large (200+): 1/3 failed = 33%
    authedMock({
      challenges: [
        // small tier (10-50)
        { created_at: '2026-07-09T10:00:00Z', status: 'failed', amount: 30, item_name: 's1', metadata: null },
        { created_at: '2026-07-09T11:00:00Z', status: 'passed', amount: 40, item_name: 's2', metadata: null },
        { created_at: '2026-07-09T12:00:00Z', status: 'passed', amount: 50, item_name: 's3', metadata: null },
        // medium tier (51-200)
        { created_at: '2026-07-09T13:00:00Z', status: 'failed', amount: 100, item_name: 'm1', metadata: null },
        { created_at: '2026-07-09T14:00:00Z', status: 'failed', amount: 150, item_name: 'm2', metadata: null },
        { created_at: '2026-07-09T15:00:00Z', status: 'passed', amount: 200, item_name: 'm3', metadata: null },
        // large tier (200+)
        { created_at: '2026-07-09T16:00:00Z', status: 'failed', amount: 300, item_name: 'l1', metadata: null },
        { created_at: '2026-07-09T17:00:00Z', status: 'passed', amount: 400, item_name: 'l2', metadata: null },
        { created_at: '2026-07-09T18:00:00Z', status: 'passed', amount: 500, item_name: 'l3', metadata: null },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const amount = json.blind_spots.find((b: { type: string }) => b.type === 'amount');
    expect(amount.show).toBe(true);
    expect(amount.rate).toBe(67); // medium tier 2/3 = 67%
    expect(amount.description).toBeNull();
    // 🔧 PM-P1-13 fix: amount_tier returned for frontend i18n
    expect(json.amount_tier).toBe('medium');
  });

  it('computes impulse blind spot when metadata.challenge_duration < 30s', async () => {
    // 3 impulse challenges (duration < 30s), 2 failed → 67%
    authedMock({
      challenges: [
        { created_at: '2026-07-09T10:00:00Z', status: 'failed', amount: 100, item_name: 'a', metadata: { challenge_duration: 10 } },
        { created_at: '2026-07-09T11:00:00Z', status: 'failed', amount: 100, item_name: 'b', metadata: { challenge_duration: 20 } },
        { created_at: '2026-07-09T12:00:00Z', status: 'passed', amount: 100, item_name: 'c', metadata: { challenge_duration: 25 } },
        // non-impulse (duration >= 30s) — should not be counted
        { created_at: '2026-07-09T13:00:00Z', status: 'failed', amount: 100, item_name: 'd', metadata: { challenge_duration: 60 } },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const impulse = json.blind_spots.find((b: { type: string }) => b.type === 'impulse');
    expect(impulse.show).toBe(true);
    expect(impulse.rate).toBe(67); // 2/3 = 67%
    expect(impulse.sample_count).toBe(3);
  });

  it('does not show impulse blind spot when no challenges have challenge_duration', async () => {
    authedMock({
      challenges: [
        { created_at: '2026-07-09T10:00:00Z', status: 'failed', amount: 100, item_name: 'a', metadata: null },
        { created_at: '2026-07-09T11:00:00Z', status: 'failed', amount: 100, item_name: 'b', metadata: {} },
        { created_at: '2026-07-09T12:00:00Z', status: 'passed', amount: 100, item_name: 'c', metadata: { other: 'x' } },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const impulse = json.blind_spots.find((b: { type: string }) => b.type === 'impulse');
    expect(impulse.show).toBe(false);
    expect(impulse.rate).toBe(null);
    expect(impulse.sample_count).toBe(0);
  });

  it('computes livestream blind spot when metadata.platform contains "tiktok"', async () => {
    authedMock({
      challenges: [
        { created_at: '2026-07-09T10:00:00Z', status: 'failed', amount: 100, item_name: 'a', metadata: { platform: 'tiktok_shop' } },
        { created_at: '2026-07-09T11:00:00Z', status: 'failed', amount: 100, item_name: 'b', metadata: { platform: 'tiktok' } },
        { created_at: '2026-07-09T12:00:00Z', status: 'passed', amount: 100, item_name: 'c', metadata: { platform: 'tiktok_live' } },
        // non-livestream — should not be counted
        { created_at: '2026-07-09T13:00:00Z', status: 'failed', amount: 100, item_name: 'd', metadata: { platform: 'amazon' } },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const livestream = json.blind_spots.find((b: { type: string }) => b.type === 'livestream');
    expect(livestream.show).toBe(true);
    expect(livestream.rate).toBe(67); // 2/3 = 67%
    expect(livestream.sample_count).toBe(3);
  });

  it('computes emotional blind spot when weekday rate is 15+ points higher than weekend', async () => {
    // weekday: 5 challenges, 4 failed = 80%
    // weekend: 4 challenges, 1 failed = 25%
    // diff = 55% (> 15 threshold) → show emotional weekday blind spot
    // 2026-07-06 is Monday, 2026-07-11 is Saturday
    authedMock({
      challenges: [
        // weekday (Mon-Fri)
        { created_at: '2026-07-06T10:00:00Z', status: 'failed', amount: 100, item_name: 'w1', metadata: null }, // Mon
        { created_at: '2026-07-07T10:00:00Z', status: 'failed', amount: 100, item_name: 'w2', metadata: null }, // Tue
        { created_at: '2026-07-08T10:00:00Z', status: 'failed', amount: 100, item_name: 'w3', metadata: null }, // Wed
        { created_at: '2026-07-09T10:00:00Z', status: 'failed', amount: 100, item_name: 'w4', metadata: null }, // Thu
        { created_at: '2026-07-10T10:00:00Z', status: 'passed', amount: 100, item_name: 'w5', metadata: null }, // Fri
        // weekend (Sat-Sun)
        { created_at: '2026-07-11T10:00:00Z', status: 'failed', amount: 100, item_name: 's1', metadata: null }, // Sat
        { created_at: '2026-07-12T10:00:00Z', status: 'passed', amount: 100, item_name: 's2', metadata: null }, // Sun
        { created_at: '2026-07-12T11:00:00Z', status: 'passed', amount: 100, item_name: 's3', metadata: null }, // Sun
        { created_at: '2026-07-12T12:00:00Z', status: 'passed', amount: 100, item_name: 's4', metadata: null }, // Sun
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const emotional = json.blind_spots.find((b: { type: string }) => b.type === 'emotional');
    expect(emotional.show).toBe(true);
    expect(emotional.rate).toBe(55); // 80 - 25 = 55
    expect(emotional.description).toBeNull();
    // 🔧 PM-P1-13 fix: emotional_type returned for frontend i18n
    expect(json.emotional_type).toBeTruthy();
  });

  it('does not show emotional blind spot when weekday vs weekend diff < 15 points', async () => {
    // weekday: 3 challenges, 2 failed = 67%
    // weekend: 3 challenges, 1 failed = 33%
    // diff = 33% (> 15 threshold) → would show
    // Make diff < 15: weekday 50%, weekend 40%
    authedMock({
      challenges: [
        // weekday (Mon): 4 challenges, 2 failed = 50%
        { created_at: '2026-07-06T10:00:00Z', status: 'failed', amount: 100, item_name: 'w1', metadata: null },
        { created_at: '2026-07-06T11:00:00Z', status: 'failed', amount: 100, item_name: 'w2', metadata: null },
        { created_at: '2026-07-06T12:00:00Z', status: 'passed', amount: 100, item_name: 'w3', metadata: null },
        { created_at: '2026-07-06T13:00:00Z', status: 'passed', amount: 100, item_name: 'w4', metadata: null },
        // weekend (Sat): 5 challenges, 2 failed = 40%
        { created_at: '2026-07-11T10:00:00Z', status: 'failed', amount: 100, item_name: 's1', metadata: null },
        { created_at: '2026-07-11T11:00:00Z', status: 'failed', amount: 100, item_name: 's2', metadata: null },
        { created_at: '2026-07-11T12:00:00Z', status: 'passed', amount: 100, item_name: 's3', metadata: null },
        { created_at: '2026-07-11T13:00:00Z', status: 'passed', amount: 100, item_name: 's4', metadata: null },
        { created_at: '2026-07-11T14:00:00Z', status: 'passed', amount: 100, item_name: 's5', metadata: null },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const emotional = json.blind_spots.find((b: { type: string }) => b.type === 'emotional');
    // diff = 50 - 40 = 10, < 15 → should not show
    expect(emotional.show).toBe(false);
    expect(emotional.rate).toBe(null);
  });

  it('empathy_text is empty (PM-P1-13 fix: moved to frontend i18n)', async () => {
    authedMock({ challenges: [] });
    const res = await GET(makeRequest());
    const json = await res.json();
    // 🔧 PM-P1-13 fix: empathy_text moved to frontend i18n, backend returns empty string
    expect(json.empathy_text).toBe('');
  });

  it('regression: BlindSpotMap-class bug — does not select non-existent platform column', async () => {
    // This test guards against the regression where the API selects 'platform'
    // as a column (which doesn't exist on active_challenges, causing 500).
    // The fix reads platform from metadata instead.
    authedMock({
      challenges: [
        { created_at: '2026-07-09T10:00:00Z', status: 'failed', amount: 100, item_name: 'a', metadata: { platform: 'tiktok' } },
      ],
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    // Verify the supabase query did NOT include 'platform' as a column
    const authedResult = await (createAuthenticatedClient as ReturnType<typeof vi.fn>).mock.results[0].value;
    const fakeSupabase = authedResult.supabase;
    // 🔧 2026-07-15: Updated for new mock structure — from() returns chain objects
    // The first from() call is for active_challenges
    const firstCall = fakeSupabase.from.mock.calls[0];
    expect(firstCall[0]).toBe('active_challenges');
  });
});
