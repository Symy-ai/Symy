/**
 * context-trust-evidence — 服务端隐私投影契约 (batch77-b)
 *
 * - history: health_events 投影为短类目标签 (description/occurredAt), 无原文/金额字段
 * - correction: 消费既有 manual_adjustment audit 行 (source=context_trust_correction)
 * - 查询失败: Supabase 风格 error 对象 → 空结果不抛; promise rejection 由上游
 *   route.ts:785 `.catch(() => ({ history: [], correction: null }))` 兜底, chat 不被阻塞
 */

import { describe, it, expect } from 'vitest';
import { loadContextTrustEvidence, type EvidenceStore } from '../context-trust-evidence';

const HISTORY_FETCH = 24; // HISTORY_LIMIT(6) * 4
const CORRECTION_LIMIT = 20;

interface StoreCalls {
  tables: string[];
  columns: string[];
  eq: Array<[string, string]>;
  order: Array<[string, { ascending: boolean }]>;
  limits: number[];
}

function makeStore(
  opts: {
    historyRows?: unknown[];
    correctionRows?: unknown[];
    /** Supabase 风格失败: { data: null, error: {...} } (不 rejection) */
    failWith?: { message: string };
    /** promise rejection (route.ts .catch 兜底的路径) */
    reject?: boolean;
  } = {},
): { store: EvidenceStore; calls: StoreCalls } {
  const calls: StoreCalls = { tables: [], columns: [], eq: [], order: [], limits: [] };
  const store = {
    from: (table: string) => {
      calls.tables.push(table);
      const chain = {
        select: (columns: string) => {
          calls.columns.push(columns);
          return chain;
        },
        eq: (column: string, value: string) => {
          calls.eq.push([column, value]);
          return chain;
        },
        order: (column: string, options: { ascending: boolean }) => {
          calls.order.push([column, options]);
          return chain;
        },
        limit: (count: number) => {
          calls.limits.push(count);
          return {
            then: (
              onFulfilled: (r: { data?: unknown[] | null; error?: { message?: string } | null }) => unknown,
              onRejected: (e: unknown) => unknown,
            ) =>
              Promise.resolve().then(() => {
                if (opts.reject) return onRejected(new Error('db down'));
                if (opts.failWith) return onFulfilled({ data: null, error: opts.failWith });
                const data = count >= HISTORY_FETCH ? (opts.historyRows ?? []) : (opts.correctionRows ?? []);
                return onFulfilled({ data, error: null });
              }),
          };
        },
      };
      return chain;
    },
  };
  return { store: store as unknown as EvidenceStore, calls };
}

describe('history 隐私投影', () => {
  it('只投影短类目标签 + 时间: 无 metadata 原文/金额字段', async () => {
    const { store } = makeStore({
      historyRows: [
        {
          event_type: 'challenge_completed',
          metadata: { category: 'coffee', amount: 129.99, itemName: 'oat latte', note: 'raw event text' },
          created_at: '2026-09-01T10:00:00',
        },
        { event_type: 'challenge_failed', metadata: null, created_at: '2026-09-02T10:00:00' },
      ],
      correctionRows: [],
    });
    const history = (await loadContextTrustEvidence('u1', store)).history ?? [];

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ description: 'coffee', occurredAt: '2026-09-01T10:00:00' });
    // metadata 无 category → 固定兜底短标签, 不透传原文
    expect(history[1]!.description).toBe('shopping decision');
    for (const item of history) {
      expect(Object.keys(item).every((k) => k === 'description' || k === 'occurredAt')).toBe(true);
    }
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain('129.99');
    expect(serialized).not.toContain('oat latte');
    expect(serialized).not.toContain('raw event text');
  });

  it('只含 challenge_completed/challenge_failed, 最多 6 条', async () => {
    const { store } = makeStore({
      historyRows: [
        ...Array.from({ length: 8 }, (_, i) => ({
          event_type: 'challenge_completed',
          metadata: { category: `c${i}` },
          created_at: `2026-09-0${i + 1}T10:00:00`,
        })),
        { event_type: 'manual_adjustment', metadata: { category: 'sneak-in' }, created_at: '2026-09-09T10:00:00' },
      ],
      correctionRows: [],
    });
    const history = (await loadContextTrustEvidence('u1', store)).history ?? [];
    expect(history).toHaveLength(6);
    expect(history.every((h) => h.description.startsWith('c'))).toBe(true);
  });
});

