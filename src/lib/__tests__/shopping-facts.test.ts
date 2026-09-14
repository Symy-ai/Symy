/**
 * shopping-facts 落库件测试 — A3 移植 (commerce-agents 记忆块 64/200 模式)
 *
 * 覆盖: 三类目枚举 / key(value) 上下限与卫生化 / identifier 形态写过滤 /
 *       批量 upsert 的合法行收集与 rejected 计数 / store 错误兜底。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SHOPPING_FACT_CATEGORIES,
  SHOPPING_FACT_KEY_MAX,
  SHOPPING_FACT_VALUE_MAX,
  buildShoppingFact,
  isIdentifierShaped,
  isMissingTableError,
  loadShoppingFacts,
  saveShoppingFacts,
  type ShoppingFactsReadStore,
  type ShoppingFactsStore,
} from '../shopping-facts';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const VALID = { category: 'size', key: '鞋码', value: '春秋穿 42' };

describe('buildShoppingFact — schema', () => {
  it('三类目全部放行, 枚举外拒绝', () => {
    for (const category of SHOPPING_FACT_CATEGORIES) {
      expect(buildShoppingFact({ ...VALID, category })).toEqual({
        category,
        key: '鞋码',
        value: '春秋穿 42',
      });
    }
    expect(buildShoppingFact({ ...VALID, category: 'style' })).toBeNull();
    expect(buildShoppingFact({ ...VALID, category: 42 })).toBeNull();
  });

  it('key: 空/超 64/含空白或控制字符 → 拒; 64 以内放行 (不截断, 防语义碰撞)', () => {
    expect(buildShoppingFact({ ...VALID, key: '   ' })).toBeNull();
    expect(buildShoppingFact({ ...VALID, key: 'k'.repeat(SHOPPING_FACT_KEY_MAX + 1) })).toBeNull();
    expect(buildShoppingFact({ ...VALID, key: '鞋码\nignore' })).toBeNull();
    expect(buildShoppingFact({ ...VALID, key: '鞋 码' })).toBeNull();
    expect(buildShoppingFact({ ...VALID, key: 'k'.repeat(SHOPPING_FACT_KEY_MAX) })).not.toBeNull();
  });

  it('value: 过 fencing 卫生化 (折行/tab 压平), 截断到 200 (截断优于丢弃)', () => {
    const long = buildShoppingFact({ ...VALID, value: `很`.repeat(300) });
    expect(long?.value.length).toBeLessThanOrEqual(SHOPPING_FACT_VALUE_MAX);
    const messy = buildShoppingFact({ ...VALID, value: '棉质\n\nM 号\t为主' });
    expect(messy?.value).toBe('棉质 M 号 为主');
    expect(buildShoppingFact({ ...VALID, value: '' })).toBeNull();
  });
});

describe('isIdentifierShaped — 写过滤', () => {
  it('拒绝: UUID / 长 hex / 11 位以上纯数字 / 邮箱 / URL / @handle / opaque 长串', () => {
    expect(isIdentifierShaped('c0a80101-7f2a-4c1e-9b3a-0d5e8a1b2c3d')).toBe(true);
    expect(isIdentifierShaped('0xFFEEDDCCBBAA99887766')).toBe(true);
    expect(isIdentifierShaped('13800138000')).toBe(true);
    expect(isIdentifierShaped('user@example.com')).toBe(true);
    expect(isIdentifierShaped('https://detail.yiwugo.com/p/1')).toBe(true);
    expect(isIdentifierShaped('@seller_2024')).toBe(true);
    expect(isIdentifierShaped('aK8_zZ31-Qm2nP9rSt4uvwxy')).toBe(true);
  });

  it('放行: 人话事实 (含短数字的尺码/预算)', () => {
    expect(isIdentifierShaped('春秋穿 42')).toBe(false);
    expect(isIdentifierShaped('500 元以内')).toBe(false);
    expect(isIdentifierShaped('怕挤脚, 偏爱宽楦')).toBe(false);
  });
});

describe('saveShoppingFacts — 落库件', () => {
  function makeStore() {
    const calls: Array<{ rows: Array<Record<string, unknown>>; options: unknown }> = [];
    const store: ShoppingFactsStore = {
      from(table: string) {
        expect(table).toBe('shopping_facts');
        return {
          upsert(rows: Array<Record<string, unknown>>, options: { onConflict: string }) {
            calls.push({ rows, options });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    return { store, calls };
  }

  it('合法行收集 upsert, 冲突键 user_id+category+key; 非法行计入 rejected', async () => {
    const { store, calls } = makeStore();
    const result = await saveShoppingFacts('u1', [
      VALID,
      { category: 'budget', key: '月预算', value: 'c0a80101-7f2a-4c1e-9b3a-0d5e8a1b2c3d' }, // identifier → 拒
      { category: 'style', key: 'x', value: 'y' }, // 枚举外 → 拒
      { category: 'preference', key: '材质', value: '棉质优先' },
    ], store);
    expect(result).toEqual({ saved: 2, rejected: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual({ onConflict: 'user_id,category,key' });
    expect(calls[0].rows).toEqual([
      { user_id: 'u1', category: 'size', key: '鞋码', value: '春秋穿 42' },
      { user_id: 'u1', category: 'preference', key: '材质', value: '棉质优先' },
    ]);
  });

  it('全部非法 → 不触发 store 调用', async () => {
    const { store, calls } = makeStore();
    const result = await saveShoppingFacts('u1', [{ category: 'style', key: 'x', value: 'y' }], store);
    expect(result).toEqual({ saved: 0, rejected: 1 });
    expect(calls).toHaveLength(0);
  });

  it('store 返回错误 → error 字段带出, 不抛异常', async () => {
    const store: ShoppingFactsStore = {
      from: () => ({
        upsert() {
          return Promise.resolve({ error: { message: 'duplicate key' } });
        },
      }),
    };
    const result = await saveShoppingFacts('u1', [VALID], store);
    expect(result.saved).toBe(0);
    expect(result.error).toBe('duplicate key');
  });
});

describe('表缺失降级 (42P01) — migration 140 未跑是常态, 不许毒死记忆管线', () => {
  /** PostgrestError 形态: { code: '42P01', message: 'relation "shopping_facts" does not exist' } */
  function makeUpsertStore(error: { message: string; code?: string } | null) {
    const store: ShoppingFactsStore = {
      from(table: string) {
        expect(table).toBe('shopping_facts');
        return {
          upsert() {
            return Promise.resolve({ error });
          },
        };
      },
    };
    return store;
  }

  function makeReadStore(
    error: { message: string; code?: string } | null,
    data: Array<{ category: unknown; key: unknown; value: unknown; updated_at?: unknown }> | null = null,
  ) {
    const store: ShoppingFactsReadStore = {
      from(table: string) {
        expect(table).toBe('shopping_facts');
        return {
          select(columns: string) {
            // batch25-b: 带 updated_at 供"新者优先"排序
            expect(columns).toBe('category,key,value,updated_at');
            return {
              eq(column: string, value: string) {
                expect(column).toBe('user_id');
                expect(value).toBe('u1');
                return Promise.resolve({ data, error });
              },
            };
          },
        };
      },
    };
    return store;
  }

  beforeEach(() => {
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
  });

  it('isMissingTableError: 命中 42P01 / PGRST205, 其余错误码与空值不命中', () => {
    expect(isMissingTableError({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingTableError({ message: 'no code at all' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });

  it('写路径 42P01 → saved=0 + degraded=true, warn 级不 error 级, 不抛异常', async () => {
    const result = await saveShoppingFacts('u1', [VALID], makeUpsertStore({
      code: '42P01',
      message: 'relation "public.shopping_facts" does not exist',
    }));
    expect(result).toEqual({ saved: 0, rejected: 0, degraded: true });
    expect(result.error).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('写路径 PGRST205 (PostgREST schema-cache miss 形态) → 同样降级', async () => {
    const result = await saveShoppingFacts('u1', [VALID], makeUpsertStore({
      code: 'PGRST205',
      message: "Could not find the table 'public.shopping_facts' in the schema cache",
    }));
    expect(result).toEqual({ saved: 0, rejected: 0, degraded: true });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('写路径其他错误码 (如 23505) → 走既有 error 路径, 不降级', async () => {
    const result = await saveShoppingFacts('u1', [VALID], makeUpsertStore({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }));
    expect(result).toEqual({
      saved: 0,
      rejected: 0,
      error: 'duplicate key value violates unique constraint',
    });
    expect(result.degraded).toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('读路径 42P01 → 空数组 + degraded=true, 不炸调用方', async () => {
    const result = await loadShoppingFacts('u1', makeReadStore({
      code: '42P01',
      message: 'relation "public.shopping_facts" does not exist',
    }));
    expect(result).toEqual({ facts: [], degraded: true });
    expect(result.error).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('读路径正常数据 → 逐行复检 (脏行丢弃), 合法行原样带出', async () => {
    const result = await loadShoppingFacts('u1', makeReadStore(null, [
      { category: 'size', key: '鞋码', value: '春秋穿 42' },
      { category: 'style', key: 'x', value: '枚举外脏行' }, // 读侧复检应丢弃
    ]));
    expect(result).toEqual({ facts: [{ category: 'size', key: '鞋码', value: '春秋穿 42' }] });
    expect(result.degraded).toBeUndefined();
  });

  it('读路径 batch25-b: 按 updated_at 新→旧排序 (乱序入库行, 输出新者优先)', async () => {
    const result = await loadShoppingFacts('u1', makeReadStore(null, [
      { category: 'budget', key: 'budget', value: '预算旧值', updated_at: '2026-09-01T00:00:00Z' },
      { category: 'size', key: 'size', value: '最新尺码', updated_at: '2026-09-07T00:00:00Z' },
      { category: 'preference', key: 'prefer', value: '较早偏好', updated_at: '2026-09-03T00:00:00Z' },
    ]));
    expect(result.facts.map((fact) => fact.value)).toEqual(['最新尺码', '较早偏好', '预算旧值']);
  });

  it('读路径其他错误 → error 字段带出 + 空数组, 不抛异常', async () => {
    const result = await loadShoppingFacts('u1', makeReadStore({ message: 'connection reset' }));
    expect(result).toEqual({ facts: [], error: 'connection reset' });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
