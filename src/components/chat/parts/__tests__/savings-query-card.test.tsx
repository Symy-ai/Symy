// @vitest-environment happy-dom

/**
 * SavingsQueryCard 测试 (batch57-c)
 *
 * 覆盖验收:
 * 1. 有数据: 拦截轮次 + 胜率 + 三轨次数 + 自由小时 + 私享金额行全渲染
 * 2. 无数据: noData 引导态 (不渲染 0 元假账数字行)
 * 3. 红线: 三轨样本不足不渲染三轨行; 分享行 amount-free (无货币符号/金额)
 * 4. 组件零计算: 数字全部来自卡 payload (i18n key 读真实 zh message 表, 无 defaultValue)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SavingsQueryCard } from '../savings-query-card';
import zh from '../../../../i18n/messages/zh.json';
import en from '../../../../i18n/messages/en.json';
import type { SavingsQueryCardData } from '@/types/savings-query';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = { zh: zh.chat.savingsQuery, en: en.chat.savingsQuery } as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.savingsQuery\./, '')
        .split('.')
        .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), table.zh);
      let result = typeof raw === 'string' ? raw : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) result = result.replace(`{${k}}`, v);
      }
      return result;
    },
    locale: 'zh',
  }),
}));

const OK_CARD: SavingsQueryCardData = {
  window: 'thisMonth',
  status: 'ok',
  intercepts: 12,
  passRate: 0.75,
  trackCounts: { guard: 8, alt: 3, reuse: 1 },
  tracksAvailable: true,
  hoursReclaimed: 9,
  hoursLabel: '9 小时',
  private: { estSavedTotal: 225 },
  shareFace: { zh: '本月 16 次守护、挽回 9 小时 自由时间', en: '16 guards this month — 9 hours of free time won back' },
};

const NO_DATA_CARD: SavingsQueryCardData = {
  window: 'thisWeek',
  status: 'noData',
  intercepts: 0,
  passRate: null,
  trackCounts: { guard: 0, alt: 0, reuse: 0 },
  tracksAvailable: false,
  hoursReclaimed: 0,
  hoursLabel: '0 小时',
  private: { estSavedTotal: 0 },
  shareFace: { zh: '本周 0 次守护、挽回 0 小时 自由时间', en: '0 guards this week — 0 hours of free time won back' },
};

afterEach(() => cleanup());

describe('SavingsQueryCard 有数据形态', () => {
  it('全字段渲染: 轮次/胜率/三轨/小时/私享金额', () => {
    render(<SavingsQueryCard data={OK_CARD} />);
    const lines = screen.getByTestId('savings-query-lines').textContent;
    expect(lines).toContain('12');
    expect(lines).toContain('75%');
    expect(screen.getByTestId('savings-query-tracks').textContent).toContain('8');
    expect(lines).toContain('9 小时');
    expect(screen.getByTestId('savings-query-saved').textContent).toContain('$225');
  });

  it('分享行 amount-free: 次数 + 小时, 无货币符号无金额', () => {
    render(<SavingsQueryCard data={OK_CARD} />);
    const share = screen.getByTestId('savings-query-share').textContent;
    expect(share).toContain('16 次守护');
    expect(share).toContain('9 小时');
    expect(share).not.toMatch(/\$|225/);
  });

  it('三轨样本不足: 不渲染三轨行 (不造伪计数)', () => {
    render(<SavingsQueryCard data={{ ...OK_CARD, tracksAvailable: false }} />);
    expect(screen.queryByTestId('savings-query-tracks')).toBeNull();
  });
});

describe('SavingsQueryCard 无数据引导态', () => {
  it('noData: 引导文案, 不渲染数字行 (不显示 0 元假账)', () => {
    render(<SavingsQueryCard data={NO_DATA_CARD} />);
    const card = screen.getByTestId('savings-query-card');
    expect(card.getAttribute('data-status')).toBe('noData');
    expect(screen.getByTestId('savings-query-empty').textContent).toContain('开张');
    expect(screen.queryByTestId('savings-query-lines')).toBeNull();
    expect(screen.queryByTestId('savings-query-saved')).toBeNull();
  });
});
