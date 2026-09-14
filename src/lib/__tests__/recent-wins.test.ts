import { describe, it, expect } from 'vitest';
import { pickRecentWins, type RecentWinsEventInput } from '@/lib/recent-wins';

const NOW = new Date(2026, 8, 8, 12, 0, 0);

/** 窗口内时间戳 (daysAgo 天前) */
function iso(daysAgo: number, hour = 10): string {
  return new Date(2026, 8, 8 - daysAgo, hour, 0, 0).toISOString();
}

function commitmentEvent(startKey: string, endKey: string, subject: string): RecentWinsEventInput {
  return {
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    triggerId: null,
    metadata: { source: 'green_commitment', subject, start_key: startKey, end_key: endKey },
    createdAt: iso(30),
  };
}

function keptSettlement(startKey: string, endKey: string, daysAgo = 1): RecentWinsEventInput {
  return {
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    triggerId: null,
    metadata: { source: 'green_commitment_settlement', ref_key: `${startKey}#${endKey}`, outcome: 'kept' },
    createdAt: iso(daysAgo),
  };
}

describe('pickRecentWins', () => {
  it('承诺守住: kept 结算 → kept_promise, 天数来自 ref_key, 主题取登记原词截断', () => {
    const wins = pickRecentWins(
      [commitmentEvent('2026-08-01', '2026-08-31', 'coffee'), keptSettlement('2026-08-01', '2026-08-31')],
      NOW,
    )!;
    expect(wins).toHaveLength(1);
    expect(wins[0].kind).toBe('kept_promise');
    expect(wins[0].days).toBe(30);
    expect(wins[0].subject).toBe('coffee');
  });

  it('登记早于窗口也能取到 subject; 超长主题截断到 20 字', () => {
    const long = 'a'.repeat(50);
    const wins = pickRecentWins(
      [commitmentEvent('2026-08-01', '2026-08-05', long), keptSettlement('2026-08-01', '2026-08-05')],
      NOW,
    )!;
    expect(wins[0].subject).toBe('a'.repeat(20));
  });

  it('broken / 未知 outcome 的结算不算高光', () => {
    const broken: RecentWinsEventInput = {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: null,
      metadata: { source: 'green_commitment_settlement', ref_key: '2026-08-01#2026-08-05', outcome: 'broken' },
      createdAt: iso(1),
    };
    expect(pickRecentWins([broken], NOW)).toBeNull();
  });

  it('连胜: 窗口内连续 challenge_completed 天 → guard_streak (复用 guard-win-rate 口径, 含 MIN_SAMPLE_SIZE 门槛)', () => {
    const events: RecentWinsEventInput[] = [];
    for (let d = 0; d < 5; d++) {
      events.push({
        eventType: 'challenge_completed',
        triggerSource: 'impulse',
        triggerId: `t${d}`,
        metadata: null,
        createdAt: iso(d),
      });
    }
    const wins = pickRecentWins(events, NOW)!;
    expect(wins[0].kind).toBe('guard_streak');
    expect(wins[0].days).toBe(5);
    // 低于 MIN_SAMPLE_SIZE(5) 的 3 连胜不硬造结论 (反假洞察原则)
    const thin: RecentWinsEventInput[] = [0, 1, 2].map((d) => ({
      eventType: 'challenge_completed',
      triggerSource: 'impulse',
      triggerId: `t${d}`,
      metadata: null,
      createdAt: iso(d),
    }));
    expect(pickRecentWins(thin, NOW)).toBeNull();
  });

  it('cooldown 成功与 worth 复盘: 各自计数 + review_key 幂等去重', () => {
    const cd = (key: string, daysAgo: number): RecentWinsEventInput => ({
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: null,
      metadata: { source: 'cooldown_followup', cooldown_success: true, review_key: key, category: 'clothing' },
      createdAt: iso(daysAgo),
    });
    const worth = (key: string, daysAgo: number): RecentWinsEventInput => ({
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: null,
      metadata: { source: 'post_purchase_review', rating: 'worth', review_key: key },
      createdAt: iso(daysAgo),
    });
    const wins = pickRecentWins([cd('a', 2), cd('a', 1), cd('b', 3), worth('x', 2), worth('y', 4)], NOW)!;
    const cooldown = wins.find((w) => w.kind === 'cooldown')!;
    const worthWin = wins.find((w) => w.kind === 'worth_review')!;
    expect(cooldown.count).toBe(2);
    expect(worthWin.count).toBe(2);
  });

  it('排序: 承诺守住 > 连胜 > 次数类; top 3 截断', () => {
    const events: RecentWinsEventInput[] = [
      // 次数类
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'cooldown_followup', cooldown_success: true }, createdAt: iso(1) },
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'post_purchase_review', rating: 'worth', review_key: 'x' }, createdAt: iso(2) },
      // 连胜
      ...[0, 1, 2, 3, 4].map((d) => ({ eventType: 'challenge_completed', triggerSource: 'impulse', triggerId: `t${d}`, metadata: null, createdAt: iso(d) })),
      // 承诺守住
      commitmentEvent('2026-08-01', '2026-08-05', 'sneakers'),
      keptSettlement('2026-08-01', '2026-08-05'),
    ];
    const wins = pickRecentWins(events, NOW)!;
    expect(wins).toHaveLength(3);
    expect(wins.map((w) => w.kind)).toEqual(['kept_promise', 'guard_streak', 'cooldown']);
  });

  it('零样本 → null 稳定降级 (空 / 窗口外 / 非高光事件)', () => {
    expect(pickRecentWins([], NOW)).toBeNull();
    expect(pickRecentWins(null, NOW)).toBeNull();
    expect(pickRecentWins([keptSettlement('2026-08-01', '2026-08-05', 20)], NOW)).toBeNull();
    expect(
      pickRecentWins([{ eventType: 'challenge_failed', triggerSource: 'impulse', triggerId: 'f1', metadata: null, createdAt: iso(1) }], NOW),
    ).toBeNull();
  });

  it('损坏 metadata / 无效 createdAt / 损坏 ref_key → 跳过不 throw', () => {
    const corrupt: RecentWinsEventInput[] = [
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: null, createdAt: 'not-a-date' },
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: 'corrupt' as unknown as Record<string, unknown>, createdAt: iso(1) },
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'green_commitment_settlement', outcome: 'kept', ref_key: 42 }, createdAt: iso(1) },
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'green_commitment_settlement', outcome: 'kept', ref_key: 'garbage' }, createdAt: iso(1) },
      { eventType: 'weird_type', triggerSource: null, triggerId: null, metadata: {}, createdAt: iso(1) },
    ];
    expect(() => pickRecentWins(corrupt, NOW)).not.toThrow();
    expect(pickRecentWins(corrupt, NOW)).toBeNull();
  });

  it('金额红线: 输出字段结构面无金额 (savedAmount 不进任何高光字段)', () => {
    const wins = pickRecentWins(
      [
        commitmentEvent('2026-08-01', '2026-08-05', 'coffee'),
        keptSettlement('2026-08-01', '2026-08-05'),
        { eventType: 'challenge_completed', triggerSource: 'impulse', triggerId: 't0', metadata: { savedAmount: 129.99 }, createdAt: iso(0) },
        { eventType: 'challenge_completed', triggerSource: 'impulse', triggerId: 't1', metadata: { savedAmount: 89.5 }, createdAt: iso(1) },
      ],
      NOW,
    )!;
    const flat = JSON.stringify(wins);
    expect(flat).not.toContain('129.99');
    expect(flat).not.toContain('savedAmount');
  });
});
