// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { n?: number }) => {
  const map: Record<string, string> = {
    'status.symyStable': 'SYMY 稳定',
    'status.symyAlert': 'SYMY 警报',
    'status.symySuccess': '拦截成功',
    'status.allClear': '全线安然 ({n})',
    'status.impulseAlert': '冲动警报',
    'status.interventionSuccess': '干预成功',
  };
  let v = map[key] ?? key;
  if (opts && opts.n !== undefined) v = v.replace('{n}', String(opts.n));
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { StatusIndicator, StatusText } from '../status-indicator';

/**
 * status-indicator.tsx (92行) — 三态状态徽章 + 状态文本 (BUG-276 双主题色)。
 *
 * 锁定:
 * - 三态配色 (stable 松柏绿/alert 红/success 绿 — BUG-276 锚)
 * - alert 动画 pulse+shake / success bounce / stable 静
 * - size 三档
 * - onClick → cursor+scale 交互
 * - StatusText: count 插值 + 色分流
 */
describe('StatusIndicator 三态徽章', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('三态文案+配色 (BUG-276 双主题锚)', () => {
    const { unmount } = render(<StatusIndicator status="stable" />);
    expect(screen.getByText('SYMY 稳定').className).toContain('bg-emerald-800');
    unmount();
    render(<StatusIndicator status="alert" />);
    expect(screen.getByText('SYMY 警报').className).toContain('bg-red-600');
    unmount();
    render(<StatusIndicator status="success" />);
    expect(screen.getByText('拦截成功').className).toContain('bg-green-600');
  });

  it('动画: alert pulse+shake / success bounce / animated=false 全静', () => {
    const { unmount } = render(<StatusIndicator status="alert" />);
    expect(screen.getByText('SYMY 警报').className).toContain('animate-pulse');
    unmount();
    render(<StatusIndicator status="success" />);
    expect(screen.getByText('拦截成功').className).toContain('animate-bounce');
    unmount();
    render(<StatusIndicator status="alert" animated={false} />);
    expect(screen.getByText('SYMY 警报').className).not.toContain('animate-pulse');
  });

  it('size 三档: sm 圆 / lg 大圆角', () => {
    const { unmount } = render(<StatusIndicator status="stable" size="sm" />);
    expect(screen.getByText('SYMY 稳定').className).toContain('rounded-full');
    unmount();
    render(<StatusIndicator status="stable" size="lg" />);
    expect(screen.getByText('SYMY 稳定').className).toContain('text-2xl');
  });

  it('onClick → cursor-pointer + 触发', () => {
    const onClick = vi.fn();
    render(<StatusIndicator status="stable" onClick={onClick} />);
    const btn = screen.getByText('SYMY 稳定');
    expect(btn.className).toContain('cursor-pointer');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('StatusText 状态文本', () => {
  afterEach(() => cleanup());

  it('count 插值 + 三色', () => {
    const { unmount } = render(<StatusText status="stable" count={7} />);
    expect(screen.getByText(/全线安然 \(7\)/)).toBeTruthy();
    unmount();
    render(<StatusText status="alert" />);
    expect(screen.getByText('冲动警报').className).toContain('text-red-600');
  });

  it('count 缺省 → n=0', () => {
    render(<StatusText status="stable" />);
    expect(screen.getByText(/全线安然 \(0\)/)).toBeTruthy();
  });
});
