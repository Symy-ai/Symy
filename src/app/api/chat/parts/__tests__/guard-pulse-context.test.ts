import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const snapshotMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../chat-profile-snapshot', () => ({
  getChatProfileSnapshot: snapshotMock.get,
}));

import { GUARD_PULSE_EVENT_TYPES, loadGuardPulseQueryData } from '../guard-pulse-context';

function makeStore(data: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const calls: string[] = [];
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[m] = vi.fn((..._a: unknown[]) => {
      calls.push(m);
      return chain;
    });
  }
  // 同步 thenable (alt-adoption 先例模式 — Promise.all 兼容)
  chain.then = (onFulfilled: (r: { data: unknown }) => unknown) => onFulfilled({ data });
  return { store: { from: vi.fn(() => chain) } as never, calls };
}

/**
 * guard-pulse-context.ts (105行) — 守护脉搏装载 (batch68-c 服务端 part)。
 *
 * 口径红线: 查询失败 → 空降级绝不阻塞聊天; 只读两张表。
 *
 * 锁定:
 * - 未登录/无 store → 空事件+undefined 时区
 * - 行映射 snake→camel; 三事件类型集
 * - timezone 从共享快照取 (非空校验)
 * - 查询抛错 → 空降级
 */
describe('loadGuardPulseQueryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotMock.get.mockResolvedValue({ timezone: 'Asia/Shanghai' });
  });

  it('未登录/无 store → 空+undefined', async () => {
    expect(await loadGuardPulseQueryData({ userId: undefined, store: makeStore().store })).toEqual({ events: [], timezone: undefined });
    expect(await loadGuardPulseQueryData({ userId: 'u1', store: null })).toEqual({ events: [], timezone: undefined });
  });

  it('行映射 snake→camel + 查询链形状', async () => {
    const { store, calls } = makeStore([
      { event_type: 'challenge_completed', metadata: { kind: 'adoption' }, created_at: '2026-01-01T00:00:00Z' },
      { event_type: 42, metadata: null, created_at: '2026-01-02T00:00:00Z' }, // event_type 非 string → ''
    ]);
    const r = await loadGuardPulseQueryData({ userId: 'u1', store });
    expect(r.events[0]).toEqual({ eventType: 'challenge_completed', metadata: { kind: 'adoption' }, createdAt: '2026-01-01T00:00:00Z' });
    expect(r.events[1].eventType).toBe(''); // 非 string 防线
    expect(r.timezone).toBe('Asia/Shanghai');
    expect(calls).toEqual(['select', 'eq', 'in', 'order', 'limit']); // 查询链全形状
  });

  it('三事件类型集锚 (拦截轮次+采纳轨道)', () => {
    expect(GUARD_PULSE_EVENT_TYPES).toEqual(['challenge_completed', 'challenge_failed', 'mindful_recovery']);
  });

  it('快照 timezone 空 → undefined', async () => {
    snapshotMock.get.mockResolvedValue({ timezone: '' });
    const { store } = makeStore([]);
    const r = await loadGuardPulseQueryData({ userId: 'u1', store });
    expect(r.timezone).toBeUndefined();
  });

  it('查询抛错 → 空降级不阻塞', async () => {
    const badStore = {
      from: () => {
        throw new Error('db down');
      },
    } as never;
    const r = await loadGuardPulseQueryData({ userId: 'u1', store: badStore });
    expect(r).toEqual({ events: [], timezone: undefined });
  });
});
