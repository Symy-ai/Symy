/**
 * Integration tests for /api/buddy/gacha-limit (GET + POST)
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

import { GET, POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/buddy/gacha-limit', { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/gacha-limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock(supabaseOverrides: Record<string, unknown> = {}) {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { gacha_pulls_count: 1, gacha_pulls_date: '2026-07-07' },
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ error: null })),
        })),
      })),
      ...supabaseOverrides,
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
      json: <T extends Record<string, unknown>>(data: T, init?: ResponseInit) => NextResponse.json(data, init),
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('GET /api/buddy/gacha-limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      json: <T extends Record<string, unknown>>(data: T, init?: ResponseInit) => NextResponse.json(data, init),
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with gacha limit info on success', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('count');
    expect(json).toHaveProperty('remaining');
    expect(json).toHaveProperty('limit');
    expect(json.limit).toBe(3);
  });
});

describe('POST /api/buddy/gacha-limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: <T>(res: T) => res,
      json: <T extends Record<string, unknown>>(data: T, init?: ResponseInit) => NextResponse.json(data, init),
      mergeCookiesOnResponse: <T>(res: T) => res,
      pendingCookies: [],
    } as never);

    const res = await POST(makePostRequest({ action: 'increment' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing action', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid action (not "increment" or "decrement")', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makePostRequest({ action: 'invalid_action' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makePostRequest('not json'));
    expect(res.status).toBe(400);
  });
});
