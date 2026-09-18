/**
 * Tests for GET /api/transparency/weekly (batch81-a)
 *
 * - 200 成功: mock admin client 聚合三表 → 快照键面契约 + 零 user 字段 (红线) + 公共缓存头
 * - 降级阶梯 (恒 200, 不抛 500):
 *     a) 聚合查询失败 → 快照表最新 payload (degraded:true)
 *     b) 聚合失败且快照表读失败/无行 → 进程内缓存 (degraded:true, 原 generatedAt 保留)
 *     c) 无 admin client + 无缓存 → 零值骨架 (degraded:true)
 * - 成功路径 best-effort 持久化快照表 (upsert 不阻塞主流程)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';
import { __setTransparencyMemoryCacheForTests } from '@/lib/transparency-weekly-server';
import {
  aggregateTransparency,
  type TransparencyHealthRow,
  type TransparencyPassedChallengeRow,
  type TransparencySnapshot,
} from '@/lib/transparency-weekly';

type QueryResult = { data: readonly unknown[] | null; error: { message: string } | null };
type Terminal = () => Promise<QueryResult>;

function makeChain(terminal: Terminal) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'upsert']) chain[m] = vi.fn(() => chain);
  // 链式 builder 被 await 时解析为 terminal 结果 (读/写共用)
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve().then(terminal).then(onFulfilled, onRejected);
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function makeDb(chains: Record<string, ReturnType<typeof makeChain>>) {
  return { from: vi.fn((table: string) => chains[table]) };
}

function mockAdmin(db: ReturnType<typeof makeDb> | null) {
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
    db ? { supabase: db, error: null } : { supabase: null, error: 'missing key' },
  );
}

const NOW = new Date();
const WEEK_START_MS = (() => {
  const dayStart = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7;
  return dayStart - dow * 86_400_000;
})();
const IN_WEEK = new Date(WEEK_START_MS + 3_600_000).toISOString();
const LAST_WEEK = new Date(WEEK_START_MS - 86_400_000).toISOString();

const HEALTH_ROWS: TransparencyHealthRow[] = [
  { id: 'h1', user_id: 'u1', event_type: 'challenge_completed', trigger_id: 't1', created_at: IN_WEEK },
  { id: 'h2', user_id: 'u2', event_type: 'challenge_failed', trigger_id: 't2', created_at: IN_WEEK },
  { id: 'h3', user_id: 'u1', event_type: 'challenge_completed', trigger_id: 't3', created_at: LAST_WEEK },
];

const PASSED_ROWS: TransparencyPassedChallengeRow[] = [
  { amount: 100, completed_at: IN_WEEK },
  { amount: 50, completed_at: LAST_WEEK },
];

function okChain(rows: readonly unknown[]) {
  return makeChain(async () => ({ data: rows, error: null }));
}

function errChain() {
  return makeChain(async () => ({ data: null, error: { message: 'boom' } }));
}

function seededSnapshot(): TransparencySnapshot {
  return { ...aggregateTransparency(HEALTH_ROWS, PASSED_ROWS, NOW), generatedAt: '2026-09-01T00:00:00.000Z' };
}

async function getJson(): Promise<{ status: number; body: Record<string, unknown>; raw: string; cacheControl: string }> {
  const res = await GET();
  const body = (await res.json()) as Record<string, unknown>;
  return {
    status: res.status,
    body,
    raw: JSON.stringify(body),
    cacheControl: res.headers.get('Cache-Control') ?? '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTransparencyMemoryCacheForTests(null);
});

describe('GET /api/transparency/weekly — success', () => {
  it('aggregates the three tables into the public snapshot contract', async () => {
    const snapshots = makeChain(async () => ({ data: null, error: null }));
    mockAdmin(makeDb({ health_events: okChain(HEALTH_ROWS), active_challenges: okChain(PASSED_ROWS), transparency_snapshots: snapshots }));

    const { status, body, raw, cacheControl } = await getJson();

    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual([
      'weekStart', 'weekEnd', 'intercepts', 'savedUsd', 'hoursWon', 'guards', 'generatedAt', 'degraded',
    ]);
    expect(body.intercepts).toEqual({ week: 2, total: 3 });
    expect(body.savedUsd).toEqual({ week: 100, total: 150 });
    expect(body.hoursWon).toEqual({ week: 4, total: 6 });
    expect(body.guards).toBe(1); // 只有 u1 有 completed
    expect(body.degraded).toBe(false);
    // 金额红线: 聚合快照序列化产物无任何用户级字段
    expect(raw).not.toMatch(/user/i);
    expect(cacheControl).toContain('s-maxage');
  });

  it('persists the fresh snapshot best-effort (upsert awaited, errors swallowed)', async () => {
    const snapshots = makeChain(async () => ({ data: null, error: { message: 'relation does not exist' } }));
    mockAdmin(makeDb({ health_events: okChain(HEALTH_ROWS), active_challenges: okChain(PASSED_ROWS), transparency_snapshots: snapshots }));

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.degraded).toBe(false);
    expect(snapshots.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = (snapshots.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as { week_start: string; payload: TransparencySnapshot };
    expect(upsertArg.week_start).toBe((body.weekStart as string).slice(0, 10));
    expect(upsertArg.payload.intercepts).toEqual({ week: 2, total: 3 });
  });
});

describe('GET /api/transparency/weekly — degrade ladder (always 200)', () => {
  it('falls back to the persisted snapshot row when aggregation fails', async () => {
    const persisted = seededSnapshot();
    const snapshots = makeChain(async () => ({ data: [{ payload: persisted }], error: null }));
    mockAdmin(makeDb({ health_events: errChain(), active_challenges: okChain(PASSED_ROWS), transparency_snapshots: snapshots }));

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.intercepts).toEqual(persisted.intercepts);
    expect(body.generatedAt).toBe('2026-09-01T00:00:00.000Z'); // 数据年龄诚实保留
  });

  it('falls back to the in-memory cache when queries and snapshot table both fail', async () => {
    const cached = seededSnapshot();
    __setTransparencyMemoryCacheForTests(cached);
    const snapshots = makeChain(async () => ({ data: null, error: { message: 'relation does not exist' } }));
    mockAdmin(makeDb({ health_events: errChain(), active_challenges: errChain(), transparency_snapshots: snapshots }));

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.savedUsd).toEqual(cached.savedUsd);
    expect(body.guards).toBe(cached.guards);
  });

  it('returns the zeroed skeleton when there is no client, no cache, no persisted row', async () => {
    mockAdmin(null);

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.intercepts).toEqual({ week: 0, total: 0 });
    expect(body.savedUsd).toEqual({ week: 0, total: 0 });
    expect(body.hoursWon).toEqual({ week: 0, total: 0 });
    expect(body.guards).toBe(0);
  });

  it('treats an invalid persisted payload as no snapshot (validator rejects, falls to skeleton)', async () => {
    const snapshots = makeChain(async () => ({ data: [{ payload: { hello: 'world' } }], error: null }));
    mockAdmin(makeDb({ health_events: errChain(), active_challenges: errChain(), transparency_snapshots: snapshots }));

    const { status, body } = await getJson();

    expect(status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.intercepts).toEqual({ week: 0, total: 0 });
  });
});
