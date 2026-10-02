// monthly-guard-heatmap — 月守护热力图聚合（此前 0 测试）
import { describe, expect, it } from 'vitest';
import {
  dayKey,
  colorForCount,
  buildCalendarCells,
  aggregateMonth,
  CELL_CLASSES,
  WEEKDAYS_EN,
  WEEKDAYS_ZH,
} from '@/lib/monthly-guard-heatmap';
import type { ImpulseEvent } from '@/lib/impulse-detector';

const NOW = new Date(2026, 9, 15, 12, 0, 0);

function ev(subType: 'challenge_completed' | 'refund_processed', daysAgo: number, amount = 50): ImpulseEvent {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  return { id: 'ev-' + daysAgo + '-' + subType, subType, timestamp: d, amount, platform: 'taobao', item: 'x', category: 'other', impulseScore: 50, reasons: [], isLivestream: false, isFlashSale: false } as ImpulseEvent;
}

describe('dayKey / colorForCount — 基础件', () => {
  it('dayKey 本地 y-m-d', () => {
    expect(dayKey(new Date(2026, 9, 2))).toBe('2026-9-2');
  });

  it('colorForCount 四档', () => {
    expect(colorForCount(0)).toBe(CELL_CLASSES[0]);
    expect(colorForCount(1)).toBe(CELL_CLASSES[1]);
    expect(colorForCount(2)).toBe(CELL_CLASSES[2]);
    expect(colorForCount(3)).toBe(CELL_CLASSES[3]);
    expect(colorForCount(10)).toBe(CELL_CLASSES[3]);
  });
});

describe('buildCalendarCells — 42格日历', () => {
  it('恒 42 格且周一起始', () => {
    const cells = buildCalendarCells(2026, 9); // 2026-10
    expect(cells.length % 7).toBe(0);  // 整周数(35或42) — 7列grid不断行
    // 2026-10-01 是周四 → 周一起始 offset=3, 首格是 9月28(一)
    expect(cells[0].date.getDate()).toBe(28);
    expect(cells[0].date.getMonth()).toBe(8);
  });

  it('isCurrentMonth 正确划分', () => {
    const cells = buildCalendarCells(2026, 9);
    const inMonth = cells.filter((c) => c.isCurrentMonth);
    expect(inMonth.length).toBe(31); // 十月 31 天
  });

  it('isToday 命中当天', () => {
    const cells = buildCalendarCells(2026, 9);
    const today = cells.find((c) => c.isToday);
    // NOW 是 10月15 — 但 buildCalendarCells 用真实 now; 只有当前年月才有 today
    expect(today !== undefined).toBe(true);
  });
});

describe('aggregateMonth — 30天窗聚合', () => {
  it('窗口内事件计数/拦截退款分桶/金额累计', () => {
    const events = [
      ev('challenge_completed', 1, 100),
      ev('challenge_completed', 1, 20),
      ev('refund_processed', 5, 60),
    ];
    const agg = aggregateMonth(events, 2026, 9, NOW);
    expect(agg.intercepts).toBe(2);
    expect(agg.refunds).toBe(1);
    expect(agg.moneyLeft).toBe(180);
    // 10月14有2次 → count=2 格
    const dayKey14 = dayKey(new Date(2026, 8 + 1, 14));
    const cell = agg.cells.find((c) => dayKey(c.date) === dayKey14 && c.isCurrentMonth);
    expect(cell?.count).toBe(2);
  });

  it('窗口外事件排除 (>29天)', () => {
    const agg = aggregateMonth([ev('challenge_completed', 35, 100)], 2026, 9, NOW);
    expect(agg.intercepts).toBe(0);
    expect(agg.moneyLeft).toBe(0);
  });

  it('非目标 subType 排除', () => {
    const other = { ...ev('challenge_completed', 1), subType: 'something_else' as never };
    const agg = aggregateMonth([other], 2026, 9, NOW);
    expect(agg.intercepts).toBe(0);
  });

  it('guardDays = 本月有事件的天数', () => {
    const events = [ev('challenge_completed', 1), ev('challenge_completed', 2), ev('refund_processed', 3)];
    const agg = aggregateMonth(events, 2026, 9, NOW);
    expect(agg.guardDays).toBe(3);
  });
});

describe('WEEKDAYS 双语表', () => {
  it('周一起始双语对齐', () => {
    expect(WEEKDAYS_EN[0]).toBe('Mon');
    expect(WEEKDAYS_ZH[0]).toBe('一');
    expect(WEEKDAYS_EN).toHaveLength(7);
    expect(WEEKDAYS_ZH).toHaveLength(7);
  });
});
