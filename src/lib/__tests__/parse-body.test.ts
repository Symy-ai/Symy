/**
 * Tests for parse-body.ts — parseBody, parseBodyWithValidation
 *
 * 🔧 ARCH fix (Round 58): 测试基础设施 — vitest + 5 个核心 helper 测试
 */

import { describe, it, expect, vi } from 'vitest';
import { parseBody, parseBodyWithValidation } from '@/lib/parse-body';

// Mock NextRequest
function createMockRequest(body: unknown): { json: () => Promise<unknown> } {
  return {
    json: vi.fn().mockResolvedValue(body),
  };
}

function createMockRequestWithError(): { json: () => Promise<unknown> } {
  return {
    json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
  };
}

describe('parseBody', () => {
  it('parses valid JSON body', async () => {
    const req = createMockRequest({ name: 'test', value: 123 });
    const result = await parseBody(req as never);
    expect(result).toEqual({ name: 'test', value: 123 });
  });

  it('returns fallback for invalid JSON', async () => {
    const req = createMockRequestWithError();
    const result = await parseBody(req as never);
    expect(result).toEqual({});
  });

  it('returns custom fallback for invalid JSON', async () => {
    const req = createMockRequestWithError();
    const result = await parseBody(req as never, { default: true });
    expect(result).toEqual({ default: true });
  });

  it('returns fallback when body is null', async () => {
    const req = createMockRequest(null);
    const result = await parseBody(req as never);
    expect(result).toEqual({});
  });

  it('returns typed body with generic', async () => {
    const req = createMockRequest({ name: 'test' });
    const result = await parseBody<{ name: string }>(req as never);
    expect(result.name).toBe('test');
  });
});

describe('parseBodyWithValidation', () => {
  it('returns success with body when all required fields present', async () => {
    const req = createMockRequest({ name: 'test', amount: 100 });
    const result = await parseBodyWithValidation<{ name: string; amount: number }>(
      req as never,
      ['name', 'amount']
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.body.name).toBe('test');
      expect(result.body.amount).toBe(100);
    }
  });

  it('returns failure when required field missing', async () => {
    const req = createMockRequest({ name: 'test' });
    const result = await parseBodyWithValidation<{ name: string; amount: number }>(
      req as never,
      ['name', 'amount']
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('amount');
    }
  });

  it('returns failure when required field is empty string', async () => {
    const req = createMockRequest({ name: '', amount: 100 });
    const result = await parseBodyWithValidation<{ name: string; amount: number }>(
      req as never,
      ['name']
    );
    expect(result.success).toBe(false);
  });

  it('returns failure when required field is null', async () => {
    const req = createMockRequest({ name: null, amount: 100 });
    const result = await parseBodyWithValidation<{ name: string; amount: number }>(
      req as never,
      ['name']
    );
    expect(result.success).toBe(false);
  });
});
