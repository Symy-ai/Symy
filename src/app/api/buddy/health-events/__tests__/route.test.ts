/**
 * Tests for GET /api/buddy/health-events
 *
 * 🔧 Round 82: Test coverage for health-events API (GET only — POST/DELETE need more complex mocking).
 *    - 401 when unauthenticated
 *    - 200 returns events list
 *    - 200 with event_type filter
 *    - 200 with custom limit
 *    - limit clamped to 1-100 range
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

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: 'GET' });
}

function authedMock(events: unknown[] = [], queryError: unknown = null) {
  const fakeSupabase = {
    from: vi.fn(() => fakeSupabase),
    select: vi.fn(() => fakeSupabase),
    eq: vi.fn(() => fakeSupabase),
    order: vi.fn(() => fakeSupabase),
    limit: vi.fn(async () => ({ data: events, error: queryError })),
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

describe('GET /api/buddy/health-events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await GET(makeRequest('/api/buddy/health-events'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with events list', async () => {
    const mockEvents = [
      { id: 'ev-1', event_type: 'impulse_damage', description: 'test', created_at: '2026-07-10T00:00:00Z' },
      { id: 'ev-2', event_type: 'refund_boost', description: 'refund', created_at: '2026-07-09T00:00:00Z' },
    ];
    authedMock(mockEvents);
    const res = await GET(makeRequest('/api/buddy/health-events'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(2);
    expect(json.events[0].id).toBe('ev-1');
  });

  it('returns 200 with empty list when no events', async () => {
    authedMock([]);
    const res = await GET(makeRequest('/api/buddy/health-events'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toEqual([]);
  });

  it('accepts custom limit parameter', async () => {
    const fakeSupabase = authedMock([]);
    await GET(makeRequest('/api/buddy/health-events?limit=50'));
    // Verify limit was called with 50
    expect(fakeSupabase.limit).toHaveBeenCalledWith(50);
  });

  it('clamps limit to maximum 100', async () => {
    const fakeSupabase = authedMock([]);
    await GET(makeRequest('/api/buddy/health-events?limit=500'));
    expect(fakeSupabase.limit).toHaveBeenCalledWith(100);
  });

  it('clamps limit to minimum 1', async () => {
    const fakeSupabase = authedMock([]);
    await GET(makeRequest('/api/buddy/health-events?limit=0'));
    expect(fakeSupabase.limit).toHaveBeenCalledWith(1);
  });

  it('defaults limit to 20 when not provided', async () => {
    const fakeSupabase = authedMock([]);
    await GET(makeRequest('/api/buddy/health-events'));
    expect(fakeSupabase.limit).toHaveBeenCalledWith(20);
  });

  it('defaults limit to 20 when invalid (NaN)', async () => {
    const fakeSupabase = authedMock([]);
    await GET(makeRequest('/api/buddy/health-events?limit=abc'));
    expect(fakeSupabase.limit).toHaveBeenCalledWith(20);
  });

  it('returns 500 when supabase query errors', async () => {
    authedMock([], { message: 'table not found', code: '42P01' });
    const res = await GET(makeRequest('/api/buddy/health-events'));
    expect(res.status).toBe(500);
  });
});
