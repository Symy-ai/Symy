/**
 * Unit tests for letta-agent-validation helpers — P0-3 fix
 * (AUDIT-LETTA-AGENT-MGR).
 */

import { describe, it, expect } from 'vitest';
import { validateUserId, validateAgentId, validatePositiveNumber } from '@/lib/letta-agent-validation';

describe('validateUserId', () => {
  it('returns true for valid UUID', () => {
    expect(validateUserId('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toBe(true);
  });

  it('returns true for test fixture format (all hex)', () => {
    expect(validateUserId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(true);
  });

  it('returns true for uppercase hex', () => {
    expect(validateUserId('A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(validateUserId(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(validateUserId(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateUserId('')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(validateUserId(123)).toBe(false);
    expect(validateUserId({})).toBe(false);
    expect(validateUserId([])).toBe(false);
  });

  it('returns false for plain number string', () => {
    expect(validateUserId('12345')).toBe(false);
  });

  it('returns false for UUID with wrong segment count', () => {
    expect(validateUserId('a1b2c3d4-e5f6-4a7b')).toBe(false);
  });

  it('returns false for UUID with invalid hex chars', () => {
    expect(validateUserId('x1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toBe(false);
  });

  it('returns false for object stringified as [object Object]', () => {
    expect(validateUserId(String({ id: 'x' }))).toBe(false);
  });

  it('acts as type guard (TypeScript narrows to string)', () => {
    const input: unknown = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    if (validateUserId(input)) {
      // TypeScript should narrow input to string here
      expect(input.length).toBe(36);
    } else {
      expect.fail('Should have validated');
    }
  });
});

describe('validateAgentId', () => {
  it('returns true for valid UUID (same format as userId)', () => {
    expect(validateAgentId('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(validateAgentId(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateAgentId('')).toBe(false);
  });

  it('returns false for non-UUID string', () => {
    expect(validateAgentId('not-a-uuid')).toBe(false);
  });
});

describe('validatePositiveNumber', () => {
  it('returns true for positive integer', () => {
    expect(validatePositiveNumber(50)).toBe(true);
  });

  it('returns true for positive float', () => {
    expect(validatePositiveNumber(25.5)).toBe(true);
  });

  it('returns true for very small positive number', () => {
    expect(validatePositiveNumber(0.01)).toBe(true);
  });

  it('returns false for 0', () => {
    expect(validatePositiveNumber(0)).toBe(false);
  });

  it('returns false for negative number', () => {
    expect(validatePositiveNumber(-10)).toBe(false);
  });

  it('returns false for NaN', () => {
    expect(validatePositiveNumber(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(validatePositiveNumber(Infinity)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(validatePositiveNumber(undefined)).toBe(false);
  });

  it('returns false for string (even numeric)', () => {
    expect(validatePositiveNumber('50')).toBe(false);
  });
});
