/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * Tests for GET /api/user/ritual-status
 *
 * 🔧 2026-07-15: Updated to mock withAuth instead of createAuthenticatedClient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Use a mutable object — vi.mock closure captures this reference
const mockState = {
  user: { id: 'user-123' } as { id: string } | null,
  supabase: null as unknown,
};

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => { // eslint-disable-next-line require-await
      if (!mockState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockState.user, supabase: mockState.supabase });
    };
  },
}));

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/user/ritual-status', { method: 'GET' });
}

function authedMock(lastRitualAt: string | null = null, error: unknown = null) {
  const fakeSupabase = {
    from: vi.fn(() => fakeSupabase),
    select: vi.fn(() => fakeSupabase),
    eq: vi.fn(() => fakeSupabase),
    maybeSingle: vi.fn(async () => ({ // eslint-disable-next-line require-await
      data: lastRitualAt ? { last_ritual_at: lastRitualAt } : null,
      error,
    })),
  };
  // Mutate the existing object — don't reassign
  mockState.user = { id: 'user-123' };
  mockState.supabase = fakeSupabase;
}

function unauthedMock() {
  mockState.user = null;
  mockState.supabase = null;
}

describe('GET /api/user/ritual-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.user = { id: 'user-123' };
    mockState.supabase = null;
  });

  it('returns 401 when not authenticated', async () => {
    unauthedMock();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns shouldShow=true when no prior ritual', async () => {
    authedMock(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shouldShow).toBe(true);
  });

  it('returns shouldShow=false when ritual seen recently (< 5 min)', async () => {
    const recentDate = new Date().toISOString();
    authedMock(recentDate);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shouldShow).toBe(false);
  });

  it('returns shouldShow=true when ritual seen in a previous window', async () => {
    // 🔧 2026-07-15: Route now uses getLimitWindow() (daily window, not 5-min)
    // Use yesterday's date to ensure different window
    const oldDate = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(); // 26h ago = yesterday
    authedMock(oldDate);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shouldShow).toBe(true);
  });

  it('returns 500 when DB error (fail-closed)', async () => {
    authedMock(null, { message: 'column does not exist', code: '42703' });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
