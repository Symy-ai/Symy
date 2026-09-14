import { describe, it, expect } from 'vitest';
import { buildRecentWinsLine, loadRecentWinsContextLine, type RecentWinsStore } from '../recent-wins-context';
import { pickRecentWins, type RecentWinItem, type RecentWinsEventInput } from '@/lib/recent-wins';

describe('buildRecentWinsLine', () => {
  it('高光列表 → 单行摘要: symy_recent_wins 前缀 + non-shame 使用指令', () => {
    const wins: RecentWinItem[] = [
      { kind: 'kept_promise', days: 14, subject: 'coffee', lastAt: '2026-09-07T10:00:00Z' },
      { kind: 'guard_streak', days: 5, lastAt: '2026-09-08T10:00:00Z' },
    ];
    const line = buildRecentWinsLine(wins)!;
    expect(line).toContain('symy_recent_wins:');
    expect(line).toContain('kept a self-promise');
    expect(line).toContain('"coffee"');
    expect(line).toContain('5-day guard streak');
    expect(line).toContain('NOT a performance review');
    expect(line).toContain('Never compare them to failures');
  });

  it('空列表 → undefined (字段省略)', () => {
    expect(buildRecentWinsLine([])).toBeUndefined();
  });

  it('金额红线: 注入行无金额', () => {
    const line = buildRecentWinsLine([{ kind: 'cooldown', count: 2, lastAt: '2026-09-07T10:00:00Z' }])!;
    expect(line).not.toMatch(/\$\d/);
    expect(line).toContain('let go of 2 wishlist item(s)');
  });
});

function stubStore(rows: unknown[], shouldThrow = false): RecentWinsStore {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              then: (onFulfilled: (r: { data: unknown }) => unknown, onRejected: (e: unknown) => unknown) =>
                shouldThrow ? onRejected(new Error('db down')) : onFulfilled({ data: rows }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as RecentWinsStore;
}

function recentIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

describe('loadRecentWinsContextLine', () => {
  it('无 userId / 无 store → undefined', async () => {
    expect(await loadRecentWinsContextLine({ userId: undefined, store: stubStore([]) })).toBeUndefined();
    expect(await loadRecentWinsContextLine({ userId: 'u1', store: null })).toBeUndefined();
  });

  it('查询失败 → 静默降级 undefined, 不抛错', async () => {
    expect(await loadRecentWinsContextLine({ userId: 'u1', store: stubStore([], true) })).toBeUndefined();
  });

  it('无高光 → undefined; 有高光 → 单行摘要', async () => {
    expect(await loadRecentWinsContextLine({ userId: 'u1', store: stubStore([]) })).toBeUndefined();

    // 无效高光事件 (损坏 metadata) → 仍 undefined
    expect(
      await loadRecentWinsContextLine({
        userId: 'u1',
        store: stubStore([{ event_type: 'manual_adjustment', trigger_source: 'manual', trigger_id: null, metadata: null, created_at: recentIso(1) }]),
      }),
    ).toBeUndefined();

    const rows = [
      { event_type: 'manual_adjustment', trigger_source: 'manual', trigger_id: null, metadata: { source: 'cooldown_followup', cooldown_success: true }, created_at: recentIso(1) },
      { event_type: 'challenge_completed', trigger_source: 'impulse', trigger_id: 't0', metadata: null, created_at: recentIso(0) },
    ];
    const line = await loadRecentWinsContextLine({ userId: 'u1', store: stubStore(rows) });
    expect(line).toContain('symy_recent_wins:');
    expect(line).toContain('let go of 1 wishlist item');
  });
});

describe('端到端口径一致性 (pickRecentWins ↔ buildRecentWinsLine)', () => {
  it('lib 输出直接可喂给注入行构造', () => {
    const events: RecentWinsEventInput[] = [
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'green_commitment', subject: 'takeout', start_key: '2026-08-01', end_key: '2026-08-31' }, createdAt: recentIso(30) },
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'green_commitment_settlement', ref_key: '2026-08-01#2026-08-31', outcome: 'kept' }, createdAt: recentIso(1) },
    ];
    const wins = pickRecentWins(events, new Date())!;
    const line = buildRecentWinsLine(wins)!;
    expect(line).toContain('no buying "takeout" for 30 day(s)');
  });
});
