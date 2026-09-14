/**
 * guard-style-context 测试 (batch56-c)
 *
 * 覆盖: 有数据 → symy_guard_style 行产出 (计数/无金额/非羞辱指令);
 * 无数据/失败 → line undefined; 查询形状契约 (两条 eq 过滤)。
 */
import { describe, it, expect } from 'vitest';
import { buildGuardStyleLine, loadGuardStyleContext, type GuardStyleStore } from '../guard-style-context';
import { aggregateGuardStyleProfile, type GuardStyleEventInput } from '@/lib/guard-style-profile';

const d = (day: number) => new Date(2026, 8, day, 10, 0, 0).toISOString();

describe('buildGuardStyleLine', () => {
  it('画像 → 单行摘要: symy_guard_style 前缀 + 三轨计数 + 均衡型非羞辱指令', () => {
    const events: GuardStyleEventInput[] = [
      { eventType: 'challenge_completed', createdAt: d(1) },
      { eventType: 'challenge_completed', createdAt: d(2) },
      { eventType: 'challenge_completed', createdAt: d(3) },
      { eventType: 'challenge_completed', createdAt: d(4) },
      { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption' }, createdAt: d(5) },
      { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption' }, createdAt: d(6) },
    ];
    const line = buildGuardStyleLine(aggregateGuardStyleProfile(events))!;
    expect(line).toContain('symy_guard_style:');
    expect(line).toContain('guard 4 / alternative 1 / reuse 1');
    expect(line).toContain('NOT falling behind');
    expect(line).toContain('never shame');
  });

  it('insufficient → undefined (字段省略)', () => {
    expect(buildGuardStyleLine(aggregateGuardStyleProfile([]))).toBeUndefined();
  });

  it('金额红线: 注入行无金额', () => {
    const line = buildGuardStyleLine(
      aggregateGuardStyleProfile([
        { eventType: 'challenge_completed', metadata: { savedAmount: 999 }, createdAt: d(1) },
        { eventType: 'challenge_completed', metadata: { savedAmount: 999 }, createdAt: d(2) },
        { eventType: 'challenge_completed', metadata: { savedAmount: 999 }, createdAt: d(3) },
        { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', estSaved: 888 }, createdAt: d(4) },
        { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', estSaved: 777 }, createdAt: d(5) },
      ]),
    )!;
    expect(line).not.toContain('999');
    expect(line).not.toContain('888');
    expect(line).not.toContain('777');
  });
});

/** stub: 按 event_type 过滤值分流返回 (验证两条查询契约) */
function stubStore(byEventType: Record<string, unknown[]>, shouldThrow = false): GuardStyleStore {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          eq: (_c2: string, val2: string) => ({
            order: () => ({
              limit: () => ({
                then: (
                  onFulfilled: (r: { data: unknown }) => unknown,
                  onRejected: (e: unknown) => unknown,
                ) => {
                  if (shouldThrow) return onRejected(new Error('db down'));
                  if (val2 === 'challenge_completed') return onFulfilled({ data: byEventType.challenge_completed || [] });
                  if (val2 === 'mindful_recovery') return onFulfilled({ data: byEventType.mindful_recovery || [] });
                  return onFulfilled({ data: [] });
                },
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as GuardStyleStore;
}

describe('loadGuardStyleContext', () => {
  it('有数据 → line 拼入 prompt 载荷', async () => {
    const res = await loadGuardStyleContext({
      userId: 'u1',
      store: stubStore({
        challenge_completed: [
          { event_type: 'challenge_completed', trigger_id: null, metadata: null, created_at: d(1) },
          { event_type: 'challenge_completed', trigger_id: null, metadata: null, created_at: d(2) },
          { event_type: 'challenge_completed', trigger_id: null, metadata: null, created_at: d(3) },
          { event_type: 'challenge_completed', trigger_id: null, metadata: null, created_at: d(4) },
        ],
        mindful_recovery: [
          { event_type: 'mindful_recovery', trigger_id: null, metadata: { kind: 'green_alt_adoption' }, created_at: d(5) },
          { event_type: 'mindful_recovery', trigger_id: null, metadata: { kind: 'reuse_adoption' }, created_at: d(6) },
        ],
      }),
    });
    expect(res.line).toContain('symy_guard_style:');
    expect(res.profile.status).toBe('ok');
  });

  it('无数据 → line undefined, profile insufficient', async () => {
    const res = await loadGuardStyleContext({ userId: 'u1', store: stubStore({}) });
    expect(res.line).toBeUndefined();
    expect(res.profile.status).toBe('insufficient');
  });

  it('样本不足 (<5) → line undefined', async () => {
    const res = await loadGuardStyleContext({
      userId: 'u1',
      store: stubStore({
        challenge_completed: [
          { event_type: 'challenge_completed', trigger_id: null, metadata: null, created_at: d(1) },
        ],
      }),
    });
    expect(res.line).toBeUndefined();
  });

  it('查询失败 → 静默降级不抛错', async () => {
    const res = await loadGuardStyleContext({ userId: 'u1', store: stubStore({}, true) });
    expect(res.line).toBeUndefined();
    expect(res.profile.status).toBe('insufficient');
  });

  it('无 userId / 无 store → 降级', async () => {
    expect((await loadGuardStyleContext({ userId: undefined, store: stubStore({}) })).line).toBeUndefined();
    expect((await loadGuardStyleContext({ userId: 'u1', store: null })).line).toBeUndefined();
  });
});
