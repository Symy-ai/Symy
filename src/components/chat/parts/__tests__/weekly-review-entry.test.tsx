// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'chat.weeklyReview.entryHint': '你的绿色一周回顾好了, 点开看看',
    'common.close': '关闭',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { WeeklyReviewEntry } from '../weekly-review-entry';

/**
 * weekly-review-entry.tsx (50行) — 绿色周报入口固定入口条 (同 active-guards 模式)。
 *
 * 锁定:
 * - 引导语无数字 (数字留给卡内 — 面子/里子分流)
 * - 点击/回车/空格 → onOpen
 * - onDismiss stopPropagation; 缺省不渲染
 */
describe('WeeklyReviewEntry 入口条', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('引导语渲染 (无数字)', () => {
    render(<WeeklyReviewEntry onOpen={vi.fn()} />);
    expect(screen.getByTestId('weekly-review-entry').textContent).toContain('你的绿色一周回顾好了, 点开看看');
    expect(screen.getByTestId('weekly-review-entry').textContent).not.toMatch(/\d/);
  });

  it('点击/Enter/空格 → onOpen', () => {
    const onOpen = vi.fn();
    render(<WeeklyReviewEntry onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('weekly-review-entry'));
    fireEvent.keyDown(screen.getByTestId('weekly-review-entry'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('weekly-review-entry'), { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('onDismiss stopPropagation; 缺省不渲染', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<WeeklyReviewEntry onOpen={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('weekly-review-entry-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    cleanup();
    render(<WeeklyReviewEntry onOpen={onOpen} />);
    expect(screen.queryByTestId('weekly-review-entry-dismiss')).toBeNull();
  });
});
