/**
 * impulse-forecast 测试 (batch62-c)
 *
 * 覆盖验收:
 * 1. 等级边界表驱动锁死: 近 4 周加权 ×2, HIGH/MEDIUM/low 档全可触达
 * 2. 样本阈值: 总样本 < 8 → 整体 insufficient; 单星期几 raw < 2 → 该日 insufficient
 * 3. 多类别并列取 primary (固定裁决顺序), other 兜底桶不参与
 * 4. 空 / 跨月边界 / 周一起点 / 时区 (本地 Date 注入, 无 UTC 炸弹)
 * 5. 只统计 challenge_completed/failed/manual_adjustment; 输出无金额/碳数值
 *
 * 锚点日历 (2026-09, NOW = 09-09 周三, Monday=0 → weekday 2):
 * - daysAgo(n) 的星期 = (2 - n) mod 7: n≡0 mod 7 (7,14,21,28,35,42,49) → 周三
 * - n ≡ 6 mod 7 (6,13,20,27,34,41,48,55) → 周四; n=3,10,…,52 → 周日
 * - weight: daysAgo < 28 → ×2; ≥ 28 → ×1; ≥ 56 → 出窗
 */

import { describe, expect, it } from 'vitest';
import {
  forecastImpulseRisk,
  FORECAST_HORIZON_DAYS,
  MIN_TOTAL_SAMPLE,
  MIN_DAY_SAMPLE,
  HIGH_WEIGHT_THRESHOLD,
  MEDIUM_WEIGHT_THRESHOLD,
  type ImpulseForecastEventInput,
} from '../impulse-forecast';

/** 锚点: 2026-09-09 周三 (Monday=0 → weekday 2) */
const NOW = new Date(2026, 8, 9, 12, 0, 0);

/** daysAgo 天前的本地时刻 ISO (n < 28 → weight 2; 28 ≤ n < 56 → weight 1) */
function daysAgo(n: number, hour = 12): string {
  return new Date(2026, 8, 9 - n, hour, 0, 0).toISOString();
}

function ev(partial: Partial<ImpulseForecastEventInput> & { createdAt: string }): ImpulseForecastEventInput {
  return { eventType: 'challenge_completed', metadata: null, ...partial };
}

/** 周三日期集 (星期 = 目标列): 近 4 周 [0,7,14,21], 旧 4 周 [28,35,42,49] */
const WED_RECENT = [0, 7, 14, 21];
const WED_OLD = [28, 35, 42, 49];
/** 周四 8 个铺底日 (6/13/20/27 近 + 34/41/48/55 旧) — 与周三目标列零重叠, 保证总样本 ≥ 8 */
const THU_FILLER = [6, 13, 20, 27, 34, 41, 48, 55];

