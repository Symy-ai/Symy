/**
 * Tests for supabase-type-helpers — eliminate `as never` type assertions
 *
 * 🔧 ARCH fix (2026-07-21): These helpers replace `as never` with typed casts
 */

import { describe, it, expect } from 'vitest';
import { asInsert, asInsertArray, asUpdate, asUpsert } from '@/lib/supabase-type-helpers';

interface TestInsert {
  user_id: string;
  message_id: string;
  amount?: number;
}

interface TestUpdate {
  user_id?: string;
  locale?: string;
  timezone?: string;
}

describe('supabase-type-helpers', () => {
  describe('asInsert', () => {
    it('casts a single object to Insert type', () => {
      const data = { user_id: '123', message_id: 'msg-1', amount: 99.99 };
      const result = asInsert<TestInsert>(data);
      expect(result).toEqual(data);
      expect(result.user_id).toBe('123');
      expect(result.message_id).toBe('msg-1');
      expect(result.amount).toBe(99.99);
    });

    it('casts a Record<string, unknown> to Insert type', () => {
      const data: Record<string, unknown> = { user_id: '123', message_id: 'msg-1' };
      const result = asInsert<TestInsert>(data);
      expect(result.user_id).toBe('123');
      expect(result.message_id).toBe('msg-1');
    });

    it('preserves optional fields', () => {
      const data = { user_id: '123', message_id: 'msg-1' };
      const result = asInsert<TestInsert>(data);
      expect(result.amount).toBeUndefined();
    });
  });

  describe('asInsertArray', () => {
    it('casts an array of objects to Insert type array', () => {
      const data = [
        { user_id: '123', message_id: 'msg-1' },
        { user_id: '456', message_id: 'msg-2' },
      ];
      const result = asInsertArray<TestInsert>(data);
      expect(result).toHaveLength(2);
      expect(result[0].user_id).toBe('123');
      expect(result[1].user_id).toBe('456');
    });

    it('casts a Record<string, unknown>[] to Insert type array', () => {
      const data: Record<string, unknown>[] = [
        { user_id: '123', message_id: 'msg-1' },
      ];
      const result = asInsertArray<TestInsert>(data);
      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe('123');
    });

    it('handles empty array', () => {
      const result = asInsertArray<TestInsert>([]);
      expect(result).toEqual([]);
    });
  });

  describe('asUpdate', () => {
    it('casts a partial object to Update type', () => {
      const data = { locale: 'zh', timezone: 'Asia/Shanghai' };
      const result = asUpdate<TestUpdate>(data);
      expect(result.locale).toBe('zh');
      expect(result.timezone).toBe('Asia/Shanghai');
    });

    it('casts a Record<string, unknown> to Update type', () => {
      const data: Record<string, unknown> = { locale: 'en' };
      const result = asUpdate<TestUpdate>(data);
      expect(result.locale).toBe('en');
    });

    it('handles empty object', () => {
      const result = asUpdate<TestUpdate>({});
      expect(result).toEqual({});
    });
  });

  describe('asUpsert', () => {
    it('casts an object to Upsert type', () => {
      const data = { user_id: '123', message_id: 'msg-1' };
      const result = asUpsert<TestInsert>(data);
      expect(result.user_id).toBe('123');
      expect(result.message_id).toBe('msg-1');
    });

    it('casts a Record<string, unknown> to Upsert type', () => {
      const data: Record<string, unknown> = { user_id: '123', message_id: 'msg-1' };
      const result = asUpsert<TestInsert>(data);
      expect(result.user_id).toBe('123');
    });
  });
});
