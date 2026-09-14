import { describe, it, expect } from 'vitest';
import {
  aggregateImpulseWindows,
  hourToWindow,
  isDateInWindow,
  MIN_SAMPLE_SIZE,
  DOMINANT_SHARE_THRESHOLD,
  type ImpulseWindowEventInput,
} from '../impulse-window';

/** 本地时区固定时刻, 避免 UTC 日期炸弹 */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 5, 15, hour, minute, 0);
}

function times(hours: number[]): ImpulseWindowEventInput[] {
  return hours.map((h) => ({ createdAt: at(h) }));
}

describe('hourToWindow', () => {
  it('maps hours into the four buckets with wrap-around late night', () => {
    expect(hourToWindow(0)).toBe('lateNight');
    expect(hourToWindow(4)).toBe('lateNight');
    expect(hourToWindow(5)).toBe('dawn');
    expect(hourToWindow(10)).toBe('dawn');
    expect(hourToWindow(11)).toBe('daytime');
    expect(hourToWindow(16)).toBe('daytime');
    expect(hourToWindow(17)).toBe('evening');
    expect(hourToWindow(21)).toBe('evening');
    expect(hourToWindow(22)).toBe('lateNight');
    expect(hourToWindow(23)).toBe('lateNight');
  });
});

describe('isDateInWindow', () => {
  it('checks local-hour membership including the wrap-around window', () => {
    expect(isDateInWindow(at(23), 'lateNight')).toBe(true);
    expect(isDateInWindow(at(2), 'lateNight')).toBe(true);
    expect(isDateInWindow(at(10), 'lateNight')).toBe(false);
    expect(isDateInWindow(at(12), 'daytime')).toBe(true);
  });
});

describe('aggregateImpulseWindows', () => {
  it('identifies late night as top window with share and counts', () => {
    // 6 深夜 + 2 白天 = 深夜 75%
    const events = times([22, 23, 0, 1, 2, 23, 12, 13]);
    const summary = aggregateImpulseWindows(events);
    expect(summary.status).toBe('ok');
    expect(summary.topWindow).toBe('lateNight');
    expect(summary.topCount).toBe(6);
    expect(summary.total).toBe(8);
    expect(summary.topShare).toBeCloseTo(0.75, 6);
    expect(summary.dominant).toBe(true);
    expect(summary.counts.lateNight).toBe(6);
    expect(summary.counts.daytime).toBe(2);
    expect(summary.counts.dawn).toBe(0);
  });

  it('returns insufficient below the sample threshold (boundary: threshold-1)', () => {
    const events = times([23, 23, 23, 23, 23, 23, 23]); // 7 < 8
    const summary = aggregateImpulseWindows(events);
    expect(summary.status).toBe('insufficient');
    expect(summary.topWindow).toBeNull();
    expect(summary.dominant).toBe(false);
  });

  it('reaches ok exactly at the sample threshold (boundary)', () => {
    const events = times([23, 23, 23, 23, 23, 23, 23, 12]); // 8 = MIN
    expect(MIN_SAMPLE_SIZE).toBe(8);
    expect(aggregateImpulseWindows(events).status).toBe('ok');
  });

  it('uniform distribution: top window reported but not dominant', () => {
    const events = times([2, 2, 12, 12, 18, 18, 8, 8]); // 每桶 2 条, 25% < 35%
    const summary = aggregateImpulseWindows(events);
    expect(summary.status).toBe('ok');
    expect(summary.topShare).toBeCloseTo(DOMINANT_SHARE_THRESHOLD - 0.10, 6);
    expect(summary.dominant).toBe(false);
  });

  it('skips invalid timestamps without counting them as samples', () => {
    const events: ImpulseWindowEventInput[] = [
      ...times([23, 23, 23, 23, 23, 23, 23]),
      { createdAt: 'not-a-date' },
      { createdAt: null },
      {},
    ];
    const summary = aggregateImpulseWindows(events);
    expect(summary.total).toBe(7);
    expect(summary.status).toBe('insufficient');
  });

  it('accepts ISO strings and buckets by local hours', () => {
    // 用本地时刻序列化, 保证 getHours 往返一致
    const iso = [22, 23, 0, 1, 2, 3, 4, 12].map((h) => at(h).toISOString());
    const summary = aggregateImpulseWindows(iso.map((createdAt) => ({ createdAt })));
    expect(summary.status).toBe('ok');
    expect(summary.topWindow).toBe('lateNight');
  });

  it('empty and null inputs degrade to insufficient', () => {
    expect(aggregateImpulseWindows([]).status).toBe('insufficient');
    expect(aggregateImpulseWindows(null).status).toBe('insufficient');
  });
});

describe('custom late-night window injection (batch49-a)', () => {
  it('night-owl window (00:00–05:00): 0–4 stay late night, 22–23 move to evening', () => {
    const hours = [0, 1, 2, 3, 4];
    expect(hourToWindow(1, hours)).toBe('lateNight');
    expect(hourToWindow(4, hours)).toBe('lateNight');
    expect(hourToWindow(22, hours)).toBe('evening');
    expect(hourToWindow(23, hours)).toBe('evening');
    expect(hourToWindow(5, hours)).toBe('dawn');
  });

  it('early-sleeper window (21:00–24:00): 21–23 late night, post-midnight hours move to dawn', () => {
    const hours = [21, 22, 23];
    expect(hourToWindow(21, hours)).toBe('lateNight');
    expect(hourToWindow(23, hours)).toBe('lateNight');
    expect(hourToWindow(1, hours)).toBe('dawn');
    expect(hourToWindow(20, hours)).toBe('evening');
  });

  it('default injection (no arg) keeps baseline behavior byte-identical', () => {
    expect(hourToWindow(23)).toBe('lateNight');
    expect(hourToWindow(3)).toBe('lateNight');
    expect(isDateInWindow(at(23), 'lateNight')).toBe(true);
  });

  it('aggregate re-buckets under a night-owl window', () => {
    // 同一批事件: 默认窗口下 6 深夜 + 2 白天; 夜猫窗口 (0–5) 下 0/1/2 三条深夜,
    // 22/23 两条归 evening, 23 那条也是 evening → 深夜 3 + evening 3 + daytime 2
    const events = times([22, 23, 0, 1, 2, 23, 12, 13]);
    const summary = aggregateImpulseWindows(events, [0, 1, 2, 3, 4]);
    expect(summary.status).toBe('ok');
    expect(summary.counts.lateNight).toBe(3);
    expect(summary.counts.evening).toBe(3);
    expect(summary.counts.daytime).toBe(2);
    // 3/8 = 37.5% ≥ 35% 仍 dominant, topWindow 取迭代序首个最大桶 (evening 与深夜同为 3, dawn 序在前者已为 0)
    expect(summary.topWindow).toBe('evening');
    expect(summary.dominant).toBe(true);
  });

  it('sample threshold and invalid-timestamp handling unchanged under custom window', () => {
    const events: ImpulseWindowEventInput[] = [
      ...times([21, 21, 21, 21, 21, 21, 21]),
      { createdAt: 'not-a-date' },
    ];
    expect(aggregateImpulseWindows(events, [21, 22, 23]).status).toBe('insufficient');
  });
});
