/**
 * Tests for error-utils.ts — getErrorMessage, getErrorStack, isAbortError
 *
 * 🔧 ARCH fix (Round 58): 测试基础设施 — vitest + 5 个核心 helper 测试
 */

import { describe, it, expect } from 'vitest';
import { getErrorMessage, getErrorStack, isAbortError } from '@/lib/error-utils';

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('returns string directly', () => {
    expect(getErrorMessage('plain string')).toBe('plain string');
  });

  it('extracts message from object with message property', () => {
    expect(getErrorMessage({ message: 'object error' })).toBe('object error');
  });

  it('handles non-string message property', () => {
    expect(getErrorMessage({ message: 123 })).toBe('123');
  });

  it('handles null', () => {
    expect(getErrorMessage(null)).toBe('Unknown error');
  });

  it('handles undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('uses custom fallback', () => {
    expect(getErrorMessage(null, 'custom fallback')).toBe('custom fallback');
  });

  it('handles empty Error message', () => {
    expect(getErrorMessage(new Error(''))).toBe('Unknown error');
  });

  it('serializes unknown objects via JSON.stringify', () => {
    expect(getErrorMessage({ code: 500, detail: 'fail' })).toBe('{"code":500,"detail":"fail"}');
  });

  it('handles circular references gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // Should not throw, should return some string
    const result = getErrorMessage(circular);
    expect(typeof result).toBe('string');
  });
});

describe('getErrorStack', () => {
  it('returns stack from Error', () => {
    const err = new Error('test');
    expect(getErrorStack(err)).toBeDefined();
    expect(typeof getErrorStack(err)).toBe('string');
  });

  it('returns undefined for non-Error', () => {
    expect(getErrorStack('string')).toBeUndefined();
    expect(getErrorStack(null)).toBeUndefined();
  });
});

describe('isAbortError', () => {
  it('detects AbortError by name', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('detects abort by message (lowercase)', () => {
    expect(isAbortError(new Error('The operation was aborted'))).toBe(true);
  });

  it('detects abort by message (mixed case)', () => {
    expect(isAbortError(new Error('Request ABORTED by user'))).toBe(true);
  });

  it('returns false for non-abort errors', () => {
    expect(isAbortError(new Error('network error'))).toBe(false);
    expect(isAbortError('string')).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