describe('forecastImpulseRisk — 阈值与等级边界 (表驱动, 周三列)', () => {
  const cases: ReadonlyArray<{ name: string; days: number[]; level: 'high' | 'medium' | 'low' | 'insufficient' }> = [
    { name: `raw 1 (孤例 < MIN_DAY_SAMPLE ${MIN_DAY_SAMPLE}) → insufficient`, days: [0], level: 'insufficient' },
    { name: 'raw 2 全旧 (weight 2) → low', days: [28, 35], level: 'low' },
    { name: 'raw 3 全旧 (weight 3) → low', days: [28, 35, 42], level: 'low' },
    { name: `raw 3 全近 (weight 6, ${MEDIUM_WEIGHT_THRESHOLD}..<${HIGH_WEIGHT_THRESHOLD}) → medium`, days: [0, 7, 14], level: 'medium' },
    { name: `raw 4 全旧 (weight 4 = MEDIUM 边界) → medium`, days: [28, 35, 42, 49], level: 'medium' },
    { name: `raw 4 全近 (weight 8 ≥ HIGH ${HIGH_WEIGHT_THRESHOLD}) → high`, days: [0, 7, 14, 21], level: 'high' },
    { name: 'raw 2 近 + 2 旧 (weight 6 = HIGH 边界-1) → medium', days: [0, 7, 28, 35], level: 'medium' },
    { name: 'raw 3 近 + 1 旧 (weight 7 = HIGH 边界) → high', days: [0, 7, 14, 28], level: 'high' },
  ];

  it.each(cases)('$name', ({ days, level }) => {
    const target = days.map((n) => ev({ createdAt: daysAgo(n) }));
    const filler = THU_FILLER.map((n) => ev({ createdAt: daysAgo(n, 13) }));
    const forecast = forecastImpulseRisk([...target, ...filler], NOW);
    expect(forecast.status).toBe('ok');
    const wednesday = forecast.days.find((d) => d.weekday === 2)!;
    expect(wednesday.level).toBe(level);
    expect(wednesday.sample).toBe(days.length);
  });

  it('常量自洽: 三档边界单调且 low 在 raw 可行域内可触达', () => {
    expect(MEDIUM_WEIGHT_THRESHOLD).toBeGreaterThan(MIN_DAY_SAMPLE);
    expect(HIGH_WEIGHT_THRESHOLD).toBeGreaterThan(MEDIUM_WEIGHT_THRESHOLD);
    expect(MIN_TOTAL_SAMPLE).toBe(8);
  });
});

describe('forecastImpulseRisk — 整体/单日样本不足', () => {
  it(`总样本 < ${MIN_TOTAL_SAMPLE} → 整体 insufficient, 全天 insufficient, tallies 0`, () => {
    const few = Array.from({ length: MIN_TOTAL_SAMPLE - 1 }, (_, i) => ev({ createdAt: daysAgo(i * 2 + 1) }));
    const forecast = forecastImpulseRisk(few, NOW);
    expect(forecast.status).toBe('insufficient');
    expect(forecast.highDays).toBe(0);
    expect(forecast.mediumDays).toBe(0);
    expect(forecast.lowDays).toBe(0);
    expect(forecast.topCategory).toBeNull();
    expect(forecast.days).toHaveLength(FORECAST_HORIZON_DAYS);
    expect(forecast.days.every((d) => d.level === 'insufficient')).toBe(true);
    expect(forecast.totalSample).toBe(MIN_TOTAL_SAMPLE - 1);
  });

  it('总样本达标但某星期几 raw 1 → 仅该日 insufficient, 其余日正常', () => {
    const events = [
      ev({ createdAt: daysAgo(0) }), // 周三 raw 1 → insufficient
      ev({ createdAt: daysAgo(30, 13) }), ev({ createdAt: daysAgo(37, 13) }), // 周一 raw 2 全旧 → low
      ev({ createdAt: daysAgo(6, 14) }), ev({ createdAt: daysAgo(13, 14) }), ev({ createdAt: daysAgo(34, 14) }), ev({ createdAt: daysAgo(41, 14) }), // 周四 2 近 2 旧 → weight 6 → medium
      ev({ createdAt: daysAgo(31, 15) }), // 周六 raw 1 → insufficient
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.status).toBe('ok');
    const byWeekday = new Map(forecast.days.map((d) => [d.weekday, d]));
    expect(byWeekday.get(0)!.level).toBe('low');
    expect(byWeekday.get(2)!.level).toBe('insufficient');
    expect(byWeekday.get(3)!.level).toBe('medium');
    expect(byWeekday.get(5)!.level).toBe('insufficient');
  });
});

