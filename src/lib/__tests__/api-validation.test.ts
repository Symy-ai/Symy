/**
 * Tests for api-validation helpers
 *
 * 🔧 ARCH fix (Round 6 AUDIT-3): Add tests for the new zod-based API validation layer
 * 🔧 ARCH fix (Round 11 ADV-REVIEW LOW-1): 移除 schemas 测试 (production 不用预定义 schemas)
 *    只测试 validateBody / validateQuery / isValidationError + 导出的 primitives
 */
import { describe, it, expect } from 'vitest';
import { validateBody, validateQuery, isValidationError, amountSchema, safeString, uuidSchema, safeIdSchema } from '../api-validation';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
/* eslint-disable require-await -- test mocks use async for API consistency */

// Mock NextRequest for testing
function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return {
    json: async () => body,
    url: 'http://localhost/api/test',
    method,
  } as unknown as NextRequest;
}

function makeRequestWithQuery(query: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/test');
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return {
    url: url.toString(),
    json: async () => ({}),
  } as unknown as NextRequest;
}

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0).max(150),
  });

  it('returns parsed body on valid input', async () => {
    const req = makeRequest({ name: 'Alice', age: 30 });
    const result = await validateBody(req, schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { name: string; age: number }).name).toBe('Alice');
    expect((result as { name: string; age: number }).age).toBe(30);
  });

  it('returns 400 NextResponse on invalid JSON', async () => {
    const req = {
      json: async () => { throw new SyntaxError('Unexpected token'); },
      url: 'http://localhost/api/test',
    } as unknown as NextRequest;
    const result = await validateBody(req, schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it('returns 400 NextResponse on schema mismatch', async () => {
    const req = makeRequest({ name: 'Alice', age: -5 });
    const result = await validateBody(req, schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const json = await (result as NextResponse).json();
    expect(json.error).toBe('Validation failed');
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('returns 400 on missing required field', async () => {
    const req = makeRequest({ name: 'Alice' });
    const result = await validateBody(req, schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it('rejects prototype pollution attempts', async () => {
    const req = makeRequest({ name: 'Alice', age: 30, __proto__: { polluted: true } });
    const result = await validateBody(req, schema);
    // zod 默认不 strip unknown keys, 但 __proto__ 不会污染 Object.prototype
    // 关键: schema 只允许 name + age, 不会泄露其他字段到 result
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('rejects extra fields with strict mode', async () => {
    const strictSchema = z.object({ name: z.string() }).strict();
    const req = makeRequest({ name: 'Alice', extra: 'bad' });
    const result = await validateBody(req, strictSchema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });
});

describe('isValidationError', () => {
  it('returns true for NextResponse', () => {
    const res = NextResponse.json({}, { status: 400 });
    expect(isValidationError(res)).toBe(true);
  });

  it('returns false for non-NextResponse values', () => {
    expect(isValidationError({})).toBe(false);
    expect(isValidationError(null)).toBe(false);
    expect(isValidationError('string')).toBe(false);
    expect(isValidationError(42)).toBe(false);
  });
});

describe('validateQuery', () => {
  it('parses valid query params', () => {
    const req = makeRequestWithQuery({ sessionId: '123e4567-e89b-12d3-a456-426614174000' });
    const schema = z.object({ sessionId: z.string().uuid() });
    const result = validateQuery(req, schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { sessionId: string }).sessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('returns 400 on invalid query params', () => {
    const req = makeRequestWithQuery({ sessionId: 'not-a-uuid' });
    const schema = z.object({ sessionId: z.string().uuid() });
    const result = validateQuery(req, schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it('coerces numbers via z.coerce.number()', () => {
    const req = makeRequestWithQuery({ limit: '15' });
    const schema = z.object({ limit: z.coerce.number().int().min(1).max(50) });
    const result = validateQuery(req, schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { limit: number }).limit).toBe(15);
  });
});

describe('reusable schema primitives', () => {
  describe('amountSchema', () => {
    it('accepts valid positive number', () => {
      expect(amountSchema.safeParse(50.25).success).toBe(true);
    });
    it('rejects negative amount', () => {
      expect(amountSchema.safeParse(-10).success).toBe(false);
    });
    it('rejects NaN', () => {
      expect(amountSchema.safeParse(NaN).success).toBe(false);
    });
    it('rejects amount over 1M cap', () => {
      expect(amountSchema.safeParse(2_000_000).success).toBe(false);
    });
  });

  describe('safeIdSchema', () => {
    it('accepts valid ID', () => {
      expect(safeIdSchema.safeParse('df-test-fund_123').success).toBe(true);
    });
    it('rejects SQL injection attempt', () => {
      expect(safeIdSchema.safeParse('df-test; DROP TABLE--').success).toBe(false);
    });
  });

  describe('uuidSchema', () => {
    it('accepts valid UUID', () => {
      expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    });
    it('rejects non-UUID', () => {
      expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    });
  });

  describe('safeString', () => {
    it('accepts string within length limit', () => {
      expect(safeString(100).safeParse('hello').success).toBe(true);
    });
    it('rejects string exceeding length limit', () => {
      expect(safeString(5).safeParse('too long string').success).toBe(false);
    });
    it('trims whitespace', () => {
      const result = safeString(100).safeParse('  hello  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('hello');
      }
    });
  });
});
