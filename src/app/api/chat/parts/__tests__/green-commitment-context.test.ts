/**
 * green-commitment-context — chat 注入点契约 (batch77-b)
 *
 * - 摘要只含承诺对象原词 (截断 20) + 剩余天数, 无金额 (prompt 注入面最小化红线)
 * - 任何失败 (无 userId / 无 store / 查询失败 / 无进行中承诺) → undefined,
 *   best-effort 静默降级, 绝不阻塞 chat 主流程
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildGreenCommitmentLine,
  loadGreenCommitmentContextLine,
  type GreenCommitmentStore,
} from '../green-commitment-context';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';

const NOW = new Date('2026-09-17T12:00:00'); // 固定「今天」= 本地 2026-09-17

/** green_commitment 登记 metadata 形状 (对齐 src/lib/green-commitment parseRecord) */
function commitmentRow(subject: string, startKey: string, endKey: string) {
  return {
    metadata: { source: 'green_commitment', subject, start_key: startKey, end_key: endKey },
    created_at: `${startKey}T12:00:00`,
  };
}

function stubStore(rows: unknown[], opts: { fail?: boolean; reject?: boolean } = {}) {
  const calls: Record<string, unknown> = {};
  const chain = {
    select: (cols: string) => {
      calls.select = cols;
      return chain;
    },
    eq: (col: string, val: string) => {
      calls[col] = val;
      return chain;
    },
    order: () => chain,
    limit: (n: number) => {
      calls.limit = n;
      return chain;
    },
    then: (
      onFulfilled: (r: { data: unknown }) => unknown,
      onRejected: (e: unknown) => unknown,
    ) =>
      Promise.resolve().then(() => {
        if (opts.reject) return onRejected(new Error('db down'));
        return onFulfilled({ data: opts.fail ? null : rows });
      }),
  };
  const store = { from: (table: string) => { calls.table = table; return chain; } };
  return { store: store as unknown as GreenCommitmentStore, calls };
}

describe('buildGreenCommitmentLine', () => {
  it('摘要含原词 + 到期日 + 剩余天数', () => {
    const line = buildGreenCommitmentLine({ subject: 'sneakers', endKey: '2026-09-20', now: NOW })!;
    expect(line).toContain('symy_green_commitment: active promise — no buying sneakers');
    expect(line).toContain('until 2026-09-20');
    expect(line).toContain('(3 day(s) left)');
    expect(line).toContain('never police');
  });

  it('subject 缺省 → 固定 a category 占位', () => {
    const line = buildGreenCommitmentLine({ subject: null, endKey: '2026-09-20', now: NOW })!;
    expect(line).toContain('no buying a category until 2026-09-20');
  });

  it('原词截断 20 字符 (不透传全长)', () => {
    const line = buildGreenCommitmentLine({ subject: 'abcdefghijklmnopqrstvwxyz', endKey: '2026-09-20', now: NOW })!;
    expect(line).toContain('abcdefghijklmnopqrst');
    expect(line).not.toContain('abcdefghijklmnopqrstvwxyz');
  });

  it('到期当天 / 已过期 → 剩余 0 天', () => {
    expect(buildGreenCommitmentLine({ subject: 'sneakers', endKey: '2026-09-17', now: NOW })).toContain('(0 day(s) left)');
    expect(buildGreenCommitmentLine({ subject: 'sneakers', endKey: '2026-09-01', now: NOW })).toContain('(0 day(s) left)');
  });

  it('注入面红线: 无金额符号; 除到期日/剩余天数外无其他数字', () => {
    const line = buildGreenCommitmentLine({ subject: 'sneakers', endKey: '2026-09-20', now: NOW })!;
    expect(line).not.toContain('$');
    const stripped = line.replace('2026-09-20', '').replace(/\(\d+ day\(s\) left\)/, '');
    expect(stripped).not.toMatch(/\d/);
  });
});

describe('loadGreenCommitmentContextLine', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW.getTime() });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('无 userId / 无 store → undefined', async () => {
    const { store } = stubStore([]);
    expect(await loadGreenCommitmentContextLine({ userId: undefined, store })).toBeUndefined();
    expect(await loadGreenCommitmentContextLine({ userId: 'u1', store: null })).toBeUndefined();
    expect(await loadGreenCommitmentContextLine({ userId: 'u1', store: undefined })).toBeUndefined();
  });

  it('读 manual_adjustment: 表/过滤/limit 形状固定', async () => {
    const { store, calls } = stubStore([commitmentRow('sneakers', '2026-09-10', '2026-09-20')]);
    const line = await loadGreenCommitmentContextLine({ userId: 'u1', store });
    expect(line).toContain('sneakers');
    expect(calls.table).toBe('health_events');
    expect(calls.select).toBe('metadata, created_at');
    expect(calls.user_id).toBe('u1');
    expect(calls.event_type).toBe('manual_adjustment');
    expect(calls.limit).toBe(50);
  });

  it('空数据 / error 对象 (data null) → undefined 不抛', async () => {
    const empty = stubStore([]);
    expect(await loadGreenCommitmentContextLine({ userId: 'u1', store: empty.store })).toBeUndefined();
    const failed = stubStore([], { fail: true });
    expect(await loadGreenCommitmentContextLine({ userId: 'u1', store: failed.store })).toBeUndefined();
  });

  it('查询 rejection → undefined + logger.warn, 不抛 (不阻塞 chat)', async () => {
    const { store } = stubStore([], { reject: true });
    await expect(loadGreenCommitmentContextLine({ userId: 'u1', store })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('[GreenCommitmentContext] load failed:', 'db down');
  });

  it('只有过期未结算承诺 → 不注入 (undefined)', async () => {
    const { store } = stubStore([commitmentRow('sneakers', '2026-09-01', '2026-09-05')]);
    expect(await loadGreenCommitmentContextLine({ userId: 'u1', store })).toBeUndefined();
  });

  it('多条记录取进行中那条 (过期行不干扰)', async () => {
    const { store } = stubStore([
      commitmentRow('takeout', '2026-09-01', '2026-09-05'),
      commitmentRow('sneakers', '2026-09-10', '2026-09-20'),
    ]);
    const line = await loadGreenCommitmentContextLine({ userId: 'u1', store });
    expect(line).toContain('sneakers');
    expect(line).not.toContain('takeout');
  });
});
