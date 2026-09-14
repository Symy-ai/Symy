// @vitest-environment happy-dom

/**
 * ImpulseTimeCard 测试 (batch58-c)
 *
 * 覆盖验收:
 * 1. 有数据: 次数/天数 + 总量对照行渲染
 * 2. 样本不足: insufficient 引导态 (不渲染数字行, 不造伪规律)
 * 3. 红线: 卡上只有次数/天数/总量 — 零金额零碳数值
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ImpulseTimeCard } from '../impulse-time-query-card';
import zh from '../../../../i18n/messages/zh.json';
import type { ImpulseTimeCardData } from '@/types/dimension-query';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = { zh: zh.chat.impulseTimeQuery, windows: zh.chat.savingsQuery.window } as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.(impulseTimeQuery|savingsQuery)\./, '')
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

const OK_CARD: ImpulseTimeCardData = {
  window: 'thisMonth',
  impulseWindow: 'evening',
  status: 'ok',
  count: 6,
  days: 4,
  total: 8,
};

afterEach(() => cleanup());

describe('ImpulseTimeCard 有数据形态', () => {
  it('次数/天数 + 总量对照行渲染 (数字来自 payload)', () => {
    render(<ImpulseTimeCard data={OK_CARD} />);
    const count = screen.getByTestId('impulse-time-count').textContent;
    expect(count).toContain('6');
    expect(count).toContain('4');
    expect(screen.getByTestId('impulse-time-total').textContent).toContain('8');
    expect(screen.getByTestId('impulse-time-card').getAttribute('data-status')).toBe('ok');
  });

  it('次数 0: 安抚注释 (看见规律不是认罪, 非羞辱)', () => {
    render(<ImpulseTimeCard data={{ ...OK_CARD, count: 0, days: 0 }} />);
    expect(screen.getByTestId('impulse-time-note').textContent).toContain('保持');
  });

  it('卡上零金额零碳数值', () => {
    render(<ImpulseTimeCard data={OK_CARD} />);
    const text = screen.getByTestId('impulse-time-card').textContent || '';
    expect(text).not.toMatch(/\$|元|carbon|kg/i);
  });
});

describe('ImpulseTimeCard 样本不足引导态', () => {
  it('insufficient: 引导文案, 不渲染数字行', () => {
    render(<ImpulseTimeCard data={{ ...OK_CARD, status: 'insufficient' }} />);
    expect(screen.getByTestId('impulse-time-card').getAttribute('data-status')).toBe('insufficient');
    expect(screen.getByTestId('impulse-time-empty').textContent).toContain('攒');
    expect(screen.queryByTestId('impulse-time-lines')).toBeNull();
  });
});
