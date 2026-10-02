// query-window-range — 时间窗纯函数行为锁（此前 0 测试）
// 周界 Monday-start（localWeekStart 同约定）/ 月界本地自然月 / 切片机械过滤。
import { describe, expect, it } from 'vitest';
import { queryWindowRange, sliceEventsByQueryWindow } from '../query-window-range';

// 2026-10-02 是周五。周一 = 2026-09-28。
const NOW = new Date(2026, 9, 2, 15, 30);

describe('queryWindowRange — 窗口界计算', () => {
  it('thisWeek: 周一起 7 天 (Friday now → 上周一 09-28)', () => {
    const { start, end } = queryWindowRange('thisWeek', NOW);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8); // September
    expect(start.getDate()).toBe(28);
    expect((end.getTime() - start.getTime()) / 86400000).toBe(7);
  });

  it('lastWeek: 上周一到本周一', () => {
    const { start, end } = queryWindowRange('lastWeek', NOW);
    expect(start.getDate()).toBe(21);
    expect(end.getDate()).toBe(28);
    expect((end.getTime() - start.getTime()) / 86400000).toBe(7);
  });

  it('thisMonth: 本月 1 日到下月 1 日', () => {
    const { start, end } = queryWindowRange('thisMonth', NOW);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(10);
    expect(end.getDate()).toBe(1);
  });

  it('lastMonth: 上月 1 日到本月 1 日 (10月 → 9月窗, 30天)', () => {
    const { start, end } = queryWindowRange('lastMonth', NOW);
    expect(start.getMonth()).toBe(8);
    expect(end.getMonth()).toBe(9);
    expect((end.getTime() - start.getTime()) / 86400000).toBe(30); // Sept has 30 days
  });

  it('lastMonth 跨年: 1月 now → 去年12月窗', () => {
    const jan = new Date(2027, 0, 15);
    const { start, end } = queryWindowRange('lastMonth', jan);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
  });

  it('周一 00:00 边界: thisWeek start 就是 now 本身', () => {
    const monday = new Date(2026, 9, 5, 0, 0, 0); // 2026-10-05 Monday
    const { start } = queryWindowRange('thisWeek', monday);
    expect(start.getTime()).toBe(monday.getTime());
  });
});

describe('sliceEventsByQueryWindow — 窗口切片', () => {
  const inWeek = { createdAt: '2026-09-30T10:00:00' };   // Wed this week (local)
  const beforeWeek = { createdAt: '2026-09-27T10:00:00' }; // Sunday last week
  const weekStartEdge = { createdAt: '2026-09-28T00:00:00' }; // Monday 00:00 = start (inclusive)
  const nextWeekStart = { createdAt: '2026-10-05T00:00:00' }; // next Monday = exclusive

  it('窗口内保留, 窗口外过滤', () => {
    const out = sliceEventsByQueryWindow([inWeek, beforeWeek, weekStartEdge, nextWeekStart], 'thisWeek', NOW);
    expect(out).toEqual([inWeek, weekStartEdge]);
  });

  it('start 边界包含, end 边界排除 ([start, end))', () => {
    const out = sliceEventsByQueryWindow([weekStartEdge, nextWeekStart], 'thisWeek', NOW);
    expect(out).toEqual([weekStartEdge]);
  });

  it('非法 createdAt (NaN/垃圾串) 过滤不抛', () => {
    const out = sliceEventsByQueryWindow(
      [{ createdAt: 'not-a-date' }, { createdAt: String(NaN) }, inWeek],
      'thisWeek',
      NOW,
    );
    expect(out).toEqual([inWeek]);
  });

  it('null/undefined 事件数组 → 空数组', () => {
    expect(sliceEventsByQueryWindow(null, 'thisWeek', NOW)).toEqual([]);
    expect(sliceEventsByQueryWindow(undefined, 'thisWeek', NOW)).toEqual([]);
  });
});
