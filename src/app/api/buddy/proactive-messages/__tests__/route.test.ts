/**
 * Tests for POST /api/buddy/proactive-messages
 *
 * 🔧 Round 88: Test coverage for proactive-messages API.
 * 🔧 Round 104: Updated to mock withAuth instead of createAuthenticatedClient.
 *
 *    - 401 when unauthenticated
 *    - 400 for missing messageId
 *    - 400 for empty messageId
 *    - 500 when admin client unavailable
 *    - 200 success
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; supabase: unknown; user: { id: string } | null }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      const authState = (globalThis as { __mockAuth?: { user: { id: string } | null } }).__mockAuth || { user: { id: 'user-123' } };
      if (!authState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, supabase: {} as unknown, user: authState.user });
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
  return new NextRequest('http://localhost/api/buddy/proactive-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedMock() {
  (globalThis as { __mockAuth?: { user: { id: string } | null } }).__mockAuth = { user: { id: 'user-123' } };
}

function adminMock(rpcResult: unknown = { data: [], error: null }) {
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

describe('POST /api/buddy/proactive-messages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await POST(makeRequest({ messageId: 'msg-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing messageId', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty messageId', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({ messageId: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when admin client unavailable', async () => {
    authedMock();
    noAdminMock();
    const res = await POST(makeRequest({ messageId: 'msg-1' }));
    expect(res.status).toBe(500);
  });

  it('returns 200 on successful mark as read', async () => {
    authedMock();
    const rpcResult = { data: [{ id: 'msg-1', read: true }], error: null };
    const fakeSupabase = adminMock(rpcResult);
    const res = await POST(makeRequest({ messageId: 'msg-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.messages).toEqual([{ id: 'msg-1', read: true }]);
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('mark_proactive_message_read', expect.objectContaining({
      p_message_id: 'msg-1',
    }));
  });

  it('returns 500 when RPC fails', async () => {
    authedMock();
    adminMock({ data: null, error: { message: 'RPC error' } });
    const res = await POST(makeRequest({ messageId: 'msg-1' }));
    expect(res.status).toBe(500);
  });
});
