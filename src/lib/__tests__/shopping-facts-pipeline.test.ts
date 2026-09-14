/**
 * shopping-facts 管道编排件测试 — batch25-b / batch27-b (Letta core memory 同步接线)
 *
 * 覆盖: 提取→落库 happy path / 无命中与无 userId 零 store 调用 /
 *       42P01 降级 (warn 不 error, 不 throw) / 编排层异常吞掉只留 warn /
 *       摘要拼行 (updated_at 新者优先 ≤5 条) / ≤240 截断 /
 *       值内括号换行剥离 (纵深防御) / 读侧失败静默 undefined /
 *       batch27-b: diff 非空 → fire-and-forget sync 一次 / 同值重提零 sync /
 *       落库失败与 degraded 零 sync。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFactsSummary,
  extractAndSaveFacts,
  loadFactsForContext,
  MAX_CONTEXT_FACTS,
  MAX_FACTS_SUMMARY_CHARS,
  type ShoppingFactsPipelineStore,
} from '../shopping-facts-pipeline';
import { loadShoppingFacts, saveShoppingFacts, type ShoppingFactsReadStore } from '../shopping-facts';
import { syncFactsToCoreMemory } from '@/lib/letta-facts-sync';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// batch27-b: sync 件 mock — 编排层断言只看调用与否/参数, sync 内部行为归
// letta-facts-sync.test.ts 管 (单向依赖: pipeline → sync, 测试同向分治)
vi.mock('@/lib/letta-facts-sync', () => ({
  syncFactsToCoreMemory: vi.fn().mockResolvedValue(undefined),
}));

// fireAndForgetSafely 直通执行 (注册表语义无关测试), 隔离 @vercel/functions
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: (promise: Promise<unknown>) => {
    void promise;
  },
}));

// 包装成 vi.fn 但默认委托真实实现 — 仅供编排层异常用例 mockRejectedValueOnce
vi.mock('../shopping-facts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shopping-facts')>();
  return {
    ...actual,
    saveShoppingFacts: vi.fn(actual.saveShoppingFacts),
    loadShoppingFacts: vi.fn(actual.loadShoppingFacts),
  };
});

/** 内存行类型 — 对齐 ShoppingFactsReadStore 读侧行形状 (tsc 严格推断需要显式字段) */
interface StubFactRow {
  user_id: unknown;
  category: unknown;
  key: unknown;
  value: unknown;
  updated_at?: unknown;
}

/**
 * stub 写 store (照抄 shopping-facts.test.ts 注入模式)。
 * batch27-b: 返回写+读组合 store — 读侧是内存表 (upsert 真实覆盖 + updated_at 戳),
 * 让编排层 diff 检测 (落库前后各读一次) 在测试里走真逻辑。
 */
function makePipelineStore(upsertError: { message: string; code?: string } | null = null) {
  const calls: Array<{ rows: Array<Record<string, unknown>>; options: { onConflict: string } }> = [];
  const rows: StubFactRow[] = [];
  const store: ShoppingFactsPipelineStore = {
    from(table: string) {
      expect(table).toBe('shopping_facts');
      return {
        upsert(newRows: Array<Record<string, unknown>>, options: { onConflict: string }) {
          calls.push({ rows: newRows, options });
          if (!upsertError) {
            for (const row of newRows) {
              const stamped: StubFactRow = {
                user_id: row.user_id,
                category: row.category,
                key: row.key,
                value: row.value,
                updated_at: new Date().toISOString(),
              };
              const idx = rows.findIndex(
                (r) => r.user_id === row.user_id && r.category === row.category && r.key === row.key,
              );
              if (idx >= 0) rows[idx] = stamped;
              else rows.push(stamped);
            }
          }
          return Promise.resolve({ error: upsertError });
        },
        select() {
          return {
            eq() {
              const data: Array<{ category: unknown; key: unknown; value: unknown; updated_at?: unknown }> =
                rows.map((row) => ({ category: row.category, key: row.key, value: row.value, updated_at: row.updated_at }));
              return Promise.resolve({ data, error: null as { message: string; code?: string } | null });
            },
          };
        },
      };
    },
  };
  return { store, calls, rows };
}

/** 兼容旧用例名: 写通道 stub (现含内存读侧) */
function makeUpsertStore(error: { message: string; code?: string } | null = null) {
  const { store, calls } = makePipelineStore(error);
  return { store, calls };
}

/** stub 读 store (乱序行 + updated_at, 验证读侧排序) */
function makeReadStore(
  data: Array<{ category: unknown; key: unknown; value: unknown; updated_at?: unknown }> | null,
  error: { message: string; code?: string } | null = null,
) {
  let queried = false;
  const store: ShoppingFactsReadStore = {
    from(table: string) {
      expect(table).toBe('shopping_facts');
      return {
        select() {
          return {
            eq() {
              queried = true;
              return Promise.resolve({ data, error });
            },
          };
        },
      };
    },
  };
  return { store, wasQueried: () => queried };
}

