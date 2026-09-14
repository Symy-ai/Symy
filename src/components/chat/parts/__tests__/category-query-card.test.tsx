// @vitest-environment happy-dom

/**
 * CategoryQueryCard 测试 (batch58-c)
 *
 * 覆盖验收:
 * 1. 有数据: 拦截次数 + 替代/复用采纳行渲染
 * 2. 该类 0 计数: ok 态如实展示 0 + 安抚注释 (不造 noData)
 * 3. 无数据: noData 引导态
 * 4. 红线: 卡上零金额零碳数值; i18n 读真实 zh message 表 (无 defaultValue)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CategoryQueryCard } from '../category-query-card';
import zh from '../../../../i18n/messages/zh.json';
import type { CategoryQueryCardData } from '@/types/dimension-query';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = { zh: zh.chat.categoryQuery, windows: zh.chat.savingsQuery.window } as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.(categoryQuery|savingsQuery)\./, '')
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

const OK_CARD: CategoryQueryCardData = {
  window: 'thisMonth',
  category: 'food',
  status: 'ok',
  intercepts: 3,
  altAdoptions: 2,
  reuseAdoptions: 1,
};

afterEach(() => cleanup());

describe('CategoryQueryCard 有数据形态', () => {
  it('拦截次数 + 采纳行渲染 (数字来自 payload)', () => {
    render(<CategoryQueryCard data={OK_CARD} />);
    expect(screen.getByTestId('category-query-intercepts').textContent).toContain('3');
    expect(screen.getByTestId('category-query-adoptions').textContent).toContain('2');
    expect(screen.getByTestId('category-query-adoptions').textContent).toContain('1');
    expect(screen.getByTestId('category-query-card').getAttribute('data-status')).toBe('ok');
  });

  it('该类 0 计数: 如实展示 0 + 安抚注释 (庆祝框架, 非羞辱)', () => {
    render(<CategoryQueryCard data={{ ...OK_CARD, intercepts: 0, altAdoptions: 0, reuseAdoptions: 0 }} />);
    expect(screen.getByTestId('category-query-intercepts').textContent).toContain('0');
    expect(screen.getByTestId('category-query-note').textContent).toContain('不急');
  });

  it('卡上零金额零碳数值', () => {
    render(<CategoryQueryCard data={OK_CARD} />);
    const text = screen.getByTestId('category-query-card').textContent || '';
    expect(text).not.toMatch(/\$|元|carbon|kg/i);
  });
});

describe('CategoryQueryCard 无数据引导态', () => {
  it('noData: 引导文案, 不渲染数字行', () => {
    render(<CategoryQueryCard data={{ ...OK_CARD, status: 'noData', window: 'thisWeek' }} />);
    expect(screen.getByTestId('category-query-card').getAttribute('data-status')).toBe('noData');
    expect(screen.getByTestId('category-query-empty').textContent).toContain('开张');
    expect(screen.queryByTestId('category-query-lines')).toBeNull();
  });
});
