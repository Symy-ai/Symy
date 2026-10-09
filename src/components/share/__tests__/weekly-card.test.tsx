// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'share.weeklyCard.pill': '每周绿色周报',
        'share.weeklyCard.title': '七天, 安静守住',
        'share.weeklyCard.warm': '这一周都在为你出现。',
        'share.weeklyCard.hoursWonBack': '{hours} 赢回来了',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts && 'hours' in opts && opts.hours) v = v.replace('{hours}', String(opts.hours));
      return v;
    },
  }),
}));
vi.mock('../share-format', () => ({
  formatShareHoursLabel: (h: number, locale: string) => `${h} 小时自由 (${locale})`,
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { WeeklyCard } from '../weekly-card';

const baseData = {
  guardDays: 6,
  intercepts: 14,
  streakDays: 5,
  savedHours: 37.5,
  date: '2026-10-09',
};

/**
 * weekly-card.tsx (93行) — 每周绿色周报分享卡。
 *
 * 红线: 面子字段 only (天数/次数/小时 — 小时是换算后的自由时间, 非金额)。
 *
 * 锁定:
 * - 药丸标 + 日期标签 (locale 格式)
 * - 主宣言 + 小时大数字
 * - 三指标 (guardDays/intercepts/streak)
 * - safeCount 防御: NaN/负数/小数 → 0/取整
 * - 坏日期 → 今天兜底
 */
describe('WeeklyCard 周报分享卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('药丸标 + 日期 + 主宣言 + 小时', () => {
    render(<WeeklyCard {...baseData} />);
    expect(screen.getByText('每周绿色周报')).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(screen.getByText('七天, 安静守住')).toBeTruthy();
    expect(screen.getByText('37.5 小时自由 (zh) 赢回来了')).toBeTruthy();
  });

  it('三指标渲染 (6/14/5)', () => {
    const { container } = render(<WeeklyCard {...baseData} />);
    const text = container.textContent ?? '';
    expect(text).toContain('6');
    expect(text).toContain('14');
    expect(text).toContain('5');
  });

  it('safeCount 防御: NaN/负/小数 → 0/0/取整', () => {
    render(<WeeklyCard {...baseData} guardDays={NaN} intercepts={-3} streakDays={4.9} />);
    const text = screen.getByTestId('weekly-card').textContent ?? '';
    expect(text).toContain('0'); // NaN→0, -3→0
    expect(text).toContain('4'); // 4.9→4
    expect(text).not.toContain('4.9');
  });

  it('坏日期 → 今天兜底 (不炸不 Invalid)', () => {
    render(<WeeklyCard {...baseData} date="not-a-date" />);
    expect(screen.getByText(/2026/)).toBeTruthy(); // 今天渲染
    expect(screen.queryByText(/Invalid/)).toBeNull();
  });
});