describe('forecastImpulseRisk — 类别与危险窗口', () => {
  it('多类别并列取 primary: 固定裁决顺序 beauty 先于 food (周三列)', () => {
    const events = [
      ev({ createdAt: daysAgo(28), metadata: { category: 'beauty' } }),
      ev({ createdAt: daysAgo(35), metadata: { category: 'beauty' } }),
      ev({ createdAt: daysAgo(42), metadata: { category: 'food' } }),
      ev({ createdAt: daysAgo(49), metadata: { category: 'food' } }),
      // 周日 4 条铺足总样本 (无 category → other 桶, 不参与)
      ev({ createdAt: daysAgo(31, 20) }), ev({ createdAt: daysAgo(38, 20) }),
      ev({ createdAt: daysAgo(45, 20) }), ev({ createdAt: daysAgo(52, 20) }),
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.status).toBe('ok');
    const wednesday = forecast.days.find((d) => d.weekday === 2)!;
    expect(wednesday.primaryCategory).toBe('beauty');
    expect(forecast.topCategory).toBe('beauty');
  });

  it('other 兜底桶不参与 primary/top; 全 other 的日子 sample 计入但 primary null', () => {
    const events = [
      // 周三 4 条全 other (无 metadata → other)
      ...WED_OLD.map((n) => ev({ createdAt: daysAgo(n) })),
      // 周四 2 条 home (近, weight 4) + 2 条 other
      ev({ createdAt: daysAgo(6), metadata: { category: 'home' } }),
      ev({ createdAt: daysAgo(13), metadata: { category: 'home' } }),
      ev({ createdAt: daysAgo(20) }),
      ev({ createdAt: daysAgo(27) }),
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.status).toBe('ok');
    const wednesday = forecast.days.find((d) => d.weekday === 2)!;
    expect(wednesday.sample).toBe(4);
    expect(wednesday.primaryCategory).toBeNull();
    const thursday = forecast.days.find((d) => d.weekday === 3)!;
    expect(thursday.primaryCategory).toBe('home');
    expect(forecast.topCategory).toBe('home');
  });

  it('危险窗口: 聚集时段给出窗口; 并列按 WINDOW_IDS 固定顺序 (daytime 先于 evening)', () => {
    const events = [
      // 周三: 深夜 2 条近 (23:xx 与凌晨 01:xx) → lateNight
      ev({ createdAt: daysAgo(0, 23) }),
      ev({ createdAt: daysAgo(7, 1) }),
      // 周四: 白天 1 旧 + 晚间 1 旧 (weight 1:1 并列) → WINDOW_IDS 序 daytime 赢
      ev({ createdAt: daysAgo(34, 14) }),
      ev({ createdAt: daysAgo(41, 19) }),
      // 周日 4 条铺足总样本
      ev({ createdAt: daysAgo(31, 21) }), ev({ createdAt: daysAgo(38, 21) }),
      ev({ createdAt: daysAgo(45, 21) }), ev({ createdAt: daysAgo(52, 21) }),
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.status).toBe('ok');
    const wednesday = forecast.days.find((d) => d.weekday === 2)!;
    expect(wednesday.dangerWindow).toBe('lateNight');
    const thursday = forecast.days.find((d) => d.weekday === 3)!;
    expect(thursday.dangerWindow).toBe('daytime');
  });
});

describe('forecastImpulseRisk — 事件类型与窗口边界', () => {
  it('只统计三类可读事件: manual_adjustment 计入, reward/采纳不计入', () => {
    const events = [
      ev({ eventType: 'challenge_completed', createdAt: daysAgo(0) }),
      ev({ eventType: 'challenge_failed', createdAt: daysAgo(7) }),
      ev({ eventType: 'manual_adjustment', createdAt: daysAgo(14) }),
      ev({ eventType: 'challenge_reward', createdAt: daysAgo(21) }),
      ev({ eventType: 'mindful_recovery', createdAt: daysAgo(28) }),
      ev({ eventType: 'green_alt_adoption', createdAt: daysAgo(35) }),
      ev({ eventType: 'challenge_completed', createdAt: daysAgo(42) }),
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.totalSample).toBe(4);
    expect(forecast.status).toBe('insufficient');
  });

  it('8 周窗外 / 未来时间戳的事件不计入', () => {
    const events = [
      ...Array.from({ length: 8 }, (_, i) => ev({ createdAt: daysAgo(i * 2 + 1, 12 + (i % 2)) })),
      ev({ createdAt: daysAgo(60) }), // ≥ 56 天 → 出窗
      ev({ createdAt: new Date(2026, 8, 10, 12).toISOString() }), // 未来 → 排除
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.totalSample).toBe(8);
    expect(forecast.status).toBe('ok');
  });

  it('无效 createdAt / 空 / null 输入 → insufficient, 绝不抛错', () => {
    expect(forecastImpulseRisk([], NOW).status).toBe('insufficient');
    expect(forecastImpulseRisk(null, NOW).status).toBe('insufficient');
    expect(forecastImpulseRisk(undefined, NOW).status).toBe('insufficient');
    const broken = forecastImpulseRisk([ev({ createdAt: 'not-a-date' }), null as unknown as ImpulseForecastEventInput], NOW);
    expect(broken.status).toBe('insufficient');
    expect(broken.days).toHaveLength(7);
  });
});

