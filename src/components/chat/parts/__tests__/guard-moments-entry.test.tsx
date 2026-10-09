// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'chat.guardMoments.entryHint': '你有守护时刻的时间线, 点开看看',
    'common.close': '关闭',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { GuardMomentsEntry } from '../guard-moments-entry';

/**
 * guard-moments-entry.tsx (50行) — batch58-a 守护时刻时间线固定入口条 (同 active-guards 模式)。
 *
 * 锁定:
 * - 引导语无数字 (数字留给卡内 — 面子/里子分流)
 * - 点击/回车/空格 → onOpen
 * - onDismiss stopPropagation; 缺省不渲染
 */
describe('GuardMomentsEntry 入口条', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('引导语渲染 (无数字)', () => {
    render(<GuardMomentsEntry onOpen={vi.fn()} />);
    expect(screen.getByTestId('guard-moments-entry').textContent).toContain('你有守护时刻的时间线, 点开看看');
    expect(screen.getByTestId('guard-moments-entry').textContent).not.toMatch(/\d/);
  });

  it('点击/Enter/空格 → onOpen', () => {
    const onOpen = vi.fn();
    render(<GuardMomentsEntry onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('guard-moments-entry'));
    fireEvent.keyDown(screen.getByTestId('guard-moments-entry'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('guard-moments-entry'), { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('onDismiss stopPropagation; 缺省不渲染', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<GuardMomentsEntry onOpen={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('guard-moments-entry-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    cleanup();
    render(<GuardMomentsEntry onOpen={onOpen} />);
    expect(screen.queryByTestId('guard-moments-entry-dismiss')).toBeNull();
  });
});
