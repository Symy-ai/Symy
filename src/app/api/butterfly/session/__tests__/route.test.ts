/**
 * Integration tests for POST /api/butterfly/session
 *
 * Tests zod validation for the create session endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/features/butterfly/lib/story-engine', () => ({
  generateOutline: vi.fn(),
  isStoryEngineReady: vi.fn(() => true),
}));

vi.mock('@/features/butterfly/lib/illustration-engine', () => ({
  generateMissingIllustrations: vi.fn(),
}));

vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: vi.fn(() => false), // skip backfill by default
  releaseLock: vi.fn(),
}));

vi.mock('@/features/butterfly/lib/db-mappers', () => ({
  dbToSession: vi.fn(() => ({})),
}));

import { POST, GET, DELETE } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/butterfly/session', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeDeleteRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/butterfly/session', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(query: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/butterfly/session');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

function authedMock() {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ error: null })),
          })),
        })),
      })),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/butterfly/session', () => {
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

    const req = makeRequest({ decisionType: 'bought', decisionDescription: 'test' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing decisionDescription', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ decisionType: 'bought' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid decisionType', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ decisionType: 'invalid', decisionDescription: 'test' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // 🔧 2026-07-17 (task 1 fix): considering 应通过 validation (不再被 zod 拒绝)
  //   旧 bug: zod enum 只允许 ['bought', 'resisted'] → considering 模式被拒 → GACHA_UNKNOWN_000
  //   修复: 加 'considering' 到 enum (session/route.ts + demo-session + demo-story + service-inputs.ts)
  it('accepts decisionType "considering" (passes validation, no 400)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ decisionType: 'considering', decisionDescription: 'A $1,099 iPhone 17 Pro', amount: 1099 });
    const res = await POST(req);
    // 不应该返回 400 (validation 通过; 后续可能因 mock 不全返回其他状态, 但绝不是 400 validation error)
    expect(res.status).not.toBe(400);
  });

  it('returns 400 on too long decisionDescription (>500 chars)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ decisionType: 'bought', decisionDescription: 'a'.repeat(501) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on negative amount', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({ decisionType: 'bought', decisionDescription: 'test', amount: -10 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest('not json');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on platform name too long (>50 chars)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeRequest({
      decisionType: 'bought',
      decisionDescription: 'test',
      platform: 'a'.repeat(51),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/butterfly/session', () => {
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

  it('returns 400 on invalid sessionId format (non-UUID)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeGetRequest({ sessionId: 'not-a-uuid' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/butterfly/session', () => {
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

    const req = makeDeleteRequest({ sessionId: '123e4567-e89b-12d3-a456-426614174000' });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing sessionId', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = makeDeleteRequest({});
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const req = new NextRequest('http://localhost/api/butterfly/session', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