describe('correction 消费既有 audit 行', () => {
  it('manual_adjustment + context_trust_correction → 最近一条 correction', async () => {
    const { store } = makeStore({
      historyRows: [],
      correctionRows: [
        { event_type: 'manual_adjustment', metadata: { source: 'other_source' }, created_at: '2026-09-03T10:00:00' },
        { event_type: 'challenge_completed', metadata: { source: 'context_trust_correction', signalId: 'sig-x', reason: 'not_me' }, created_at: '2026-09-02T10:00:00' },
        { event_type: 'manual_adjustment', metadata: { source: 'context_trust_correction' }, created_at: '2026-09-02T09:00:00' },
        { event_type: 'manual_adjustment', metadata: { source: 'context_trust_correction', signalId: '', reason: 'not_me' }, created_at: '2026-09-02T08:00:00' },
        { event_type: 'manual_adjustment', metadata: { source: 'context_trust_correction', signalId: 'sig-1', reason: 'typosquat' }, created_at: '2026-09-02T07:00:00' },
        { event_type: 'manual_adjustment', metadata: { source: 'context_trust_correction', signalId: 'sig-1', reason: 'not_me' }, created_at: '2026-09-01T10:00:00' },
      ],
    });
    const { correction } = await loadContextTrustEvidence('u1', store);
    // 无效行 (错 source/错 event_type/缺 signalId/非法 reason) 全部跳过, 首个有效行胜出
    expect(correction).toEqual({ kind: 'not_me', topic: 'sig-1', occurredAt: '2026-09-01T10:00:00' });
  });

  it('三种 kind (expired/different_context) 均透传', async () => {
    for (const kind of ['expired', 'different_context'] as const) {
      const { store } = makeStore({
        historyRows: [],
        correctionRows: [
          { event_type: 'manual_adjustment', metadata: { source: 'context_trust_correction', signalId: 'sig-9', reason: kind }, created_at: null },
        ],
      });
      const { correction } = await loadContextTrustEvidence('u1', store);
      expect(correction).toEqual({ kind, topic: 'sig-9', occurredAt: undefined });
    }
  });
});

describe('查询失败降级 (chat 不被阻塞)', () => {
  it('Supabase 风格 error 对象 → 空 history + null correction, 不抛', async () => {
    const { store } = makeStore({ failWith: { message: 'permission denied' } });
    await expect(loadContextTrustEvidence('u1', store)).resolves.toEqual({ history: [], correction: null });
  });

  it('promise rejection 向上传播, 由上游 route .catch 兜底为空结果', async () => {
    const { store } = makeStore({ reject: true });
    // 钉 route.ts:785 的接线契约: .catch(() => ({ history: [], correction: null }))
    const wired = loadContextTrustEvidence('u1', store).catch(() => ({ history: [], correction: null }));
    await expect(wired).resolves.toEqual({ history: [], correction: null });
  });
});

describe('查询形状 (只读 health_events, 零写入)', () => {
  it('两次查询均 health_events + user_id 过滤 + created_at 倒序, limit 24/20', async () => {
    const { store, calls } = makeStore({ historyRows: [], correctionRows: [] });
    await loadContextTrustEvidence('user-7', store);
    expect(calls.tables).toEqual(['health_events', 'health_events']);
    expect(calls.columns).toEqual(['event_type,metadata,created_at', 'event_type,metadata,created_at']);
    expect(calls.eq).toEqual([['user_id', 'user-7'], ['user_id', 'user-7']]);
    expect(calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['created_at', { ascending: false }],
    ]);
    expect(calls.limits).toEqual([HISTORY_FETCH, CORRECTION_LIMIT]);
  });
});
