/**
 * format-relative-time 纯函数测试 (testgap v5 低危补盲 batch72-c)
 *
 * 规则：
 * - formatRelativeTime：string/Date 双入口；非法日期返回 ''（NaN 守卫）；
 *   locale 仅 'zh' 走 zhCN，其余（含未传/非法）一律 enUS；未来日期带 in 前缀
 * - formatRelativeTimeShort：纯分桶 —— <1min 'just now'、<1h 'Xm ago'、
 *   <24h 'Xh ago'、≥24h 'Xd ago'；边界值精确落桶（60s→1m、60m→1h、24h→1d）；
 *   未来时间戳 diff 为负 → 落 'just now' 桶（现状固化）；非法日期返回 ''
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, formatRelativeTimeShort } from '@/lib/format-relative-time';

// 固定"现在"，让 date-fns 与分桶逻辑都确定性
const NOW = new Date('2026-09-13T12:00:00Z');

const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('en（默认 locale）：过去时间带 ago 后缀，分钟级精确到数值', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTime(minutesAgo(5))).toBe('5 minutes ago');
    expect(formatRelativeTime(minutesAgo(5), 'en')).toBe('5 minutes ago');
    expect(formatRelativeTime(hoursAgo(2))).toMatch(/2 hours ago/);
    expect(formatRelativeTime(daysAgo(3))).toBe('3 days ago');
  });

  it('zh locale 走 zhCN 文案（分钟 + 前）', () => {
    vi.setSystemTime(NOW);
    const zh = formatRelativeTime(minutesAgo(5), 'zh');
    expect(zh).toContain('5 分钟');
    expect(zh).toContain('前');
  });

  it('1 分钟内：date-fns 对亚分钟距离取整为 1 minute（现状固化）', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTime(new Date(NOW.getTime() - 30_000))).toBe('1 minute ago');
  });

  it('未来时间带 in 前缀（不抛错）', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * 60_000))).toMatch(/^in /);
  });

  it('string 入口与 Date 入口等价', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTime('2026-09-13T11:55:00.000Z')).toBe('5 minutes ago');
  });

  it('非法日期（string 与 Date 两路）返回空串，不抛错', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTime('not-a-date')).toBe('');
    expect(formatRelativeTime(new Date('invalid'))).toBe('');
    expect(formatRelativeTime('')).toBe('');
  });
});

describe('formatRelativeTimeShort', () => {
  it('分桶：<1min just now、Xm ago、Xh ago、Xd ago', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 30_000))).toBe('just now');
    expect(formatRelativeTimeShort(minutesAgo(5))).toBe('5m ago');
    expect(formatRelativeTimeShort(minutesAgo(59))).toBe('59m ago');
    expect(formatRelativeTimeShort(hoursAgo(2))).toBe('2h ago');
    expect(formatRelativeTimeShort(hoursAgo(23))).toBe('23h ago');
    expect(formatRelativeTimeShort(daysAgo(5))).toBe('5d ago');
  });

  it('边界值精确落桶：60s→1m、60m→1h、24h→1d（向下取整）', () => {
    vi.setSystemTime(NOW);
    // 恰好 60s：不再算 just now
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 60_000))).toBe('1m ago');
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 59_999))).toBe('just now');
    // 恰好 60min：不再算 Xm；差 1ms 仍是 Xm 桶（floor 到 59）
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 3_600_000))).toBe('1h ago');
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 3_599_999))).toBe('59m ago');
    // 恰好 24h：不再算 Xh；差 1ms 仍是 Xh 桶（floor 到 23）
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 86_400_000))).toBe('1d ago');
    expect(formatRelativeTimeShort(new Date(NOW.getTime() - 86_399_999))).toBe('23h ago');
  });

  it('未来时间戳 diff 为负，落 just now 桶（现状固化）', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTimeShort(new Date(NOW.getTime() + 60_000))).toBe('just now');
    expect(formatRelativeTimeShort(new Date(NOW.getTime() + 3 * 86_400_000))).toBe('just now');
  });

  it('string 入口与非法日期返回空串', () => {
    vi.setSystemTime(NOW);
    expect(formatRelativeTimeShort('2026-09-13T11:55:00.000Z')).toBe('5m ago');
    expect(formatRelativeTimeShort('not-a-date')).toBe('');
    expect(formatRelativeTimeShort(new Date('invalid'))).toBe('');
  });
});
