/**
 * Tests for GET /api/challenge/limit
 *
 * 🔧 Round 89: Test coverage for challenge limit API.
 *    - 401 when unauthenticated
 *    - 200 returns unlimited for premium user
 *    - 200 returns unlimited when buddy_state has no challenge_count
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
  return new NextRequest('http://localhost/api/challenge/limit', { method: 'GET' });
}

function unauthedMock() {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: (resp: Response) => resp,
  });
}

function authedMock(buddyData: Record<string, unknown> | null, profileData: Record<string, unknown> | null, buddyError: unknown = null) {
  // Each .from() call returns a separate chain, so we need to track which query is which
  let fromCallCount = 0;
  const queryResults = [
    { data: buddyData, error: buddyError },  // buddy_state query (first .from call)
    { data: profileData, error: null },       // profiles query (second .from call)
  ];

  const fakeSupabase = {
    from: vi.fn(() => {
      const result = queryResults[fromCallCount] || { data: null, error: null };
      fromCallCount++;
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => result),
          })),
        })),
      };
    }),
  };

  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: fakeSupabase,
    user: { id: 'user-123' },
    error: null,
    mergeCookies: (resp: Response) => resp,
  });
}

describe('GET /api/challenge/limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with unlimited for premium user', async () => {
    authedMock({ challenge_count: 100, challenge_date: 'test' }, { plan: 'premium' });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isPremium).toBe(true);
  });

  it('returns 200 with unlimited when buddy_state has no challenge_count', async () => {
    authedMock(null, { plan: 'free' });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
    expect(json.isPremium).toBe(false);
  });
});
