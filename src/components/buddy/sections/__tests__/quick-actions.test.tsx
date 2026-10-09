// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string; n?: number }) => {
  const map: Record<string, string> = {
    'buddy.challenge': '挑战',
    'buddy.convinceMeToBuy': '帮我看看值不值',
    'buddy.seeItAriaLabel': '看看真实成本',
  };
  let v = map[key] ?? opts?.defaultValue ?? key;
  if (opts && opts.n !== undefined) v = v.replace('{n}', String(opts.n));
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));
vi.mock('@/lib/feature-flags', () => ({ GACHA_FEATURE_ENABLED: false }));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { QuickActions } from '../quick-actions';

const baseProps = {
  isDemo: false,
  isCheckingChallenge: false,
  challengePulse: false,
  challengeLimitData: null,
  onSeeItClick: vi.fn(),
};

/**
 * quick-actions.tsx (86行) — 快捷操作 (File Split Wave 1 搬运件)。
 *
 * 锁定:
 * - 挑战按钮渲染 + 点击回调
 * - 额度门卫: remaining=0 → disabled + Limit 徽章 + title 提示
 * - remaining>0 → N left 徽章可点
 * - demo/premium/degraded → 无徽章
 * - GACHA_FEATURE_ENABLED=false → 抽卡按钮不渲染 (owner 09-30 令)
 */
describe('QuickActions 快捷操作', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('挑战按钮渲染 + 点击 → onSeeItClick', () => {
    render(<QuickActions {...baseProps} />);
    fireEvent.click(screen.getByLabelText('看看真实成本'));
    expect(baseProps.onSeeItClick).toHaveBeenCalledTimes(1);
  });

  it('额度耗尽: disabled + Limit 徽章 + title 提示', () => {
    render(
      <QuickActions
        {...baseProps}
        challengeLimitData={{ remaining: 0, isPremium: false, degraded: false } as never}
      />,
    );
    const btn = screen.getByLabelText('看看真实成本');
    expect(btn.getAttribute('disabled')).toBe('');
    expect(screen.getByText('Limit')).toBeTruthy();
    expect(btn.getAttribute('title')).toContain("You've seen 5 times");
  });

  it('remaining>0 → N left 徽章可点', () => {
    render(
      <QuickActions
        {...baseProps}
        challengeLimitData={{ remaining: 2, isPremium: false, degraded: false } as never}
      />,
    );
    expect(screen.getByText('2 left')).toBeTruthy();
    expect(screen.getByLabelText('看看真实成本').getAttribute('disabled')).toBeNull();
  });

  it('demo / premium / degraded 三态 → 无徽章', () => {
    const { unmount } = render(<QuickActions {...baseProps} isDemo />);
    expect(screen.queryByText(/left/)).toBeNull();
    unmount();
    render(
      <QuickActions
        {...baseProps}
        challengeLimitData={{ remaining: 0, isPremium: true, degraded: false } as never}
      />,
    );
    expect(screen.queryByText('Limit')).toBeNull();
    unmount();
    render(
      <QuickActions
        {...baseProps}
        challengeLimitData={{ remaining: 0, isPremium: false, degraded: true } as never}
      />,
    );
    expect(screen.queryByText('Limit')).toBeNull();
  });

  it('GACHA flag=false → 抽卡按钮不渲染 (owner 09-30 令)', () => {
    render(<QuickActions {...baseProps} onGacha={vi.fn()} />);
    expect(screen.queryByTestId('gacha-entry')).toBeNull();
    expect(screen.queryByText(/gacha/i)).toBeNull();
  });
});
