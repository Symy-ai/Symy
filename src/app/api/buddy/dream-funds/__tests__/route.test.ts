/**
 * Integration tests for /api/buddy/dream-funds (POST/PATCH/DELETE)
 *
 * Tests zod validation for all 3 methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

import { POST, PATCH } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
/* eslint-disable require-await -- test mocks use async for API consistency */

function makeRequest(body: unknown, method: 'POST' | 'PATCH' = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/buddy/dream-funds', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock() {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            order: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { fund_id: 'df-test', name: 'Test', target: 1000, current: 0, emoji: '🎯' }, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { fund_id: 'df-test', name: 'Test', target: 1000, current: 0, emoji: '🎯' }, error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(),
      })),
      rpc: vi.fn(async () => ({ error: null })),
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/buddy/dream-funds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const req = makeRequest({ name: 'Test', target: 1000 });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing name', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ target: 1000 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty name', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ name: '', target: 1000 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on target below 100', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ name: 'Test', target: 50 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on target above SAVINGS_FUND_TARGET (2_147_483_647 = INT max)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ name: 'Test', target: 3_000_000_000 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-finite target (string)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ name: 'Test', target: 'abc' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest('not json');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on fund_id with SQL injection attempt', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ fund_id: 'df-test; DROP TABLE users; --', name: 'Test', target: 1000 });
    const res = await POST(req);
    // zod regex /^[a-zA-Z0-9_-]+$/ rejects the SQL injection
    expect(res.status).toBe(400);
  });

  it('returns 400 on emoji too long', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ name: 'Test', target: 1000, emoji: 'abcdefghijklmnop' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/buddy/dream-funds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing fund_id', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ name: 'Updated' }, 'PATCH');
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on fund_id with invalid chars', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ fund_id: 'df-test!@#', name: 'Updated' }, 'PATCH');
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on no updates provided', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ fund_id: 'df-test' }, 'PATCH');
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest('not json', 'PATCH');
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});