describe('forecastImpulseRisk — 日历边界', () => {
  it('未来 7 天含今天, 周一起点 Monday=0, 星期序循环正确', () => {
    const events = Array.from({ length: 8 }, (_, i) => ev({ createdAt: daysAgo(i * 2 + 1) }));
    const forecast = forecastImpulseRisk(events, NOW);
    expect(forecast.days).toHaveLength(7);
    expect(forecast.days[0]!.dayKey).toBe('2026-8-9'); // dayKey 为 0-based month (heatmap 同款)
    expect(forecast.days[0]!.weekday).toBe(2); // 周三
    expect(forecast.days[5]!.weekday).toBe(0); // 下周一 = 09-14
    expect(forecast.days[6]!.weekday).toBe(1); // 下周二 = 09-15
  });

  it('跨月边界: 3 月末锚点覆盖 4 月日期, dayKey 随本地月份翻转', () => {
    const endOfMarch = new Date(2026, 2, 31, 12, 0, 0);
    const marchEvents = Array.from({ length: 8 }, (_, i) =>
      ev({ createdAt: new Date(2026, 2, 31 - (i * 2 + 1), 12, 0, 0).toISOString() }));
    const forecast = forecastImpulseRisk(marchEvents, endOfMarch);
    expect(forecast.days.map((d) => d.dayKey)).toEqual([
      '2026-2-31', '2026-3-1', '2026-3-2', '2026-3-3', '2026-3-4', '2026-3-5', '2026-3-6',
    ]);
  });

  it('周日锚点: 次日回到周一 (weekday 0)', () => {
    const sunday = new Date(2026, 8, 13, 12, 0, 0);
    expect((sunday.getDay() + 6) % 7).toBe(6);
    const events = Array.from({ length: 8 }, (_, i) => ev({ createdAt: daysAgo(i * 2 + 1) }));
    const forecast = forecastImpulseRisk(events, sunday);
    expect(forecast.days[0]!.weekday).toBe(6);
    expect(forecast.days[1]!.weekday).toBe(0);
  });
});

describe('forecastImpulseRisk — 红线', () => {
  it('输出结构无金额/百分比收益/碳数值字段 (次数/天数/星期/时段 only)', () => {
    const events = [
      ...WED_RECENT.map((n) => ev({ createdAt: daysAgo(n), metadata: { category: 'beauty' } })),
      ...WED_OLD.map((n) => ev({ createdAt: daysAgo(n, 20) })),
    ];
    const forecast = forecastImpulseRisk(events, NOW);
    expect(JSON.stringify(forecast)).not.toMatch(/\$|¥|€|£|amount|estSaved|percent|%|carbon|kg/i);
    expect(Object.keys(forecast.days[0]!).sort()).toEqual(['dangerWindow', 'dayKey', 'level', 'primaryCategory', 'sample', 'weekday']);
    expect(Object.keys(forecast).sort()).toEqual(['days', 'highDays', 'lowDays', 'mediumDays', 'status', 'topCategory', 'totalSample']);
  });
});
