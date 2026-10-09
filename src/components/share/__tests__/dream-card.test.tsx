// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string; hours?: string; days?: number }) => {
  const map: Record<string, string> = {
    'share.template.dream': '梦想勋章',
    'share.dreamCard.subtitle': '我们一起守到了它成真!',
    'share.interceptMedal.brandTagline': '少买点, 多生活。',
  };
  let v = map[key] ?? opts?.defaultValue ?? key;
  if (opts && opts.hours !== undefined) v = v.replace('{hours}', opts.hours);
  if (opts && opts.days !== undefined) v = v.replace('{days}', String(opts.days));
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { DreamCard } from '../dream-card';

/**
 * dream-card.tsx (71行) — 梦想勋章分享卡 (深绿金款)。
 *
 * 锁定:
 * - 勋章标+日期+梦想名+小时数 (hoursLabel 插值链)
 * - streakDays>0 → 连守天数行; 0/null → 无
 * - 坏日期 → 今天兜底 (不 Invalid)
 * - savedHours 0 → '—' 占位 (formatShareHoursLabel 空串兜底)
 */
describe('DreamCard 梦想勋章卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('完整: 勋章标+名字+小时+连守天数', () => {
    render(<DreamCard name="新房首付" savedHours={68} streakDays={30} date="2026-10-01" />);
    expect(screen.getByText('梦想勋章')).toBeTruthy();
    expect(screen.getByTestId('dream-card-name').textContent).toBe('新房首付');
    expect(screen.getByTestId('dream-card-hours').textContent).toContain('68');
    expect(screen.getByTestId('dream-card-hours').textContent).toContain('小时');
    expect(screen.getByTestId('dream-card-days').textContent).toContain('30');
    expect(screen.getByText('少买点, 多生活。')).toBeTruthy();
  });

  it('streakDays=0/null → 无天数行', () => {
    const { unmount } = render(<DreamCard name="X" savedHours={5} streakDays={0} />);
    expect(screen.queryByTestId('dream-card-days')).toBeNull();
    unmount();
    render(<DreamCard name="X" savedHours={5} />);
    expect(screen.queryByTestId('dream-card-days')).toBeNull();
  });

  it('坏日期 → 今天兜底 (不 Invalid)', () => {
    render(<DreamCard name="X" savedHours={5} date="not-a-date" />);
    expect(screen.queryByText(/Invalid/)).toBeNull();
    const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
    expect(screen.getByText(today)).toBeTruthy();
  });

  it('savedHours=0 → em-dash 占位', () => {
    render(<DreamCard name="X" savedHours={0} />);
    expect(screen.getByTestId('dream-card-hours').textContent).toContain('—');
  });
});
