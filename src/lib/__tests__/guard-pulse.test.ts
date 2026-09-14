/**
 * guard-pulse 测试 (batch68-c)
 *
 * 覆盖验收:
 * 1. 28 天多天样本输出 1-2 个稳定高风险时段; 相邻小时合并 (含跨零点循环邻接);
 *    单日极端值不独立成时段 (MIN_HOUR_ACTIVE_DAYS 门槛)
 * 2. 样本不足 (activeDays < 3 或事件 < 6) → insufficient, windows 恒空
 * 3. 时区: UTC 与非整小时偏移 (Asia/Kathmandu +5:45) 跨日归属正确;
 *    DST (America/New_York 春令时) 小时换算正确; 无效时区回退不抛错
 * 4. 红线: 输出结构零金额零碳数值; 非 guard 事件 (reward/无 kind 手记) 不计入
 * 5. 回看窗口: 28 天边界 (daysAgo=28 排除, 27 含), 未来事件排除
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateGuardPulse,
  MAX_WINDOW_HOURS,
  PULSE_LOOKBACK_DAYS,
  type GuardPulseEventInput,
} from '../guard-pulse';

/** 锚点: 2026-09-10T12:00Z (UTC 测试统一用) */
const NOW = new Date('2026-09-10T12:00:00Z');

function ev(eventType: string, iso: string, metadata?: Record<string, unknown>): GuardPulseEventInput {
  return { eventType, createdAt: iso, metadata: metadata ?? null };
}

function intercept(iso: string): GuardPulseEventInput {
  return ev('challenge_completed', iso);
}

function greenAdoption(iso: string): GuardPulseEventInput {
  return ev('mindful_recovery', iso, { kind: 'green_alt_adoption' });
}

