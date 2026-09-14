/**
 * monitor/helpers 纯函数测试 (testgap v5 低危补盲 batch72-c)
 *
 * 规则：
 * - getPlatformEmoji：已知平台命中映射；'unknown' 键与未收录平台同落 🛍️ 兜底
 * - formatReceiptTime：分桶 <1min justNow / <60min minutesAgo{n} / <24h hoursAgo{n} /
 *   <7d daysAgo{n} / ≥7d 直接 toLocaleDateString()（不走 i18n t()）
 *   —— 60s、60min、24h、7d 四个边界精确落桶
 * - formatCountdown：<=0 → justNow；<60s → 'Xs'；≥60s → 'm:ss'（秒补零）
 *
 * 现状缺陷记录（不改源码，见 /tmp/b72c-defects.md）：
 * - formatReceiptTime 对非法 dateStr 无 NaN 守卫 → 返回 'Invalid Date' 字符串
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPlatformEmoji, formatReceiptTime, formatCountdown } from '@/components/monitor/helpers';

const NOW = new Date('2026-09-13T12:00:00Z');

// t() 替身：把 key 与 values 拼进返回值，便于断言分桶命中与传参
const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values && 'n' in values ? `:${values.n}` : ''}`;

afterEach(() => {
  vi.useRealTimers();
});

describe('getPlatformEmoji', () => {
  it('已知平台返回映射 emoji', () => {
    expect(getPlatformEmoji('amazon')).toBe('📦');
    expect(getPlatformEmoji('tiktok_shop')).toBe('🎵');
    expect(getPlatformEmoji('target')).toBe('🎯');
    expect(getPlatformEmoji('walmart')).toBe('🛒');
    expect(getPlatformEmoji('shein')).toBe('👗');
    expect(getPlatformEmoji('temu')).toBe('🔥');
    expect(getPlatformEmoji('ebay')).toBe('🏷️');
  });

  it('unknown 键与未收录平台统一落 🛍️ 兜底', () => {
    expect(getPlatformEmoji('unknown')).toBe('🛍️');
    expect(getPlatformEmoji('not-a-platform')).toBe('🛍️');
    expect(getPlatformEmoji('')).toBe('🛍️');
  });
});

describe('formatReceiptTime', () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  it('<1 分钟 → justNow', () => {
    expect(formatReceiptTime(new Date(NOW.getTime() - 30_000).toISOString(), t)).toBe('common.justNow');
  });

  it('边界：恰好 60s 落 minutesAgo{n=1}，59s 仍 justNow', () => {
    expect(formatReceiptTime(new Date(NOW.getTime() - 60_000).toISOString(), t)).toBe('common.minutesAgo:1');
    expect(formatReceiptTime(new Date(NOW.getTime() - 59_999).toISOString(), t)).toBe('common.justNow');
  });

  it('1~59 分钟 → minutesAgo{n}', () => {
    expect(formatReceiptTime(new Date(NOW.getTime() - 5 * 60_000).toISOString(), t)).toBe('common.minutesAgo:5');
    expect(formatReceiptTime(new Date(NOW.getTime() - 59 * 60_000).toISOString(), t)).toBe('common.minutesAgo:59');
  });

  it('边界：60min → hoursAgo{n=1}；90min 取整为 hoursAgo{n=1}', () => {
    expect(formatReceiptTime(new Date(NOW.getTime() - 60 * 60_000).toISOString(), t)).toBe('common.hoursAgo:1');
    expect(formatReceiptTime(new Date(NOW.getTime() - 90 * 60_000).toISOString(), t)).toBe('common.hoursAgo:1');
  });

  it('边界：24h → daysAgo{n=1}；6 天仍在 daysAgo 桶', () => {
    expect(formatReceiptTime(new Date(NOW.getTime() - 24 * 3_600_000).toISOString(), t)).toBe('common.daysAgo:1');
    expect(formatReceiptTime(new Date(NOW.getTime() - 6 * 86_400_000).toISOString(), t)).toBe('common.daysAgo:6');
  });

  it('边界：≥7 天不走 t()，直接 toLocaleDateString()', () => {
    const dateStr = new Date(NOW.getTime() - 7 * 86_400_000).toISOString();
    expect(formatReceiptTime(dateStr, t)).toBe(new Date(dateStr).toLocaleDateString());
    expect(formatReceiptTime(dateStr, t)).not.toContain('common.');
  });

  it('现状固化：非法 dateStr 无 NaN 守卫，穿透为 Invalid Date 字符串', () => {
    expect(formatReceiptTime('not-a-date', t)).toBe(new Date('not-a-date').toLocaleDateString());
  });
});

describe('formatCountdown', () => {
  it('<=0 → justNow（含负数防御）', () => {
    expect(formatCountdown(0, t)).toBe('common.justNow');
    expect(formatCountdown(-5, t)).toBe('common.justNow');
  });

  it('<60s → 裸秒数', () => {
    expect(formatCountdown(59, t)).toBe('59s');
    expect(formatCountdown(1, t)).toBe('1s');
  });

  it('≥60s → m:ss，秒位补零', () => {
    expect(formatCountdown(60, t)).toBe('1:00');
    expect(formatCountdown(90, t)).toBe('1:30');
    expect(formatCountdown(125, t)).toBe('2:05');
    expect(formatCountdown(600, t)).toBe('10:00');
  });
});
