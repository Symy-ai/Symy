/**
 * Tests for GET /api/user/onboarding
 *
 * 🔧 Round 83: Test coverage for onboarding API (GET only).
 *    - 401 when unauthenticated
 *    - 200 returns onboarding_completed status
 *    - 200 returns false when profile has no onboarding_completed
 *    - 200 returns false when DB error (column missing)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({ data: null, error: null })),
      })),
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/user/onboarding', { method: 'GET' });
}

function authedMock(onboardingCompleted: boolean | null = false, error: unknown = null) {
  const fakeSupabase = {
    from: vi.fn(() => fakeSupabase),
    select: vi.fn(() => fakeSupabase),
    eq: vi.fn(() => fakeSupabase),
    maybeSingle: vi.fn(async () => ({
      data: onboardingCompleted === null ? null : { onboarding_completed: onboardingCompleted },
      error,
    })),
  };

  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: fakeSupabase,
    user: { id: 'user-123' },
    error: null,
    mergeCookies: (resp: Response) => resp,
    mergeCookiesOnResponse: (resp: Response) => resp,
  });
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

describe('GET /api/user/onboarding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns onboarding_completed=true when user completed onboarding', async () => {
    authedMock(true);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.onboarding_completed).toBe(true);
  });

  it('returns onboarding_completed=false when user has not completed', async () => {
    authedMock(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.onboarding_completed).toBe(false);
  });

  it('returns onboarding_completed=false when profile not found (null)', async () => {
    authedMock(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.onboarding_completed).toBe(false);
  });

  it('returns 500 when DB error (fail-closed, not false)', async () => {
    // 🔧 2026-07-15: Changed from returning false to returning 500
    authedMock(false, { message: 'column does not exist', code: '42703' });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
