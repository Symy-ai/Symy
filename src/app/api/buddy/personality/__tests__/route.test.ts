/**
 * Tests for POST /api/buddy/personality
 *
 * 🔧 Round 89: Test coverage for personality API.
 * 🔧 2026-07-15 (ARCH-10 P0-10): Updated to verify new secure behavior
 *    - 401 when unauthenticated
 *    - 400 for ANY client-supplied body (personality / behaviorProfile rejected)
 *    - 200 only with empty body {} + auto-collected profile from DB
 *    - 500 when admin client unavailable
 *    - 500 when RPC fails
 *    - 200 returns not_ready when totalDays < 7
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// 🔧 2026-07-15: Mock withAuth instead of createAuthenticatedClient
const mockState = { user: { id: 'user-123' } as { id: string } | null };

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      if (!mockState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockState.user, supabase: {} });
    };
  },
}));

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
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
  return new NextRequest('http://localhost/api/buddy/personality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedMock() {
  mockState.user = { id: 'user-123' };
}

/**
 * Mock admin client that simulates collectBehaviorProfile's query chain:
 *   1. profiles.select(created_at).eq(id).maybeSingle() → profile.created_at
 *   2. buddy_state.select(streak, challenges_completed, last_healing_kit_at).eq(user_id).maybeSingle()
 *   3. health_events.select(event_type).eq(user_id).order().limit()
 *   4. chat_messages.select(id, {count}).eq(user_id).eq(role, user)
 * Then awaken_buddy_personality RPC.
 *
 * totalDays is computed from profile.created_at. To make totalDays >= 7, set created_at to 10 days ago.
 */
function adminMock(rpcResult: unknown = { data: 'sage', error: null }, opts?: { totalDays?: number; alreadyAwakened?: boolean }) {
  const totalDays = opts?.totalDays ?? 10;
  const created_at = new Date(Date.now() - totalDays * 24 * 60 * 60 * 1000).toISOString();

  const fakeSupabase = {
    rpc: vi.fn(async () => rpcResult),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { created_at }, error: null })),
            })),
          })),
        };
      }
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                // For collectBehaviorProfile (streak, challenges_completed, last_healing_kit_at)
                // For awakened check (personality, personality_awakened_at)
                data: opts?.alreadyAwakened
                  ? { personality: 'sage', personality_awakened_at: created_at, streak: 5, challenges_completed: 3, last_healing_kit_at: null }
                  : null,
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'health_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        };
      }
      if (table === 'chat_messages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ count: 5, error: null })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: fakeSupabase,
    error: null,
  });
  return fakeSupabase;
}

function unauthedMock() {
  mockState.user = null;
}

function noAdminMock() {
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: null,
    error: 'No service role key',
  });
}

describe('POST /api/buddy/personality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.user = { id: 'user-123' };
  });

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  // 🔧 2026-07-15 (ARCH-10 P0-10): Client can no longer bypass assessment
  it('returns 400 when client supplies personality directly (security fix)', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({ personality: 'sage' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when client supplies behaviorProfile (security fix)', async () => {
    authedMock();
    adminMock();
    const res = await POST(makeRequest({
      behaviorProfile: {
        challengesCompleted: 10,
        challengesFailed: 2,
        petSymyCount: 5,
        gachaCompleted: 3,
        streak: 7,
        reflectionCount: 4,
        totalDays: 999, // attacker tries to bypass 7-day wait
      },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when admin client unavailable', async () => {
    authedMock();
    noAdminMock();
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });

  it('returns 200 with auto-assessed personality (empty body, server collects profile)', async () => {
    authedMock();
    const fakeSupabase = adminMock({ data: 'guardian', error: null }, { totalDays: 30 });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    // Should have called RPC with server-assessed personality
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('awaken_buddy_personality', expect.objectContaining({
      p_user_id: 'user-123',
    }));
  });

  it('returns not_ready when totalDays < 7 (cannot bypass 7-day wait)', async () => {
    authedMock();
    adminMock({ data: 'sage', error: null }, { totalDays: 3 });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.reason).toBe('not_ready');
    expect(body.totalDays).toBe(3);
  });

  it('returns 200 with alreadyAwakened when user has personality_awakened_at', async () => {
    authedMock();
    adminMock({ data: 'sage', error: null }, { totalDays: 30, alreadyAwakened: true });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alreadyAwakened).toBe(true);
  });

  it('returns 500 when RPC fails', async () => {
    authedMock();
    adminMock({ data: null, error: { message: 'RPC not found' } }, { totalDays: 30 });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });
});
