/**
 * Integration tests for DELETE /api/butterfly/sessions/[id]
 *
 * 🔧 ARCH fix Round 77 (Finding 39): Zero tests for destructive delete route.
 * Critical paths:
 *   - 401 when not authenticated
 *   - 400 when session id missing
 *   - 404 when session not found (or doesn't belong to user — RLS)
 *   - 400 when session is active (cannot delete active sessions)
 *   - 500 when pre-check DB query fails
 *   - 200 on successful delete
 *   - 500 when delete returns 0 rows (race condition — session became active)
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

import { DELETE } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/butterfly/sessions/${id}`, { method: 'DELETE' });
}

function authedMock(opts: {
  sessionData?: { id: string; user_id: string; status: string } | null;
  sessionError?: unknown;
  deleteCount?: number;
  deleteError?: unknown;
} = {}) {
  const {
    sessionData = null,
    sessionError = null,
    deleteCount = 1,
    deleteError = null,
  } = opts;

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: sessionData, error: sessionError })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn(async () => ({ error: deleteError, count: deleteCount })),
            })),
          })),
        })),
      })),
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('DELETE /api/butterfly/sessions/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await DELETE(makeRequest('session-123'), { params: Promise.resolve({ id: 'session-123' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when session not found (or does not belong to user — RLS)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({ sessionData: null }) as never,
    );

    const res = await DELETE(makeRequest('nonexistent'), { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when session is active (cannot delete active sessions)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        sessionData: { id: 'session-1', user_id: 'user-123', status: 'active' },
      }) as never,
    );

    const res = await DELETE(makeRequest('session-1'), { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('active');
  });

  it('returns 500 when pre-check DB query fails', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        sessionError: { message: 'Connection lost' },
      }) as never,
    );

    const res = await DELETE(makeRequest('session-1'), { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(500);
  });

  it('returns 200 on successful delete of completed session', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        sessionData: { id: 'session-1', user_id: 'user-123', status: 'completed' },
        deleteCount: 1,
      }) as never,
    );

    const res = await DELETE(makeRequest('session-1'), { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.deleted).toBe(1);
  });

  it('returns 200 on successful delete of abandoned session', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        sessionData: { id: 'session-2', user_id: 'user-123', status: 'abandoned' },
        deleteCount: 1,
      }) as never,
    );

    const res = await DELETE(makeRequest('session-2'), { params: Promise.resolve({ id: 'session-2' }) });
    expect(res.status).toBe(200);
  });

  it('returns 500 when delete returns 0 rows (race condition — session became active)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        sessionData: { id: 'session-1', user_id: 'user-123', status: 'completed' },
        deleteCount: 0, // race: session became active between check and delete
      }) as never,
    );

    const res = await DELETE(makeRequest('session-1'), { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('could not be deleted');
  });

  it('returns 500 on delete DB error', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        sessionData: { id: 'session-1', user_id: 'user-123', status: 'completed' },
        deleteError: { message: 'FK constraint violation' },
      }) as never,
    );

    const res = await DELETE(makeRequest('session-1'), { params: Promise.resolve({ id: 'session-1' }) });
    expect(res.status).toBe(500);
  });
});
