/**
 * Tests for GET/POST /api/user/hourly-rate
 *
 * 🔧 Round 82: Test coverage for hourly-rate API.
 *    - 401 when unauthenticated
 *    - 200 GET returns hourly rate (default 25 if not set)
 *    - 200 POST sets hourly rate
 *    - 400 POST with invalid rate (negative, NaN, non-number)
 *    - 200 GET returns default when profiles.hourly_rate column missing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/letta-agent-manager', () => ({
  syncHourlyRateToAgent: vi.fn(async () => true),
}));

import { GET, POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/user/hourly-rate', { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/user/hourly-rate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedMock(supabaseOverrides: Record<string, unknown> = {}) {
  const fakeSupabase = {
    from: vi.fn(() => fakeSupabase),
    select: vi.fn(() => fakeSupabase),
    eq: vi.fn(() => fakeSupabase),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => fakeSupabase),
    ...supabaseOverrides,
  };

  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: fakeSupabase,
    user: { id: 'user-123' },
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

describe('GET /api/user/hourly-rate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns default 25 when profile has no hourly_rate', async () => {
    authedMock({
      maybeSingle: vi.fn(async () => ({ data: { hourly_rate: null }, error: null })),
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hourlyRate).toBe(25);
    expect(json.default).toBe(true);
    // batch26-b: DB null = 从未设置 → isDefault true (时薪引导胶囊依据)
    expect(json.isDefault).toBe(true);
  });

  it('returns user-set hourly rate when present', async () => {
    authedMock({
      maybeSingle: vi.fn(async () => ({ data: { hourly_rate: 35 }, error: null })),
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hourlyRate).toBe(35);
    expect(json.default).toBe(false);
    // batch26-b: 已自设 → isDefault false (引导不再出现)
    expect(json.isDefault).toBe(false);
  });

  it('returns 500 when DB error (fail-closed, not default)', async () => {
    // 🔧 2026-07-15: Changed from returning default to returning 500
    //    Old behavior masked real DB errors with silent default values
    authedMock({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { message: 'column does not exist', code: '42703' },
      })),
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('POST /api/user/hourly-rate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await POST(makePostRequest({ hourlyRate: 25 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid hourly rate (negative)', async () => {
    authedMock();
    const res = await POST(makePostRequest({ hourlyRate: -5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid hourly rate (NaN)', async () => {
    authedMock();
    const res = await POST(makePostRequest({ hourlyRate: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing hourlyRate field', async () => {
    authedMock();
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 200 when hourly rate is valid', async () => {
    authedMock({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    });
    const res = await POST(makePostRequest({ hourlyRate: 30 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hourlyRate).toBe(30);
  });
});
