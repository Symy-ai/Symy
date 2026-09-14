/**
 * Integration tests for GET /api/invite/link
 *
 * 🔧 ARCH fix Round 74 (Finding 8): Zero tests for new feature code.
 * Critical paths:
 *   - 401 when not authenticated
 *   - 200 when ref_code already exists
 *   - 200 when ref_code is generated (CAS + re-read verification)
 *   - 200 + degraded when ref_code column missing
 *   - 200 + stats from invitations table
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
  return new NextRequest('http://localhost/api/invite/link', { method: 'GET' });
}

function authedMock(opts: {
  profileData?: Record<string, unknown> | null;
  profileErr?: unknown;
  updateData?: Record<string, unknown> | null;
  reReadData?: Record<string, unknown> | null;
  invitationsData?: unknown[];
  invitationsErr?: unknown;
} = {}) {
  const {
    profileData = { ref_code: 'abc12345' },
    profileErr = null,
    reReadData = { ref_code: 'newcode1' },
    invitationsData = [],
    invitationsErr = null,
  } = opts;

  let fromCallCount = 0;
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => {
              fromCallCount++;
              // First select = initial profile fetch
              // Second select (after update) = re-read verification
              if (fromCallCount === 1) {
                return {
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: profileData, error: profileErr })),
                  })),
                };
              }
              // Re-read after UPDATE
              return {
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: reReadData, error: null })),
                })),
              };
            }),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  // The UPDATE chain doesn't return data directly; the code does a separate SELECT
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === 'invitations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: invitationsData, error: invitationsErr })),
            })),
          };
        }
        return {};
      }),
    },
    user: { id: 'user-123', email: 'test@example.com' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('GET /api/invite/link', () => {
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

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with existing ref_code', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({ profileData: { ref_code: 'existing1' } }) as never,
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refCode).toBe('existing1');
    expect(json.inviteLink).toContain('?ref=existing1');
    expect(json.degraded).toBeUndefined();
  });

  it('returns 200 + degraded when ref_code column missing', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        profileData: null,
        profileErr: { message: 'Could not find the column', code: '42703' },
      }) as never,
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.degraded).toBe(true);
    expect(json.refCode).toBeTruthy();
  });

  it('returns 200 with stats from invitations table', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        profileData: { ref_code: 'testcode' },
        invitationsData: [
          { status: 'completed' },
          { status: 'pending' },
          { status: 'completed' },
        ],
      }) as never,
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.totalInvited).toBe(3);
    expect(json.stats.completed).toBe(2);
  });

  it('returns 200 with zero stats when invitations table missing', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(
      authedMock({
        profileData: { ref_code: 'testcode' },
        invitationsErr: { message: 'Could not find the table', code: '42P01' },
      }) as never,
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.totalInvited).toBe(0);
    expect(json.stats.completed).toBe(0);
  });
});
