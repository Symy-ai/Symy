/**
 * Tests for JSONB typed helpers (json-helpers.ts)
 *
 * Covers:
 * - toJson: basic conversion, edge cases
 * - parseJsonField: with/without validate, null/undefined, validation failure
 * - parseJsonArray: array detection, non-array fallback
 * - parseJsonObject: object detection, array/null fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toJson, parseJsonField, parseJsonArray, parseJsonObject } from '@/lib/json-helpers';

describe('toJson', () => {
  it('converts string to Json', () => {
    expect(toJson('hello')).toBe('hello');
  });

  it('converts number to Json', () => {
    expect(toJson(42)).toBe(42);
    expect(toJson(0)).toBe(0);
    expect(toJson(-1.5)).toBe(-1.5);
  });

  it('converts boolean to Json', () => {
    expect(toJson(true)).toBe(true);
    expect(toJson(false)).toBe(false);
  });

  it('converts null to Json', () => {
    expect(toJson(null)).toBeNull();
  });

  it('converts array to Json', () => {
    const arr = [1, 'two', true, null];
    expect(toJson(arr)).toEqual([1, 'two', true, null]);
  });

  it('converts plain object to Json', () => {
    const obj = { a: 1, b: 'two', c: true };
    expect(toJson(obj)).toEqual({ a: 1, b: 'two', c: true });
  });

  it('converts nested object to Json', () => {
    const obj = { outer: { inner: [1, 2, { x: 'y' }] } };
    expect(toJson(obj)).toEqual({ outer: { inner: [1, 2, { x: 'y' }] } });
  });

  it('converts Record<string, unknown> (common API input shape)', () => {
    const metadata: Record<string, unknown> = { amount: 99.99, platform: 'tiktok' };
    expect(toJson(metadata)).toEqual({ amount: 99.99, platform: 'tiktok' });
  });

  it('converts empty array', () => {
    expect(toJson([])).toEqual([]);
  });

  it('converts empty object', () => {
    expect(toJson({})).toEqual({});
  });
});

describe('parseJsonField', () => {
  describe('without validate (basic cast mode)', () => {
    it('returns value when value is non-null', () => {
      expect(parseJsonField<string>('hello', 'default')).toBe('hello');
    });

    it('returns defaultValue when value is null', () => {
      expect(parseJsonField<string>(null, 'default')).toBe('default');
    });

    it('returns defaultValue when value is undefined', () => {
      expect(parseJsonField<string>(undefined, 'default')).toBe('default');
    });

    it('casts object to T', () => {
      const obj = { name: 'Alice', age: 30 };
      expect(parseJsonField<{ name: string; age: number }>(obj, { name: '', age: 0 })).toEqual(obj);
    });

    it('casts array to T[]', () => {
      const arr = [1, 2, 3];
      expect(parseJsonField<number[]>(arr, [])).toEqual([1, 2, 3]);
    });

    it('returns 0 (falsy value) correctly', () => {
      expect(parseJsonField<number>(0, -1)).toBe(0);
    });

    it('returns empty string correctly', () => {
      expect(parseJsonField<string>('', 'default')).toBe('');
    });

    it('returns false correctly', () => {
      expect(parseJsonField<boolean>(false, true)).toBe(false);
    });
  });

  describe('with validate (runtime validation mode)', () => {
    it('returns value when validate passes', () => {
      const isString = (v: unknown): v is string => typeof v === 'string';
      expect(parseJsonField<string>('hello', 'default', isString)).toBe('hello');
    });

    it('returns defaultValue when validate fails', () => {
      const isString = (v: unknown): v is string => typeof v === 'string';
      expect(parseJsonField<string>(123, 'default', isString)).toBe('default');
    });

    it('returns defaultValue when value is null (no validate call)', () => {
      const validate = vi.fn((v: unknown): v is string => typeof v === 'string');
      expect(parseJsonField<string>(null, 'default', validate as unknown as (v: unknown) => v is string)).toBe('default');
      expect(validate).not.toHaveBeenCalled();
    });

    it('returns defaultValue when value is undefined (no validate call)', () => {
      const validate = vi.fn((v: unknown): v is string => typeof v === 'string');
      expect(parseJsonField<string>(undefined, 'default', validate as unknown as (v: unknown) => v is string)).toBe('default');
      expect(validate).not.toHaveBeenCalled();
    });

    it('logs warning when validate fails', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const isString = (v: unknown): v is string => typeof v === 'string';
      parseJsonField<string>({ foo: 'bar' }, 'default', isString);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('parseJsonField validation failed');
      warnSpy.mockRestore();
    });

    it('validates array of strings', () => {
      const isStringArray = (v: unknown): v is string[] =>
        Array.isArray(v) && v.every((x) => typeof x === 'string');
      expect(parseJsonField<string[]>(['a', 'b'], [], isStringArray)).toEqual(['a', 'b']);
      expect(parseJsonField<string[]>([1, 2], [], isStringArray)).toEqual([]);
      expect(parseJsonField<string[]>(null, [], isStringArray)).toEqual([]);
    });

    it('validates object with specific shape', () => {
      interface User {
        id: string;
        name: string;
      }
      const isUser = (v: unknown): v is User =>
        typeof v === 'object' &&
        v !== null &&
        'id' in v &&
        'name' in v &&
        typeof (v as User).id === 'string' &&
        typeof (v as User).name === 'string';

      const validUser = { id: 'u1', name: 'Alice' };
      expect(parseJsonField<User>(validUser, { id: '', name: '' }, isUser)).toEqual(validUser);
      expect(parseJsonField<User>({ id: 'u1' }, { id: '', name: '' }, isUser)).toEqual({ id: '', name: '' });
    });
  });
});

describe('parseJsonArray', () => {
  it('returns array when value is array', () => {
    expect(parseJsonArray<number>([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it('returns defaultValue when value is null', () => {
    expect(parseJsonArray<number>(null, [])).toEqual([]);
  });

  it('returns defaultValue when value is undefined', () => {
    expect(parseJsonArray<number>(undefined, [])).toEqual([]);
  });

  it('returns defaultValue when value is not an array (string)', () => {
    expect(parseJsonArray<number>('not array', [])).toEqual([]);
  });

  it('returns defaultValue when value is not an array (object)', () => {
    expect(parseJsonArray<number>({ foo: 'bar' }, [])).toEqual([]);
  });

  it('returns defaultValue when value is not an array (number)', () => {
    expect(parseJsonArray<number>(42, [])).toEqual([]);
  });

  it('logs warning when value is not an array', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseJsonArray<number>('not array', []);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('preserves array contents', () => {
    const arr = [{ id: '1' }, { id: '2' }];
    expect(parseJsonArray<{ id: string }>(arr, [])).toEqual(arr);
  });

  it('handles empty array', () => {
    expect(parseJsonArray<number>([], [1, 2])).toEqual([]);
  });

  it('handles non-default fallback array', () => {
    expect(parseJsonArray<string>(null, ['fallback'])).toEqual(['fallback']);
  });
});

describe('parseJsonObject', () => {
  it('returns object when value is plain object', () => {
    const obj = { foo: 'bar' };
    expect(parseJsonObject(obj, { foo: '' })).toEqual(obj);
  });

  it('returns defaultValue when value is null', () => {
    expect(parseJsonObject(null, { foo: 'default' })).toEqual({ foo: 'default' });
  });

  it('returns defaultValue when value is undefined', () => {
    expect(parseJsonObject(undefined, { foo: 'default' })).toEqual({ foo: 'default' });
  });

  it('returns defaultValue when value is array (not plain object)', () => {
    expect(parseJsonObject([1, 2], { foo: 'default' })).toEqual({ foo: 'default' });
  });

  it('returns defaultValue when value is string', () => {
    expect(parseJsonObject('not object', { foo: 'default' })).toEqual({ foo: 'default' });
  });

  it('returns defaultValue when value is number', () => {
    expect(parseJsonObject(42, { foo: 'default' })).toEqual({ foo: 'default' });
  });

  it('logs warning when value is not an object', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseJsonObject(42, { foo: 'default' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe('integration: typical usage patterns', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DB write → read roundtrip for badges', () => {
    // Simulate writing badges to DB
    const badges = ['first_purchase', 'seven_day_streak'];
    const stored = toJson(badges);

    // Simulate reading badges from DB
    const read = parseJsonArray<string>(stored, []);

    expect(read).toEqual(badges);
  });

  it('DB write → read roundtrip for metadata', () => {
    const metadata = { amount: 99.99, platform: 'tiktok', items: ['item1', 'item2'] };
    const stored = toJson(metadata);
    const read = parseJsonObject<{ amount: number; platform: string; items: string[] }>(
      stored,
      { amount: 0, platform: '', items: [] },
    );

    expect(read).toEqual(metadata);
  });

  it('DB corruption: badges column has string instead of array → returns []', () => {
    // DB column got corrupted, stores string instead of array
    const corrupted = toJson('not an array');

    // Reading should gracefully return []
    const read = parseJsonArray<string>(corrupted, []);
    expect(read).toEqual([]);
  });

  it('DB null: new row with nullable column → returns defaultValue', () => {
    const read = parseJsonArray<string>(null, []);
    expect(read).toEqual([]);
  });

  it('Real-world RPC result parsing: badges from buddy_state_delta', () => {
    // Simulate RPC return value (typed as unknown by Supabase SDK)
    const rpcResult: unknown = {
      success: true,
      vitality: 80,
      tokens: 100,
      badges: ['badge1', 'badge2'],
    };

    const badges = parseJsonArray<string>(
      (rpcResult as { badges: unknown }).badges,
      [],
    );
    expect(badges).toEqual(['badge1', 'badge2']);
  });
});
