// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string; count?: number; itemName?: string; amount?: number }) => {
  const map: Record<string, string> = {
    'buddy.patternAlertTitle': '发现一个模式?',
    'buddy.patternAlertCount': '这周 {count} 次你看到代价还是买了。',
    'buddy.patternAlertLast': '最近一次: {itemName} (¥{amount})',
    'buddy.patternAlertHint': '看见模式, 就是改变的第一步。',
  };
  let v = map[key] ?? opts?.defaultValue ?? key;
  if (opts) {
    for (const [k, val] of Object.entries(opts)) {
      if (val !== undefined) v = v.split(`{${k}}`).join(String(val));
    }
  }
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { PatternAlertBanner } from '../pattern-alert-banner';

const data = (failedCount: number, recent?: Array<{ itemName: string; amount: number }>) => ({
  failedCount,
  recentFailures: recent ?? [],
}) as never;

/**
 * pattern-alert-banner.tsx (45行) — 7 天 ≥2 次失败模式横幅 (P1-2)。
 *
 * 锁定:
 * - 三段文案: 标题+计数琥珀高亮+提示斜体
 * - count 插值
 * - recentFailures[0] 有 → 最近一次行; 空 → 无
 */
describe('PatternAlertBanner 模式横幅', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('三段文案 + count 插值', () => {
    render(<PatternAlertBanner data={data(3, [{ itemName: '咖啡机', amount: 129 }])} />);
    expect(screen.getByText('发现一个模式?')).toBeTruthy();
    expect(screen.getByText('这周 3 次你看到代价还是买了。').className).toContain('text-amber-400'); // 琥珀高亮
    expect(screen.getByText('看见模式, 就是改变的第一步。').className).toContain('italic'); // 斜体
  });

  it('最近一次: itemName+amount 插值', () => {
    render(<PatternAlertBanner data={data(2, [{ itemName: '蓝牙耳机', amount: 399 }])} />);
    expect(screen.getByText('最近一次: 蓝牙耳机 (¥399)')).toBeTruthy();
  });

  it('recentFailures 空 → 无最近行', () => {
    render(<PatternAlertBanner data={data(2)} />);
    expect(screen.queryByText(/最近一次/)).toBeNull();
    expect(screen.getByText('这周 2 次你看到代价还是买了。')).toBeTruthy(); // 主体仍在
  });
});
