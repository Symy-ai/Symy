/**
 * guard-style-profile 测试 (batch56-c)
 *
 * 覆盖: 三轨归轨 / 主导轨判定 (50% 边界 + 并列 tie-break) / 均衡型 /
 * 降级态 / 连续风格天数 / 去重与脏数据 / amount-free 输出结构红线。
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateGuardStyleProfile,
  GUARD_STYLE_MIN_SAMPLE_SIZE,
  type GuardStyleEventInput,
} from '../guard-style-profile';

const d = (day: number) => new Date(2026, 8, day, 10, 0, 0);

function guardEvent(day: number, savedAmount = 0, triggerId?: string): GuardStyleEventInput {
  return { eventType: 'challenge_completed', metadata: { savedAmount }, createdAt: d(day), triggerId };
}
function altEvent(day: number, estSaved = 0): GuardStyleEventInput {
  return { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', estSaved }, createdAt: d(day) };
}
function reuseEvent(day: number, estSaved = 0): GuardStyleEventInput {
  return { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', estSaved }, createdAt: d(day) };
}

describe('aggregateGuardStyleProfile — 归轨', () => {
  it('challenge_completed → guard; kind 标记 → alt/reuse; 其它事件不计', () => {
    const p = aggregateGuardStyleProfile([
      guardEvent(1), guardEvent(1), guardEvent(1), guardEvent(1),
      altEvent(2), reuseEvent(3),
      { eventType: 'challenge_failed', createdAt: d(4) },
      { eventType: 'mindful_recovery', metadata: { kind: 'other' }, createdAt: d(4) },
    ]);
    expect(p.status).toBe('ok');
    expect(p.trackCounts).toEqual({ guard: 4, alt: 1, reuse: 1 });
    expect(p.totalActions).toBe(6);
  });

  it('triggerId 去重 (落账幂等双保险)', () => {
    const p = aggregateGuardStyleProfile([
      guardEvent(1, 0, 'a'), guardEvent(1, 0, 'a'),
      altEvent(2), altEvent(3), altEvent(4), reuseEvent(5),
    ]);
    expect(p.trackCounts.guard).toBe(1);
    expect(p.totalActions).toBe(5);
  });

  it('无效 createdAt / 缺 metadata 跳过, 不抛错', () => {
    expect(() =>
      aggregateGuardStyleProfile([
        { eventType: 'challenge_completed', createdAt: 'not-a-date' },
        { eventType: 'challenge_completed' },
        altEvent(1), altEvent(2), altEvent(3), altEvent(4),
      ]),
    ).not.toThrow();
  });
});

describe('主导轨判定', () => {
  it('单轨占比 ≥50% → 明确命名 (interceptor)', () => {
    const p = aggregateGuardStyleProfile([guardEvent(1), guardEvent(2), guardEvent(3), altEvent(4), reuseEvent(5), guardEvent(6)]);
    expect(p.styleId).toBe('interceptor');
  });

  it('50% 整边界: 3/6 → 命名主导轨', () => {
    const p = aggregateGuardStyleProfile([altEvent(1), altEvent(2), altEvent(3), guardEvent(4), reuseEvent(5), guardEvent(6)]);
    expect(p.styleId).toBe('substitutor');
  });

  it('49% 边界 (3/7... 不足50%) → 均衡型', () => {
    // 3/7 ≈ 42.9%: 无过半 → balanced
    const p = aggregateGuardStyleProfile([altEvent(1), altEvent(2), altEvent(3), guardEvent(4), guardEvent(5), reuseEvent(6), guardEvent(7)]);
    expect(p.styleId).toBe('balanced');
  });

  it('并列 tie-break: 50/50 并列时内部金额权重高者胜 (estSaved 只做内部权重)', () => {
    const p = aggregateGuardStyleProfile([
      guardEvent(1, 5), guardEvent(2, 5), guardEvent(5, 5),
      altEvent(3, 40), altEvent(4, 40), altEvent(6, 40),
    ]);
    // guard 3/6 = alt 3/6 = 50% 并列, alt 权重 120 > guard 15 → substitutor
    expect(p.styleId).toBe('substitutor');
  });

  it('并列且权重也同 → 稳定序 guard > alt > reuse', () => {
    const p = aggregateGuardStyleProfile([
      guardEvent(1), guardEvent(2), guardEvent(3),
      altEvent(4), altEvent(5), altEvent(6),
    ]);
    expect(p.styleId).toBe('interceptor');
  });

  it('reuser 主导', () => {
    const p = aggregateGuardStyleProfile([reuseEvent(1), reuseEvent(2), reuseEvent(3), guardEvent(4), altEvent(5)]);
    expect(p.styleId).toBe('reuser');
  });
});

describe('均衡型与降级态', () => {
  it('三轨均分 → 均衡型 (非羞辱: styleId 是鼓励态不是降级)', () => {
    const p = aggregateGuardStyleProfile([guardEvent(1), guardEvent(2), altEvent(3), altEvent(4), reuseEvent(5), reuseEvent(6)]);
    expect(p.styleId).toBe('balanced');
    expect(p.status).toBe('ok');
  });

  it(`三轨合计 < ${GUARD_STYLE_MIN_SAMPLE_SIZE} → insufficient 稳定降级`, () => {
    const p = aggregateGuardStyleProfile([guardEvent(1), guardEvent(2), altEvent(3), reuseEvent(4)]);
    expect(p.status).toBe('insufficient');
    expect(p.totalActions).toBe(0);
  });

  it('空输入 / null → insufficient', () => {
    expect(aggregateGuardStyleProfile([]).status).toBe('insufficient');
    expect(aggregateGuardStyleProfile(null).status).toBe('insufficient');
  });
});

describe('覆盖天数与连续风格天数', () => {
  it('activeDays 去重自然日', () => {
    const p = aggregateGuardStyleProfile([
      guardEvent(1), guardEvent(1), guardEvent(1),
      altEvent(2), altEvent(2),
      reuseEvent(2),
    ]);
    expect(p.activeDays).toBe(2);
  });

  it('styleStreakDays: 最近连续活跃日主导轨一致, 更早切换日截断', () => {
    // 日1: guard×3 (guard 日); 日2-4: alt 各 2 (alt 日) → 全局 alt 主导 (6/9), streak=3
    const p = aggregateGuardStyleProfile([
      guardEvent(1), guardEvent(1), guardEvent(1),
      altEvent(2), altEvent(2), altEvent(3), altEvent(3), altEvent(4), altEvent(4),
    ]);
    expect(p.styleId).toBe('substitutor');
    expect(p.styleStreakDays).toBe(3);
  });

  it('最近日主导轨与全局不同 → streak 从最近日截断为 0', () => {
    // 日1-2 alt (4), 日3 guard×2 → alt 4/6 主导 (substitutor); 最近日是 guard 日 → streak 0
    const p = aggregateGuardStyleProfile([
      altEvent(1), altEvent(1), altEvent(2), altEvent(2),
      guardEvent(3), guardEvent(3),
    ]);
    expect(p.styleId).toBe('substitutor');
    expect(p.styleStreakDays).toBe(0);
  });
});

describe('amount-free 红线', () => {
  it('输出类型结构面无金额: 各轨 estSaved/savedAmount 不进任何输出字段', () => {
    const p = aggregateGuardStyleProfile([
      guardEvent(1, 999), guardEvent(2, 999), guardEvent(3, 999),
      altEvent(4, 888), reuseEvent(5, 777), guardEvent(6, 1),
    ]);
    const json = JSON.stringify(p);
    expect(json).not.toContain('999');
    expect(json).not.toContain('888');
    expect(json).not.toContain('777');
    expect(json).not.toMatch(/saved|estSaved|amount/i);
    expect(Object.keys(p.trackCounts)).toEqual(['guard', 'alt', 'reuse']);
  });
});
