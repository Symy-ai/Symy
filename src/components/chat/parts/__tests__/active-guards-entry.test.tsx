// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'chat.activeGuards.entryHint': '你有进行中的守护, 点开看看',
    'common.close': '关闭',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { ActiveGuardsEntry } from '../active-guards-entry';

/**
 * active-guards-entry.tsx (50行) — 进行中守护固定入口条 (batch59-a, owner 09-30 关闭需求)。
 *
 * 锁定:
 * - 条上引导语无数字 (数字留面板内 — 面子/里子分流)
 * - 点击/回车/空格 → onOpen
 * - onDismiss 有 → 关闭钮 (stopPropagation); 无 → 不渲染
 */
describe('ActiveGuardsEntry 入口条', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('引导语渲染 (无数字 — 面子/里子分流)', () => {
    render(<ActiveGuardsEntry onOpen={vi.fn()} />);
    expect(screen.getByTestId('active-guards-entry').textContent).toContain('你有进行中的守护, 点开看看');
    expect(screen.getByTestId('active-guards-entry').textContent).not.toMatch(/\d/); // 无数字
  });

  it('点击/Enter/空格 → onOpen', () => {
    const onOpen = vi.fn();
    render(<ActiveGuardsEntry onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('active-guards-entry'));
    fireEvent.keyDown(screen.getByTestId('active-guards-entry'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('active-guards-entry'), { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('onDismiss 有 → 关闭钮 stopPropagation; 无 → 不渲染', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<ActiveGuardsEntry onOpen={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('active-guards-entry-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled(); // 不冒泡到条
    cleanup();
    render(<ActiveGuardsEntry onOpen={onOpen} />);
    expect(screen.queryByTestId('active-guards-entry-dismiss')).toBeNull();
  });
});
