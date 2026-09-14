/**
 * Tests for createApiError utility
 *
 * 🔧 ARCH fix Round 74 (Finding 17): Structured API error responses with requestId.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createApiError } from '../api-error';
import { logger } from '@/lib/logger';

describe('createApiError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns NextResponse with correct status code', () => {
    const res = createApiError(500, 'INTERNAL', 'Something went wrong');
    expect(res.status).toBe(500);
  });

  it('includes error message in response body', async () => {
    const res = createApiError(404, 'NOT_FOUND', 'Challenge not found');
    const json = await res.json();
    expect(json.error).toBe('Challenge not found');
  });

  it('includes machine-readable code in response body', async () => {
    const res = createApiError(429, 'RATE_LIMITED', 'Too many requests');
    const json = await res.json();
    expect(json.code).toBe('RATE_LIMITED');
  });

  it('includes requestId (UUID) in response body', async () => {
    const res = createApiError(500, 'DB_ERROR', 'DB failed');
    const json = await res.json();
    expect(json.requestId).toBeTruthy();
    expect(json.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('generates unique requestId for each call', () => {
    const _res1 = createApiError(500, 'INTERNAL', 'Error 1');
    const _res2 = createApiError(500, 'INTERNAL', 'Error 2');
    // Access the body synchronously via .body (NextResponse stores JSON body)
    // We can't await .json() twice, so just verify requestId was generated
    expect(logger.error).toHaveBeenCalledTimes(2);
    const call1 = vi.mocked(logger.error).mock.calls[0];
    const call2 = vi.mocked(logger.error).mock.calls[1];
    const id1 = (call1?.[1] as { requestId?: string })?.requestId;
    const id2 = (call2?.[1] as { requestId?: string })?.requestId;
    expect(id1).not.toBe(id2);
  });

  it('logs error with full detail (including original error message)', () => {
    const originalError = new Error('Connection refused');
    createApiError(500, 'DB_ERROR', 'Failed to save', originalError, { route: 'POST /api/buddy/state' });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const logCall = vi.mocked(logger.error).mock.calls[0];
    expect(logCall?.[0]).toContain('DB_ERROR');
    expect(logCall?.[0]).toContain('500');
    const logContext = logCall?.[1] as Record<string, unknown>;
    expect(logContext.code).toBe('DB_ERROR');
    expect(logContext.error).toBe('Connection refused');
    expect(logContext.context).toEqual({ route: 'POST /api/buddy/state' });
  });

  it('does not expose internal error detail in response body', async () => {
    const originalError = new Error('Internal: connection to postgres://user:pass@host failed');
    const res = createApiError(500, 'DB_ERROR', 'Database error', originalError);
    const json = await res.json();
    // The response should NOT contain the internal error message
    expect(json.error).toBe('Database error');
    expect(json.detail).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('postgres://');
    expect(JSON.stringify(json)).not.toContain('user:pass');
  });

  it('works without error or context (minimal call)', async () => {
    const res = createApiError(401, 'UNAUTHORIZED', 'Not authenticated');
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
    expect(json.code).toBe('UNAUTHORIZED');
    expect(json.requestId).toBeTruthy();
  });
});