describe('aggregateGuardPulse — 稳定降级', () => {
  it('空/undefined 输入恒 insufficient, 恒 24 行小时, windows 空', () => {
    for (const events of [[], undefined, null] as Array<GuardPulseEventInput[] | null | undefined>) {
      const pulse = aggregateGuardPulse(events, NOW, 'UTC');
      expect(pulse.status).toBe('insufficient');
      expect(pulse.hours).toHaveLength(24);
      expect(pulse.windows).toEqual([]);
      expect(pulse.totalSample).toBe(0);
      expect(pulse.activeDays).toBe(0);
    }
  });

  it('activeDays < 3 → insufficient (6 条事件全挤在 2 天也不下结论)', () => {
    const events = [
      intercept('2026-09-08T21:00:00Z'),
      intercept('2026-09-08T21:10:00Z'),
      intercept('2026-09-08T21:20:00Z'),
      intercept('2026-09-09T21:00:00Z'),
      intercept('2026-09-09T21:10:00Z'),
      intercept('2026-09-09T21:20:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.totalSample).toBe(6);
    expect(pulse.activeDays).toBe(2);
    expect(pulse.status).toBe('insufficient');
    expect(pulse.windows).toEqual([]);
  });

  it('总样本 < 6 → insufficient (3 天各 1 条也不下结论)', () => {
    const events = [
      intercept('2026-09-07T12:00:00Z'),
      intercept('2026-09-08T12:00:00Z'),
      intercept('2026-09-09T12:00:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.activeDays).toBe(3);
    expect(pulse.totalSample).toBe(3);
    expect(pulse.status).toBe('insufficient');
    expect(pulse.windows).toEqual([]);
  });

  it('单日极端值不独立成时段: 6 条挤 hour21 单日 + hour22 分散 3 天 → 只有 hour22 成时段', () => {
    const events = [
      intercept('2026-09-01T21:00:00Z'),
      intercept('2026-09-01T21:05:00Z'),
      intercept('2026-09-01T21:10:00Z'),
      intercept('2026-09-01T21:15:00Z'),
      intercept('2026-09-01T21:20:00Z'),
      intercept('2026-09-01T21:25:00Z'),
      intercept('2026-09-05T22:00:00Z'),
      intercept('2026-09-06T22:00:00Z'),
      intercept('2026-09-07T22:00:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.status).toBe('ok');
    expect(pulse.windows).toHaveLength(1);
    const w = pulse.windows[0];
    expect(w.hours).toEqual([22]);
    expect(w.startHour).toBe(22);
    expect(w.endHour).toBe(22);
    expect(w.wrapsMidnight).toBe(false);
    expect(w.level).toBe('medium');
  });
});

describe('aggregateGuardPulse — 相邻小时合并与输出', () => {
  /** 两个稳定时段: 深夜 [23,0] (8 天拦截) + 午休 [12,13] (3 天, 采纳占半) */
  function twoWindows(): GuardPulseEventInput[] {
    const events: GuardPulseEventInput[] = [];
    // 深夜: hour23 8/20-8/23 各 4 条, hour0 8/21-8/24 各 4 条 → 32 条拦截
    for (const d of [20, 21, 22, 23]) {
      for (let i = 0; i < 4; i++) events.push(intercept(`2026-08-${String(d).padStart(2, '0')}T23:${String(10 + i).padStart(2, '0')}:00Z`));
    }
    for (const d of [21, 22, 23, 24]) {
      for (let i = 0; i < 4; i++) events.push(intercept(`2026-08-${String(d).padStart(2, '0')}T00:${String(10 + i).padStart(2, '0')}:00Z`));
    }
    // 午休: 9/5-9/7 hour12 各 4 条拦截 + hour13 各 4 条绿色采纳 → 24 条
    for (const d of ['05', '06', '07']) {
      for (let i = 0; i < 4; i++) {
        events.push(intercept(`2026-09-${d}T12:${String(10 + i).padStart(2, '0')}:00Z`));
        events.push(greenAdoption(`2026-09-${d}T13:${String(10 + i).padStart(2, '0')}:00Z`));
      }
    }
    return events;
  }

  it('两个时段都输出: 跨零点区间 start 23 → end 0; 采纳占半 → 收藏夹次日午休建议', () => {
    const pulse = aggregateGuardPulse(twoWindows(), NOW, 'UTC');
    expect(pulse.status).toBe('ok');
    expect(pulse.totalSample).toBe(56);
    expect(pulse.activeDays).toBe(8); // 8/20-24 (深夜 5 天) + 9/5-7 (午休 3 天)
    expect(pulse.totalIntercepts).toBe(44);
    expect(pulse.totalAdoptions).toBe(12);
    expect(pulse.windows).toHaveLength(2);

    // 小时密度并列 (4.0) 时事件数并列 → 小时号小者先当种子: [23,0] 先输出
    const night = pulse.windows[0];
    expect(night.hours).toEqual([0, 23]); // DTO 契约: 升序
    expect(night.startHour).toBe(23);
    expect(night.endHour).toBe(0);
    expect(night.wrapsMidnight).toBe(true);
    expect(night.intercepts).toBe(32);
    expect(night.adoptions).toBe(0);
    expect(night.activeDays).toBe(5); // hour23 ∪ hour0 的日子并集 = 8/20-24
    expect(night.level).toBe('medium');
    expect(night.suggestion).toBe('delay_24h');

    const lunch = pulse.windows[1];
    expect(lunch.hours).toEqual([12, 13]);
    expect(lunch.wrapsMidnight).toBe(false);
    expect(lunch.intercepts).toBe(12);
    expect(lunch.adoptions).toBe(12);
    expect(lunch.level).toBe('medium');
    expect(lunch.suggestion).toBe('wishlist_next_noon');
  });

  it('单一强时段 → high + 清购物车建议; 弱时段低于门槛被舍去', () => {
    const events = [
      // 午休 9/5-9/6: hour12 ×6 + hour13 ×6 拦截 → 窗口密度 24/2 = 12
      intercept('2026-09-05T12:00:00Z'), intercept('2026-09-05T12:10:00Z'), intercept('2026-09-05T12:20:00Z'),
      intercept('2026-09-05T12:30:00Z'), intercept('2026-09-05T12:40:00Z'), intercept('2026-09-05T12:50:00Z'),
      intercept('2026-09-06T12:00:00Z'), intercept('2026-09-06T12:10:00Z'), intercept('2026-09-06T12:20:00Z'),
      intercept('2026-09-06T12:30:00Z'), intercept('2026-09-06T12:40:00Z'), intercept('2026-09-06T12:50:00Z'),
      intercept('2026-09-05T13:00:00Z'), intercept('2026-09-05T13:10:00Z'), intercept('2026-09-05T13:20:00Z'),
      intercept('2026-09-05T13:30:00Z'), intercept('2026-09-05T13:40:00Z'), intercept('2026-09-05T13:50:00Z'),
      intercept('2026-09-06T13:00:00Z'), intercept('2026-09-06T13:10:00Z'), intercept('2026-09-06T13:20:00Z'),
      intercept('2026-09-06T13:30:00Z'), intercept('2026-09-06T13:40:00Z'), intercept('2026-09-06T13:50:00Z'),
      // 深夜稀薄: hour23/hour0 各 2 天 1 条 → 密度 2.0 < 12×0.5, 被舍去
      intercept('2026-08-20T23:00:00Z'),
      intercept('2026-08-21T23:00:00Z'),
      intercept('2026-08-21T00:00:00Z'),
      intercept('2026-08-22T00:00:00Z'),
      // 散点: hour15 各 1 天 1 条 (activeDays 1, 不够格)
      intercept('2026-09-08T15:00:00Z'),
      intercept('2026-09-09T15:00:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.status).toBe('ok');
    expect(pulse.windows).toHaveLength(1);
    const w = pulse.windows[0];
    expect(w.hours).toEqual([12, 13]);
    expect(w.intercepts).toBe(24);
    expect(w.activeDays).toBe(2);
    expect(w.density).toBe(12);
    // 全局均密 30/7 ≈ 4.3 → 窗口密度 12 ≥ 8.6 → high
    expect(w.level).toBe('high');
    expect(w.suggestion).toBe('move_cart_earlier');
  });

  it('合并上限: 窗口至多 MAX_WINDOW_HOURS 小时', () => {
    const events: GuardPulseEventInput[] = [];
    // hour10-14 各 3 天 2 条 (密度并列 2.0, 双向合并最长 4 小时)
    for (const h of [10, 11, 12, 13, 14]) {
      for (const d of ['05', '06', '07']) {
        events.push(intercept(`2026-09-${d}T${String(h).padStart(2, '0')}:00:00Z`));
        events.push(intercept(`2026-09-${d}T${String(h).padStart(2, '0')}:30:00Z`));
      }
    }
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.status).toBe('ok');
    expect(pulse.windows[0].hours.length).toBeLessThanOrEqual(MAX_WINDOW_HOURS);
  });
});

describe('aggregateGuardPulse — 时区与跨日归属', () => {
  it('UTC: 事件按 UTC 小时归桶', () => {
    const events = [
      intercept('2026-09-08T23:30:00Z'),
      intercept('2026-09-09T05:00:00Z'),
      intercept('2026-09-06T05:30:00Z'),
      intercept('2026-09-05T05:10:00Z'),
      intercept('2026-09-04T12:00:00Z'),
      intercept('2026-09-03T12:10:00Z'),
      intercept('2026-09-02T12:20:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.resolvedTimezone).toBe('UTC');
    expect(pulse.hours[23].intercepts).toBe(1);
    expect(pulse.hours[5].intercepts).toBe(3);
    expect(pulse.hours[12].intercepts).toBe(3);
    expect(pulse.totalSample).toBe(7);
  });

  it('Asia/Kathmandu (+5:45): 跨日事件按本地日子/小时归属', () => {
    const events = [
      // 09-09T20:30Z → KTM 09-10 02:15 (跨零点, hour 2, 当天)
      intercept('2026-09-09T20:30:00Z'),
      // 09-09T14:00Z → KTM 09-09 19:45 (hour 19, 前一天)
      intercept('2026-09-09T14:00:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'Asia/Kathmandu');
    expect(pulse.resolvedTimezone).toBe('Asia/Kathmandu');
    expect(pulse.hours[2].intercepts).toBe(1);
    expect(pulse.hours[19].intercepts).toBe(1);
    expect(pulse.hours[20].intercepts).toBe(0);
    expect(pulse.hours[23].intercepts).toBe(0);
    expect(pulse.activeDays).toBe(2);
    expect(pulse.totalSample).toBe(2);
  });

  it('America/New_York 春令时 (2026-03-08): EST/EDT 两侧行情各自换算正确', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const events = [
      // 03-07T03:00Z → EST (UTC-5) 03-06 22:00
      intercept('2026-03-07T03:00:00Z'),
      // 03-09T03:00Z → EDT (UTC-4) 03-08 23:00
      intercept('2026-03-09T03:00:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, now, 'America/New_York');
    expect(pulse.hours[22].intercepts).toBe(1);
    expect(pulse.hours[23].intercepts).toBe(1);
    expect(pulse.hours[3].intercepts).toBe(0);
    expect(pulse.activeDays).toBe(2);
    // 同样两条按 UTC 全落在 hour 3 — 证明时区确实参与换算
    const utcPulse = aggregateGuardPulse(events, now, 'UTC');
    expect(utcPulse.hours[3].intercepts).toBe(2);
    expect(utcPulse.hours[22].intercepts).toBe(0);
  });

  it('无效时区回退运行时本地, 绝不抛错', () => {
    const events = [
      intercept('2026-09-09T12:00:00Z'), intercept('2026-09-09T13:00:00Z'),
      intercept('2026-09-08T12:00:00Z'), intercept('2026-09-08T13:00:00Z'),
      intercept('2026-09-07T12:00:00Z'), intercept('2026-09-07T13:00:00Z'),
    ];
    for (const tz of ['Not/AZone', '', undefined, null]) {
      const pulse = aggregateGuardPulse(events, NOW, tz);
      expect(pulse.status).toBe('ok');
      expect(pulse.resolvedTimezone).not.toBe('Not/AZone');
      expect(typeof pulse.resolvedTimezone).toBe('string');
      expect(pulse.totalSample).toBe(6);
    }
  });
});

describe('aggregateGuardPulse — 回看窗口与事件口径', () => {
  it('28 天边界: daysAgo=27 计入, daysAgo=28 与未来事件排除', () => {
    const events = [
      intercept('2026-08-14T00:00:00Z'), // daysAgo 27 (UTC)
      intercept('2026-08-13T23:59:00Z'), // daysAgo 28 → 排除
      intercept('2026-09-11T00:00:00Z'), // 未来 → 排除
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.totalSample).toBe(1);
    expect(pulse.lookbackDays).toBe(PULSE_LOOKBACK_DAYS);
  });

  it('非 guard 事件不计入: reward / 无 kind 手记 / 其他 kind 不算', () => {
    const events = [
      ev('challenge_reward', '2026-09-08T12:00:00Z'),
      ev('mindful_recovery', '2026-09-08T13:00:00Z'),
      ev('mindful_recovery', '2026-09-08T13:30:00Z', { kind: 'emotion_reflection' }),
      ev('manual_adjustment', '2026-09-08T14:00:00Z'),
      greenAdoption('2026-09-08T15:00:00Z'),
      ev('mindful_recovery', '2026-09-09T15:00:00Z', { kind: 'reuse_adoption' }),
      ev('challenge_failed', '2026-09-07T15:00:00Z'),
    ];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.totalSample).toBe(3);
    expect(pulse.totalAdoptions).toBe(2);
    expect(pulse.totalIntercepts).toBe(1);
  });

  it('无效条目跳过, 绝不抛错', () => {
    const events = [
      null,
      {},
      { eventType: 'challenge_completed', createdAt: 'not-a-date' },
      { eventType: '', createdAt: '2026-09-08T12:00:00Z' },
      intercept('2026-09-08T12:00:00Z'),
    ] as unknown as GuardPulseEventInput[];
    const pulse = aggregateGuardPulse(events, NOW, 'UTC');
    expect(pulse.totalSample).toBe(1);
  });
});

describe('aggregateGuardPulse — 展示红线', () => {
  it('输出结构零金额零碳数值 (只有小时/次数/天数/密度)', () => {
    const pulse = aggregateGuardPulse(
      [intercept('2026-09-08T12:00:00Z'), greenAdoption('2026-09-08T13:00:00Z'), intercept('2026-09-09T12:30:00Z'),
        intercept('2026-09-05T23:00:00Z'), intercept('2026-09-06T23:10:00Z'), ev('mindful_recovery', '2026-09-06T23:20:00Z', { kind: 'reuse_adoption' })],
      NOW,
      'UTC',
    );
    expect(pulse.status).toBe('ok');
    const s = JSON.stringify(pulse);
    expect(s).not.toMatch(/\$|¥|€|£|amount|saved|percent|%|carbon|kg\b/i);
    expect(pulse.hours.every((h) => Number.isInteger(h.hour) && h.hour >= 0 && h.hour <= 23)).toBe(true);
  });
});
