/**
 * Integration tests for POST /api/challenge/complete
 *
 * 🔧 ARCH fix Round 77 (Finding 39): Zero tests for challenge/complete route.
 * This route awards tokens + creates health events via MCP handler.
 *
 * Critical paths:
 *   - 401 when not authenticated
 *   - 400 on missing challengeId
 *   - 200 on successful completion (passed)
 *   - 200 on successful completion (failed/bought)
 *   - 500 on MCP handler failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/mcp-tools/handlers/complete_challenge', () => ({
  handleCompleteChallenge: vi.fn(),
}));

vi.mock('@/lib/challenge-rules', () => ({
  getChallengeType: vi.fn(() => 'standard'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { handleCompleteChallenge } from '@/lib/mcp-tools/handlers/complete_challenge';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/challenge/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authedMock() {
  return {
    supabase: {},
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  };
}

describe('POST /api/challenge/complete', () => {
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

    const res = await POST(makeRequest({ challengeId: 'chal-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing challengeId', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest({ status: 'passed' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful completion (passed)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(handleCompleteChallenge).mockResolvedValueOnce({
      success: true,
      result: { challengeId: 'chal-1', savedAmount: 100, tokenReward: 10 },
      message: 'Challenge completed',
    } as never);

    const res = await POST(makeRequest({ challengeId: 'chal-1', status: 'passed' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.challengeId).toBe('chal-1');
    expect(json.result.savedAmount).toBe(100);
  });

  it('returns 200 on successful completion (failed/bought)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(handleCompleteChallenge).mockResolvedValueOnce({
      success: true,
      result: { challengeId: 'chal-2', savedAmount: 0, tokenReward: 0 },
      message: 'Challenge completed',
    } as never);

    const res = await POST(makeRequest({ challengeId: 'chal-2', status: 'failed' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 400 on MCP handler failure (not 500 — handler returns structured error)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    vi.mocked(handleCompleteChallenge).mockResolvedValueOnce({
      success: false,
      message: 'Challenge not found',
    } as never);

    const res = await POST(makeRequest({ challengeId: 'chal-1', status: 'passed' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('not found');
  });
});
