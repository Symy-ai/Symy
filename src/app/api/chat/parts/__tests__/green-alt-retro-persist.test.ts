/* eslint-disable require-await */
// stub store 的 insert/maybeSingle 按 supabase-js 契约声明为 async, 但 stub 内无需 await

/**
 * green-alt-retro-persist 测试 — best-effort 落账 (batch68-a)
 *
 * 覆盖: health_events 列形状与 adoption route 同款 (vitality_change 0 /
 * manual_adjustment / metadata 契约); 未知词条静默跳过; 插入失败只 warn
 * 不抛异常 (fire-and-forget 语义)。
 */

import { describe, expect, it } from 'vitest';
import { recordGreenAltRetroEvent, type GreenAltRetroPersistStore } from '../green-alt-retro-persist';

const NOW = new Date('2026-09-09T12:00:00Z');

function stubStore(opts: { insertError?: string } = {}): { store: GreenAltRetroPersistStore; inserts: unknown[] } {
  const inserts: unknown[] = [];
  const store: GreenAltRetroPersistStore = {
    from: ((table: string) => {
      if (table === 'buddy_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { vitality: 77 } }),
            }),
          }),
        };
      }
      return {
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: opts.insertError ? { message: opts.insertError } : null };
        },
      };
    }) as GreenAltRetroPersistStore['from'],
  };
  return { store, inserts };
}

describe('recordGreenAltRetroEvent', () => {
  it('写入 manual_adjustment 审计行: trigger_id/列形状/metadata 契约, 零金额', async () => {
    const { store, inserts } = stubStore();
    await recordGreenAltRetroEvent({ userId: 'u1', store, entryId: 'milk_tea', reason: 'already_have', now: NOW });
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.event_type).toBe('manual_adjustment');
    expect(row.trigger_source).toBe('manual');
    expect(row.trigger_id).toBe('green-alt-retro:milk_tea:already_have:2026-09-09');
    expect(row.vitality_change).toBe(0);
    expect(row.new_vitality).toBe(77);
    expect(row.token_change).toBe(0);
    expect(row.metadata).toMatchObject({ source: 'green_alt_retro', entryId: 'milk_tea', category: 'food', reason: 'already_have' });
    expect(JSON.stringify(row)).not.toMatch(/estSaved|amount|"saved"/);
  });

  it('freeform 回答带净化原话与定性词', async () => {
    const { store, inserts } = stubStore();
    await recordGreenAltRetroEvent({ userId: 'u1', store, entryId: 'milk_tea', reason: 'freeform', note: '家里有, 省事', now: NOW });
    const row = inserts[0] as Record<string, unknown>;
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.note).toBe('家里有, 省事');
    expect(Array.isArray(meta.keywords)).toBe(true);
  });

  it('未知词条静默跳过 (不 insert)', async () => {
    const { store, inserts } = stubStore();
    await recordGreenAltRetroEvent({ userId: 'u1', store, entryId: 'no-such-entry', reason: 'already_have', now: NOW });
    expect(inserts).toHaveLength(0);
  });

  it('插入失败只 warn 不抛 (fire-and-forget 语义)', async () => {
    const { store, inserts } = stubStore({ insertError: 'duplicate key' });
    await expect(recordGreenAltRetroEvent({ userId: 'u1', store, entryId: 'milk_tea', reason: 'try_once', now: NOW })).resolves.toBeUndefined();
    expect(inserts).toHaveLength(1);
  });

  it('buddy_state 读取失败也照常落账 (new_vitality 兜底 0)', async () => {
    const inserts: unknown[] = [];
    const store = {
      from: ((table: string) => {
        if (table === 'buddy_state') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  throw new Error('boom');
                },
              }),
            }),
          };
        }
        return {
          insert: async (row: unknown) => {
            inserts.push(row);
            return { error: null };
          },
        };
      }) as GreenAltRetroPersistStore['from'],
    };
    await recordGreenAltRetroEvent({ userId: 'u1', store, entryId: 'milk_tea', reason: 'reduce_idle', now: NOW });
    expect((inserts[0] as Record<string, unknown>).new_vitality).toBe(0);
  });
});
