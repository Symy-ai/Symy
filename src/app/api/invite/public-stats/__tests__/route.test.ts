import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const maybeSingle = vi.fn();
const profileEq = vi.fn();
const profilesSelect = vi.fn(() => ({ eq: profileEq }));
const challengeEq = vi.fn();
const challengeResult = { count: 37, error: null };
const challengeSelect = vi.fn(() => ({
  eq: challengeEq,
  ...challengeResult,
}));
const buddyStateMaybeSingle = vi.fn();
const buddyStateEq = vi.fn();
const buddyStateSelect = vi.fn(() => ({ eq: buddyStateEq }));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

import { GET } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';

function request(ref = 'abcd1234') {
  return new NextRequest(`http://localhost/api/invite/public-stats?ref=${ref}`);
}

function adminClient() {
  return {
    supabase: {
      from: vi.fn((table: string) => table === 'profiles'
        ? { select: profilesSelect }
        : { select: table === 'buddy_state' ? buddyStateSelect : challengeSelect }),
    },
  };
}

describe('GET /api/invite/public-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminClient).mockReturnValue(adminClient() as never);
  });

  it('returns only whitelisted public fields', async () => {
    profileEq.mockReturnValue({ maybeSingle: maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'private-user-id',
        email: 'private@example.com',
        display_name: 'Avery',
        streak: 12.7,
        total_saved: 250,
      },
      error: null,
    }) });
    buddyStateEq.mockReturnValue({ maybeSingle: buddyStateMaybeSingle.mockResolvedValueOnce({
      data: { streak: 12.7, total_saved: 250, tokens: 999 },
      error: null,
    }) });
    challengeSelect.mockReturnValueOnce({ eq: challengeEq, count: 37, error: null });
    challengeEq.mockReturnValueOnce({ eq: vi.fn(() => ({ count: 37, error: null })) });

    const response = await GET(request());
    await expect(response.json()).resolves.toEqual({
      found: true,
      displayName: 'Avery',
      intercepts: 37,
      guardDays: 12,
      freedomHours: 10,
    });
  });

  it.each([
    ['missing ref', () => GET(request(''))],
    ['unknown ref', () => {
      profileEq.mockReturnValue({ maybeSingle: maybeSingle.mockResolvedValueOnce({ data: null, error: null }) });
      return GET(request());
    }],
    ['admin unavailable', () => {
      vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: null, error: 'missing key' } as never);
      return GET(request());
    }],
  ])('returns indistinguishable not-found for %s', async (_name, run) => {
    const response = await run();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ found: false });
  });
});
