/**
 * Integration tests for /api/chat/history (GET + POST)
 *
 * Tests zod validation for both query params (GET) and body (POST).
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

import { GET, POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeGetRequest(query: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/chat/history');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock() {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          // For count query (head: true) — returns { count }
          // For data query — chained eq/lt/order/limit
          const chainable = {
            eq: vi.fn(() => chainable),
            lt: vi.fn(() => chainable),
            order: vi.fn(() => chainable),
            limit: vi.fn(async () => ({ data: [], error: null })),
            head: vi.fn(async () => ({ count: 0, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          };
          return chainable;
        }),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: 'msg-1' }, error: null })),
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

describe('GET /api/chat/history', () => {
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

    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with default limit=6 when no query params', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toEqual([]);
    expect(json.totalCount).toBe(0);
    expect(json.hasMore).toBe(false);
  });

  it('accepts limit=10 as valid query param', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest({ limit: '10' });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('rejects limit=0 with 400 (must be >= 1)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest({ limit: '0' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('rejects limit=51 with 400 (must be <= 50)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest({ limit: '51' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('accepts mode=challenge', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest({ mode: 'challenge' });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('rejects mode=invalid', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest({ mode: 'invalid' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat/history', () => {
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

    const req = makePostRequest({ role: 'user', content: 'hi' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing role', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makePostRequest({ content: 'hi' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid role (system)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    // Bug #26 fix: prevent malicious insertion of 'system' role
    const req = makePostRequest({ role: 'system', content: 'hi' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing content', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makePostRequest({ role: 'user' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on content too long (>10000 chars)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makePostRequest({ role: 'user', content: 'a'.repeat(10001) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makePostRequest('not json');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts valid message with reasoning', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makePostRequest({ role: 'user', content: 'hi', reasoning: 'some reasoning' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // 🔧 2026-07-15 P1 fix test: reasoning >5000 chars should now pass (was rejected before fix)
  it('accepts reasoning >5000 chars (GLM-5.2 long reasoning chains)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const longReasoning = 'r'.repeat(6000); // > old limit of 5000, < new limit of 50000
    const req = makePostRequest({ role: 'user', content: 'hi', reasoning: longReasoning });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // 🔧 2026-07-15 P1 fix test: reasoning >50000 chars should still be rejected
  it('rejects reasoning >50000 chars', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const tooLongReasoning = 'r'.repeat(50001);
    const req = makePostRequest({ role: 'user', content: 'hi', reasoning: tooLongReasoning });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts mode=challenge', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makePostRequest({ role: 'user', content: 'hi', mode: 'challenge' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
