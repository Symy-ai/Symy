/**
 * Tests for with-auth.ts — withAuth HOF (auth check, error handling, cookie merging)
 *
 * 🔧 ARCH fix (Round 68 ARCH-DEEP-68): 测试覆盖率 — withAuth 0 tests → 4 tests
 *
 * Scenarios:
 * - Auth fails → returns 401 (with cookies merged)
 * - Handler throws → returns 500 + logs error (with cookies merged)
 * - Handler returns NextResponse → cookies auto-merged via mergeCookies
 * - Handler returns plain Response → cookies auto-merged via mergeCookiesOnResponse
 *
 * Mock strategy: createAuthenticatedClient is mocked to return controlled values
 * (supabase/user/error + mergeCookies/mergeCookiesOnResponse spies).
 * logger is mocked to verify error logging without polluting test output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock createAuthenticatedClient — factory returns vi.fn() so each test can
// configure its own return value via vi.mocked(...).mockResolvedValue(...).
vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

// Mock logger — verify error logging without console noise during tests.
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { withAuth } from '@/lib/with-auth';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { logger } from '@/lib/logger';

const mockedCreateAuth = vi.mocked(createAuthenticatedClient);
const mockedLoggerError = vi.mocked(logger.error);

/** Build a minimal NextRequest for testing (POST by default). */
function createMockRequest(method: 'POST' | 'GET' = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/test', { method });
}

