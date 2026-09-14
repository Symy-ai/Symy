/**
 * Integration tests for POST /api/butterfly/choice
 *
 * Tests zod validation: UUID sessionId, chapterIndex range, selectedOption length.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

// 🔧 2026-07-15: Mock distributed-lock (rate limiting) — always allow in tests
vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 999 })),
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => {}),
}));

vi.mock('@/features/butterfly/lib/story-engine', () => ({
  regenerateOutline: vi.fn(),
  isStoryEngineReady: vi.fn(() => true),
}));

vi.mock('@/features/butterfly/lib/db-mappers', () => ({
  dbToSession: vi.fn(() => ({})),
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/butterfly/choice', {
    method: 'POST',
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
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })), // session not found
            })),
          })),
        })),
        rpc: vi.fn(async () => ({ data: null, error: null })),
      })),
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/butterfly/choice', () => {
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

    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 1,
      selectedOption: 'A',
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid sessionId (non-UUID)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: 'not-a-uuid',
      chapterIndex: 1,
      selectedOption: 'A',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on chapterIndex = 0 (must be ≥ 1)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 0,
      selectedOption: 'A',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on chapterIndex > 100', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 101,
      selectedOption: 'A',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on chapterIndex = 1.5 (not integer)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 1.5,
      selectedOption: 'A',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on selectedOption too long (>10 chars)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 1,
      selectedOption: 'abcdefghijk',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty selectedOption', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 1,
      selectedOption: '',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing sessionId', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      chapterIndex: 1,
      selectedOption: 'A',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('passes validation with valid input, then returns 404 (session not found in mock)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({
      sessionId: VALID_UUID,
      chapterIndex: 1,
      selectedOption: 'A',
    }));
    // Validation passes, but mock returns null session → 404
    expect(res.status).toBe(404);
  });
});