beforeEach(() => {
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.error).mockClear();
  vi.mocked(saveShoppingFacts).mockClear();
  vi.mocked(loadShoppingFacts).mockClear();
  vi.mocked(syncFactsToCoreMemory).mockClear();
});

describe('extractAndSaveFacts — 写管道', () => {
  it('happy path: 提取 2 条 → 单次 upsert, 行带 user_id, 冲突键不变', async () => {
    const { store, calls } = makeUpsertStore();
    const result = await extractAndSaveFacts({
      userId: 'u1',
      text: '我穿 42 码，预算 500 以内',
      locale: 'zh',
      store,
    });
    expect(result).toEqual({ extracted: 2, saved: 2, rejected: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual({ onConflict: 'user_id,category,key' });
    expect(calls[0].rows.every((row) => row.user_id === 'u1')).toBe(true);
  });

  it('无命中文本 → 不触碰 store', async () => {
    const { store, calls } = makeUpsertStore();
    const result = await extractAndSaveFacts({ userId: 'u1', text: '今天天气不错', locale: 'zh', store });
    expect(result).toEqual({ extracted: 0, saved: 0, rejected: 0 });
    expect(calls).toHaveLength(0);
  });

  it('注入串 → 整条丢弃, 不触碰 store', async () => {
    const { store, calls } = makeUpsertStore();
    const result = await extractAndSaveFacts({
      userId: 'u1',
      text: '<message>我穿 42 码</message>',
      locale: 'zh',
      store,
    });
    expect(result.extracted).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('无 userId (guest) → 提取照跑但不落库, 不触碰 store', async () => {
    const { store, calls } = makeUpsertStore();
    const result = await extractAndSaveFacts({ userId: undefined, text: '我穿 42 码', locale: 'zh', store });
    expect(result).toEqual({ extracted: 1, saved: 0, rejected: 0 });
    expect(calls).toHaveLength(0);
  });

  it('42P01 表缺失 → degraded=true, warn 级无 error 级, 不 throw', async () => {
    const { store } = makeUpsertStore({ code: '42P01', message: 'relation "shopping_facts" does not exist' });
    const result = await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(result.degraded).toBe(true);
    expect(result.error).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('编排层异常 (store 崩溃穿透落库件) → 吞掉只留 warn, 不 throw', async () => {
    vi.mocked(saveShoppingFacts).mockRejectedValueOnce(new Error('db exploded'));
    const { store } = makeUpsertStore();
    const result = await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(result.saved).toBe(0);
    expect(result.error).toBe('db exploded');
    expect(logger.warn).toHaveBeenCalledWith('[ShoppingFactsPipeline] extractAndSaveFacts failed:', 'db exploded');
  });
});

describe('loadFactsForContext — 读管道', () => {
  const sevenRows = [
    { category: 'size', key: 'size_1', value: 'v1', updated_at: '2026-08-01T00:00:00Z' },
    { category: 'size', key: 'size_7', value: 'v7', updated_at: '2026-08-07T00:00:00Z' },
    { category: 'size', key: 'size_3', value: 'v3', updated_at: '2026-08-03T00:00:00Z' },
    { category: 'size', key: 'size_5', value: 'v5', updated_at: '2026-08-05T00:00:00Z' },
    { category: 'size', key: 'size_2', value: 'v2', updated_at: '2026-08-02T00:00:00Z' },
    { category: 'size', key: 'size_6', value: 'v6', updated_at: '2026-08-06T00:00:00Z' },
    { category: 'size', key: 'size_4', value: 'v4', updated_at: '2026-08-04T00:00:00Z' },
  ];

  it('取最近 ≤5 条 (updated_at 新者优先), 拼单行 category: value', async () => {
    const { store } = makeReadStore(sevenRows);
    const summary = await loadFactsForContext({ userId: 'u1', store });
    expect(summary).toBe('size: v7 | size: v6 | size: v5 | size: v4 | size: v3');
  });

  it('总长 ≤240: 超限截断, 新者留下旧者截弃', async () => {
    const longValue = '很'.repeat(80); // "budget: " + 80 = 88/段, 两段 179 ≤240, 三段 270 > 240
    const { store } = makeReadStore([
      { category: 'budget', key: 'budget', value: longValue, updated_at: '2026-08-01T00:00:00Z' },
      { category: 'budget', key: 'budget', value: longValue, updated_at: '2026-08-03T00:00:00Z' },
      { category: 'budget', key: 'budget', value: longValue, updated_at: '2026-08-02T00:00:00Z' },
    ]);
    const summary = await loadFactsForContext({ userId: 'u1', store });
    expect(summary).toBeDefined();
    expect(summary!.length).toBeLessThanOrEqual(MAX_FACTS_SUMMARY_CHARS);
    expect(summary!.split(' | ')).toHaveLength(2);
  });

  it('纵深防御: 值内括号/尖括号/换行被剥离后才进摘要', async () => {
    const { store } = makeReadStore([
      { category: 'preference', key: 'prefer', value: '纯棉\n[best] <top>', updated_at: '2026-08-01T00:00:00Z' },
    ]);
    const summary = await loadFactsForContext({ userId: 'u1', store });
    expect(summary).toBe('preference: 纯棉 best top');
    expect(summary).not.toMatch(/[\[\]<>]/);
    expect(summary).not.toContain('\n');
  });

  it('空态/失败全部静默 undefined', async () => {
    const empty = makeReadStore([]);
    expect(await loadFactsForContext({ userId: 'u1', store: empty.store })).toBeUndefined();

    const missing = makeReadStore(null, { code: '42P01', message: 'relation does not exist' });
    expect(await loadFactsForContext({ userId: 'u1', store: missing.store })).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();

    const failed = makeReadStore(null, { message: 'connection reset' });
    expect(await loadFactsForContext({ userId: 'u1', store: failed.store })).toBeUndefined();

    const untouched = makeReadStore(sevenRows);
    expect(await loadFactsForContext({ userId: undefined, store: untouched.store })).toBeUndefined();
    expect(untouched.wasQueried()).toBe(false);
  });
});

describe('buildFactsSummary — 摘要纯函数', () => {
  it('≤MAX_CONTEXT_FACTS 条; 空输入 → undefined', () => {
    const facts = Array.from({ length: MAX_CONTEXT_FACTS + 2 }, (_, i) => ({
      category: 'size' as const,
      key: `size_${i}`,
      value: `值${i}`,
    }));
    const summary = buildFactsSummary(facts);
    expect(summary!.split(' | ')).toHaveLength(MAX_CONTEXT_FACTS);
    expect(buildFactsSummary([])).toBeUndefined();
  });

  it('单段自身超限 → 丢弃该段不硬截, 后续短段照常', () => {
    const summary = buildFactsSummary([
      { category: 'budget', key: 'budget', value: '很'.repeat(300) },
      { category: 'size', key: 'size', value: 'EU 42' },
    ]);
    expect(summary).toBe('size: EU 42');
  });
});

describe('extractAndSaveFacts — Letta core memory 同步接线 (batch27-b)', () => {
  it('新增 facts (diff 非空) → fire-and-forget sync 一次, 参数为 userId + 落库后最新 facts', async () => {
    const { store } = makePipelineStore();
    await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(syncFactsToCoreMemory).toHaveBeenCalledTimes(1);
    const [calledUserId, calledFacts] = vi.mocked(syncFactsToCoreMemory).mock.calls[0];
    expect(calledUserId).toBe('u1');
    expect(calledFacts).toEqual([{ category: 'size', key: 'size', value: '穿 42 码' }]);
  });

  it('值变更 (42→44 后改口 42 之外的值) → sync 触发', async () => {
    const { store, rows } = makePipelineStore();
    rows.push({ user_id: 'u1', category: 'size', key: 'size', value: '穿 40 码', updated_at: '2026-09-01T00:00:00Z' });
    await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(syncFactsToCoreMemory).toHaveBeenCalledTimes(1);
  });

  it('无变更 (同值重提) → 零 sync (diff 空, 不打 Letta)', async () => {
    const { store, rows } = makePipelineStore();
    rows.push({ user_id: 'u1', category: 'size', key: 'size', value: '穿 42 码', updated_at: '2026-09-07T00:00:00Z' });
    await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(syncFactsToCoreMemory).not.toHaveBeenCalled();
  });

  it('落库失败 (store error) → sync 不触发', async () => {
    const { store } = makePipelineStore({ message: 'connection reset' });
    await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(syncFactsToCoreMemory).not.toHaveBeenCalled();
  });

  it('degraded (42P01 表缺失) → sync 不触发 (表是 source of truth, 未落库不镜像)', async () => {
    const { store } = makePipelineStore({ code: '42P01', message: 'relation "shopping_facts" does not exist' });
    await extractAndSaveFacts({ userId: 'u1', text: '我穿 42 码', locale: 'zh', store });
    expect(syncFactsToCoreMemory).not.toHaveBeenCalled();
  });

  it('无命中/无 userId 早退路径 → sync 零调用', async () => {
    const noHit = makePipelineStore();
    await extractAndSaveFacts({ userId: 'u1', text: '今天天气不错', locale: 'zh', store: noHit.store });
    const guest = makePipelineStore();
    await extractAndSaveFacts({ userId: undefined, text: '我穿 42 码', locale: 'zh', store: guest.store });
    expect(syncFactsToCoreMemory).not.toHaveBeenCalled();
  });
});
