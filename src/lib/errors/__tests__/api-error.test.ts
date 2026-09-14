/**
 * ApiError Tests
 *
 * 🔧 2026-07-20: 技术债清理 — ApiError 自定义错误类测试
 */

import { describe, it, expect } from 'vitest';
import { ApiError, getErrorStatus } from '../api-error';

describe('ApiError', () => {
  it('creates an error with status', () => {
    const error = new ApiError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.name).toBe('ApiError');
    expect(error instanceof Error).toBe(true);
  });

  it('creates an error with 401 status', () => {
    const error = new ApiError('Unauthorized', 401);
    expect(error.status).toBe(401);
  });

  it('creates an error with 500 status', () => {
    const error = new ApiError('Internal server error', 500);
    expect(error.status).toBe(500);
  });
});

describe('getErrorStatus', () => {
  it('returns status from ApiError', () => {
    const error = new ApiError('Not found', 404);
    expect(getErrorStatus(error)).toBe(404);
  });

  it('returns undefined from plain Error', () => {
    const error = new Error('Plain error');
    expect(getErrorStatus(error)).toBeUndefined();
  });

  it('returns undefined from non-Error value', () => {
    expect(getErrorStatus('string error')).toBeUndefined();
    expect(getErrorStatus(null)).toBeUndefined();
    expect(getErrorStatus(undefined)).toBeUndefined();
    expect(getErrorStatus(42)).toBeUndefined();
  });

  it('returns status from Error with status property (third-party compat)', () => {
    const error = new Error('Third-party error');
    (error as unknown as { status: number }).status = 429;
    expect(getErrorStatus(error)).toBe(429);
  });
});
