// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'buddy.spendingAffectsCompanion': '消费会影响小象的状态',
    'buddy.goodChoicesHelp': '好的选择在帮小象恢复',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { HealthNotificationOverlay } from '../health-notification-overlay';

const notif = (type: 'damage' | 'recovery' | 'badge', change: number) => ({
  message: '小象心情变化',
  type,
  vitalityChange: change,
}) as never;

/**
 * health-notification-overlay.tsx (44行) — vitality 变化覆盖层 (Wave 1 搬运件)。
 *
 * 锁定:
 * - damage: 红系+TrendingDown+红字变化
 * - recovery: 绿系+TrendingUp+绿字变化
 * - badge: 琥珀兜底
 * - 正数带 + 号; 负数原样
 */
describe('HealthNotificationOverlay 三态', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('damage: 红系+TrendingDown+消费影响文案', () => {
    render(<HealthNotificationOverlay notification={notif('damage', -5)} />);
    const card = document.querySelector('.backdrop-blur-xl') as HTMLElement;
    expect(card.className).toContain('bg-red-500/20');
    expect(screen.getByText('-5').className).toContain('text-red-400');
    expect(screen.getByText('消费会影响小象的状态')).toBeTruthy();
    expect(card.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });

  it('recovery: 绿系+TrendingUp+好选择文案; 正数带 +', () => {
    render(<HealthNotificationOverlay notification={notif('recovery', 10)} />);
    const card = document.querySelector('.backdrop-blur-xl') as HTMLElement;
    expect(card.className).toContain('bg-green-500/20');
    expect(screen.getByText('+10').className).toContain('text-green-400');
    expect(screen.getByText('好的选择在帮小象恢复')).toBeTruthy();
  });

  it('badge: 琥珀兜底 (未知态不裸奔)', () => {
    render(<HealthNotificationOverlay notification={notif('badge', 0)} />);
    const card = document.querySelector('.backdrop-blur-xl') as HTMLElement;
    expect(card.className).toContain('bg-amber-500/20');
  });
});
