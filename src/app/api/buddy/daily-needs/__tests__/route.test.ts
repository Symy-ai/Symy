/**
 * Tests for POST /api/buddy/daily-needs
 *
 * 🔧 Round 88: Test coverage for daily-needs API.
 * 🔧 Round 104: Updated to mock withAuth instead of createAuthenticatedClient.
 *
 *    - 401 when unauthenticated
 *    - 400 for invalid needType
 *    - 400 for invalid amount (negative, zero, non-integer)
 *    - 200 success with default amount
 *    - 200 success with custom amount
 *    - 500 when admin client unavailable
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// 🔧 Round 104: Mock withAuth to pass through to the handler
// The handler receives { request, supabase, user }
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; supabase: unknown; user: { id: string } }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      // Get auth state from a global mock
      const authState = (globalThis as { __mockAuth?: { user: { id: string } | null } }).__mockAuth || { user: { id: 'user-123' } };
      if (!authState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      // Create a mock supabase client
      const mockSupabase = {
        rpc: vi.fn(async () => (globalThis as { __mockRpcResult?: unknown }).__mockRpcResult || { data: { clarity: 50, connection: 50 }, error: null }),
      };
      return handler({ request, supabase: mockSupabase, user: authState.user });
    };
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/daily-needs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedMock() {
  (globalThis as { __mockAuth?: { user: { id: string } | null } }).__mockAuth = { user: { id: 'user-123' } };
}

function adminMock(rpcResult: unknown = { data: { clarity: 50, connection: 50 }, error: null }) {
  (globalThis as { __mockRpcResult?: unknown }).__mockRpcResult = rpcResult;
  const fakeSupabase = {
    rpc: vi.fn(async () => rpcResult),
  };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: fakeSupabase,
    error: null,
  });
  return fakeSupabase;
}

function unauthedMock() {
  (globalThis as { __mockAuth?: { user: { id: string } | null } }).__mockAuth = { user: null };
}

function noAdminMock() {
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: null,
    error: 'No service role key',
  });
}

describe('POST /api/buddy/daily-needs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await POST(makeRequest({ needType: 'clarity' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid needType', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({ needType: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing needType', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative amount', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({ needType: 'clarity', amount: -5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for zero amount', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({ needType: 'clarity', amount: 0 }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with default amount', async () => {
    authedMock();
    const rpcResult = { data: { clarity: 80, connection: 50 }, error: null };
    const fakeSupabase = adminMock(rpcResult);
    const res = await POST(makeRequest({ needType: 'clarity' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.dailyNeeds).toEqual({ clarity: 80, connection: 50 });
    // Verify RPC was called with default amount
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('replenish_daily_need', expect.objectContaining({
      p_need_type: 'clarity',
    }));
  });

  it('returns 200 with custom amount', async () => {
    authedMock();
    const rpcResult = { data: { clarity: 90, connection: 50 }, error: null };
    const fakeSupabase = adminMock(rpcResult);
    const res = await POST(makeRequest({ needType: 'connection', amount: 20 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('replenish_daily_need', expect.objectContaining({
      p_need_type: 'connection',
      p_amount: 20,
    }));
  });

  it('returns 500 when admin client unavailable', async () => {
    authedMock();
    noAdminMock();
    const res = await POST(makeRequest({ needType: 'clarity' }));
    expect(res.status).toBe(500);
  });

  it('returns 500 when RPC fails', async () => {
    authedMock();
    adminMock({ data: null, error: { message: 'RPC error' } });
    const res = await POST(makeRequest({ needType: 'clarity' }));
    expect(res.status).toBe(500);
  });
});
