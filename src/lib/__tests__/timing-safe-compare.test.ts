/**
 * Tests for timing-safe-compare.ts — timingSafeCompare
 *
 * 🔧 ARCH fix (Round 58): 测试基础设施 — vitest + 5 个核心 helper 测试
 */

import { describe, it, expect } from 'vitest';
import { timingSafeCompare } from '@/lib/timing-safe-compare';

describe('timingSafeCompare', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeCompare('secret123', 'secret123')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(timingSafeCompare('secret123', 'secret456')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeCompare('short', 'longer string')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(timingSafeCompare('', '')).toBe(false);
    expect(timingSafeCompare('a', '')).toBe(false);
    expect(timingSafeCompare('', 'b')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(timingSafeCompare(null as unknown as string, 'test')).toBe(false);
    expect(timingSafeCompare(undefined as unknown as string, 'test')).toBe(false);
    expect(timingSafeCompare(123 as unknown as string, '123')).toBe(false);
  });

  it('handles special characters', () => {
    expect(timingSafeCompare('p@ssw0rd!#$%', 'p@ssw0rd!#$%')).toBe(true);
    expect(timingSafeCompare('p@ssw0rd!#$%', 'p@ssw0rd!#$&')).toBe(false);
  });

  it('handles unicode', () => {
    expect(timingSafeCompare('密码123', '密码123')).toBe(true);
    expect(timingSafeCompare('密码123', '密码456')).toBe(false);
  });
});