/** Build a fake authenticated-client return value with mergeCookies spies. */
function buildAuthResult(options: {
  authenticated: boolean;
}) {
  // Use `any` for the mock functions to avoid TS generic-inference issues
  // with `<T extends NextResponse>(res: T): T`. The runtime behavior is
  // what matters for these tests; the production code's type safety is
  // verified by tsc on the real supabase-api.ts.
  const mergeCookiesSpy = vi.fn((res: unknown) => res);
  const mergeCookiesOnResponseSpy = vi.fn((res: unknown) => res);
  const base = options.authenticated
    ? {
        supabase: {} as never, // truthy — satisfies `!supabase` check
        user: { id: 'user-1', email: 'test@example.com' } as never,
        error: null,
      }
    : {
        supabase: null,
        user: null,
        error: 'Not authenticated' as const,
      };
  // Cast to the expected return type — spies are returned alongside for
  // per-test assertions on call counts and arguments.
  const authResult = {
    ...base,
    mergeCookies: mergeCookiesSpy,
    mergeCookiesOnResponse: mergeCookiesOnResponseSpy,
    pendingCookies: [] as unknown[],
  } as unknown as Awaited<ReturnType<typeof createAuthenticatedClient>>;
  return { authResult, mergeCookiesSpy, mergeCookiesOnResponseSpy };
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Scenario 1: Auth fails → returns 401
  // ---------------------------------------------------------------
  it('returns 401 when auth fails (error / null user / null supabase)', async () => {
    const { authResult, mergeCookiesSpy } = buildAuthResult({ authenticated: false });
    mockedCreateAuth.mockResolvedValue(authResult);

    const handler = vi.fn();
    const wrapped = withAuth(handler);
    const response = await wrapped(createMockRequest());

    expect(response.status).toBe(401);
    // Handler must NOT be called when auth fails (security: prevent bypass)
    expect(handler).not.toHaveBeenCalled();
    // mergeCookies must be called on the 401 response (preserve token refresh)
    expect(mergeCookiesSpy).toHaveBeenCalledTimes(1);
    // Verify the response body contains the error message
    const body = await response.json();
    expect(body).toEqual({ error: 'Not authenticated' });
  });

  // ---------------------------------------------------------------
  // Scenario 2: Handler throws → returns 500 + logs error
  // ---------------------------------------------------------------
  it('returns 500 and logs error when handler throws', async () => {
    const { authResult, mergeCookiesSpy } = buildAuthResult({ authenticated: true });
    mockedCreateAuth.mockResolvedValue(authResult);

    const handlerError = new Error('Handler boom');
    const handler = vi.fn().mockRejectedValue(handlerError);
    const wrapped = withAuth(handler);
    const response = await wrapped(createMockRequest());

    expect(response.status).toBe(500);
    // Handler was called (auth passed) but threw
    expect(handler).toHaveBeenCalledTimes(1);
    // Logger.error must be called with the error message
    expect(mockedLoggerError).toHaveBeenCalledTimes(1);
    // First arg is the prefix string, second is the extracted error message
    expect(mockedLoggerError.mock.calls[0][0]).toBe('[withAuth] Handler error:');
    expect(mockedLoggerError.mock.calls[0][1]).toBe('Handler boom');
    // mergeCookies must be called on the 500 response
    expect(mergeCookiesSpy).toHaveBeenCalledTimes(1);
    // Verify the response body
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });

  // ---------------------------------------------------------------
  // Scenario 3: Handler returns NextResponse → cookies auto-merged
  // ---------------------------------------------------------------
  it('auto-merges cookies when handler returns NextResponse', async () => {
    const { authResult, mergeCookiesSpy, mergeCookiesOnResponseSpy } = buildAuthResult({ authenticated: true });
    mockedCreateAuth.mockResolvedValue(authResult);

    const handlerResponse = NextResponse.json({ ok: true, data: 42 });
    const handler = vi.fn().mockResolvedValue(handlerResponse);
    const wrapped = withAuth(handler);
    const response = await wrapped(createMockRequest());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // mergeCookies (NextResponse path) must be called with the handler's response
    expect(mergeCookiesSpy).toHaveBeenCalledTimes(1);
    expect(mergeCookiesSpy.mock.calls[0][0]).toBe(handlerResponse);
    // mergeCookiesOnResponse (plain Response path) must NOT be called
    expect(mergeCookiesOnResponseSpy).not.toHaveBeenCalled();
    // Verify the response body is preserved
    const body = await response.json();
    expect(body).toEqual({ ok: true, data: 42 });
  });

  // ---------------------------------------------------------------
  // Scenario 4: Handler returns plain Response → cookies auto-merged
  // ---------------------------------------------------------------
  it('auto-merges cookies when handler returns plain Response (SSE)', async () => {
    const { authResult, mergeCookiesSpy, mergeCookiesOnResponseSpy } = buildAuthResult({ authenticated: true });
    mockedCreateAuth.mockResolvedValue(authResult);

    // Simulate an SSE handler returning a plain Response (not NextResponse)
    const handlerResponse = new Response('data: hello\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const handler = vi.fn().mockResolvedValue(handlerResponse);
    const wrapped = withAuth(handler);
    const response = await wrapped(createMockRequest());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // mergeCookiesOnResponse (plain Response path) must be called with the handler's response
    expect(mergeCookiesOnResponseSpy).toHaveBeenCalledTimes(1);
    expect(mergeCookiesOnResponseSpy.mock.calls[0][0]).toBe(handlerResponse);
    // mergeCookies (NextResponse path) must NOT be called
    expect(mergeCookiesSpy).not.toHaveBeenCalled();
    // Verify the response body is preserved
    const text = await response.text();
    expect(text).toBe('data: hello\n\n');
  });

  // ---------------------------------------------------------------
  // Bonus: verify handler receives the correct AuthContext
  // ---------------------------------------------------------------
  it('passes supabase, user, and request to handler via AuthContext', async () => {
    const { authResult } = buildAuthResult({ authenticated: true });
    mockedCreateAuth.mockResolvedValue(authResult);

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler);
    const request = createMockRequest();
    await wrapped(request);

    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0][0];
    // supabase and user are the truthy values from buildAuthResult
    expect(ctx.supabase).toBeTruthy();
    expect(ctx.user).toEqual({ id: 'user-1', email: 'test@example.com' });
    // request is the same NextRequest passed to the wrapped function
    expect(ctx.request).toBe(request);
  });
});
