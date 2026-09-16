// @vitest-environment happy-dom
/**
 * DreamAchievementOverlay 直测 (batch78-a)
 *
 * 梦想基金是全 app 唯一允许保留金额的语境 (freedom-time Owner 铁律),
 * 金额必须精确等于 formatCurrency(current / 100) 产物 (P1-19 统一口径)。
 * 本文件用真实 formatCurrency (不 mock '@/lib/format') 断言形状,
 * 并锁 null fund 降级、Escape/按钮关闭、ShareModal 回传 medal。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatCurrency } from '@/lib/format';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import type { DreamFund } from '@/types/buddy-state';

const { shareSpy } = vi.hoisted(() => ({ shareSpy: vi.fn() }));

vi.mock('@/components/share/share-modal', () => ({
  ShareModal: (props: Record<string, unknown>) => {
    shareSpy(props);
    return null;
  },
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) =>
      params?.defaultValue ?? key,
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 25,
    rateIsDefault: false,
    setHourlyRate: vi.fn(),
    isLoading: false,
  }),
}));

import { DreamAchievementOverlay } from '../dream-achievement-overlay';

function fund(overrides: Partial<DreamFund> = {}): DreamFund {
  return { id: 'df-1', name: 'Guitar', target: 200000, current: 100000, emoji: '🎸', ...overrides };
}

beforeEach(() => {
  // formatCurrency 运行时从 localStorage 读 locale — 钉住 en 保证 $ 产物
  window.localStorage.setItem('symy-locale', 'en');
  shareSpy.mockClear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('DreamAchievementOverlay 金额口径', () => {
  it('金额 === formatCurrency(current / 100): 整千元 "$1,000.00"', () => {
    render(<DreamAchievementOverlay fund={fund()} onClose={vi.fn()} />);
    expect(screen.getByTestId('dream-achievement-amount').textContent).toBe(
      `Actually saved: ${formatCurrency(1000)}`
    );
    expect(screen.getByTestId('dream-achievement-amount').textContent).toContain('$1,000.00');
  });

  it('带小数的分转元 "$1,234.56" — 千位分隔符 + 两位小数', () => {
    render(<DreamAchievementOverlay fund={fund({ current: 123456 })} onClose={vi.fn()} />);
    expect(screen.getByTestId('dream-achievement-amount').textContent).toBe(
      `Actually saved: ${formatCurrency(1234.56)}`
    );
    expect(screen.getByTestId('dream-achievement-amount').textContent).toContain('$1,234.56');
  });

  it('自由时间标签 === moneyToFreedomLabel(current / 100, "en", 25)', () => {
    render(<DreamAchievementOverlay fund={fund()} onClose={vi.fn()} />);
    expect(screen.getByTestId('dream-achievement-hours').textContent).toBe(
      moneyToFreedomLabel(1000, 'en', 25)
    );
    expect(screen.getByTestId('dream-achievement-hours').textContent).toBe('40 hours');
  });

  it('金额区无散落格式化痕迹 (无 toFixed 截断产物如 "$1000")', () => {
    render(<DreamAchievementOverlay fund={fund({ current: 100000 })} onClose={vi.fn()} />);
    const text = screen.getByTestId('dream-achievement-amount').textContent ?? '';
    expect(text).toMatch(/^\w[\w' ]*: \$[\d,]+\.\d{2}$/);
    expect(text).not.toBe('Actually saved: $1000');
  });
});

describe('DreamAchievementOverlay 降级与交互', () => {
  it('fund=null → 不渲染, Escape 不触发回调', () => {
    const onClose = vi.fn();
    const { container } = render(<DreamAchievementOverlay fund={null} onClose={onClose} />);
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('dream-achievement-overlay')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape → onClose + 弹层移除', () => {
    const onClose = vi.fn();
    render(<DreamAchievementOverlay fund={fund()} onClose={onClose} />);
    expect(screen.getByTestId('dream-achievement-overlay')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dream-achievement-overlay')).toBeNull();
  });

  it('关闭按钮 → onClose + 弹层移除', () => {
    const onClose = vi.fn();
    render(<DreamAchievementOverlay fund={fund()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dream-achievement-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dream-achievement-overlay')).toBeNull();
  });

  it('分享按钮 → ShareModal 收到 medal (itemTitle + savedCents=分)', () => {
    render(<DreamAchievementOverlay fund={fund({ name: 'Guitar', current: 123456 })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('dream-achievement-share'));
    const lastCall = shareSpy.mock.calls.at(-1)?.[0] as { open: boolean; medal: { itemTitle: string; savedCents: number } };
    expect(lastCall.open).toBe(true);
    expect(lastCall.medal.itemTitle).toBe('Guitar');
    expect(lastCall.medal.savedCents).toBe(123456);
  });

  it('fund 变化 → 展示最新 fund', () => {
    const { rerender } = render(<DreamAchievementOverlay fund={fund()} onClose={vi.fn()} />);
    rerender(<DreamAchievementOverlay fund={fund({ name: 'Trip', current: 90000 })} onClose={vi.fn()} />);
    expect(screen.getByTestId('dream-achievement-fund').textContent).toBe('Trip');
    expect(screen.getByTestId('dream-achievement-amount').textContent).toContain(
      formatCurrency(900)
    );
  });
});
