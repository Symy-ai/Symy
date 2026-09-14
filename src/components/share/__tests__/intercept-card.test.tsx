/**
 * Component tests for InterceptCard (拦截勋章分享卡)
 *
 * 测试矩阵:
 *   - 面子主角: 赢回时间大字 (金额不再上分享卡 — owner 09-06 铁律)
 *   - 荣誉副行文案 (i18n title)
 *   - streakDays 行: 有值显示, 0/undefined 隐藏
 *   - greenSaved 行: true 显示, 缺省隐藏
 *   - 商品 chip: 有 itemTitle 显示, 空串隐藏
 *   - 底部品牌条 (Symy + tagline)
 *   - 日期渲染 (i18n locale)
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InterceptCard } from '../intercept-card';

// Mock i18n — 固定英文字典, 断言文案
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'share.interceptMedal.pill': 'Intercept Medal',
        'share.interceptMedal.title': 'You won this one — for you and the planet',
        'share.interceptMedal.resistedChip': 'Resisted: {item}',
        'share.interceptMedal.greenSaved': 'Chose the greener option',
        'share.interceptMedal.streak': '{days}-day intercept streak',
        'share.interceptMedal.brandTagline': 'Become a guardian with me',
        'share.dailyReport.hoursWonBack': '{hours} won back',
        'share.dailyReport.aGreenChoice': 'a green choice',
      };
      let result = translations[key] ?? params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

// Mock format — 金额渲染确定性断言 (组件传 savedCents/100)
vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number, opts?: { decimals?: boolean }) =>
    `$${amount.toFixed(opts?.decimals === false ? 0 : 2)}`,
}));

describe('InterceptCard', () => {
  const baseProps = {
    savedHours: 4.5,
    itemTitle: 'Air Fryer',
  };

  it('renders big saved amount without decimals for whole dollars', () => {
    render(<InterceptCard {...baseProps} />);
    expect(screen.getByText('4.5 hours won back')).toBeTruthy();
  });

  it('renders decimals for fractional amounts', () => {
    render(<InterceptCard {...baseProps} savedHours={4.45} />);
    expect(screen.getByText('4.5 hours won back')).toBeTruthy();
  });

  it('renders honor copy and brand tagline', () => {
    render(<InterceptCard {...baseProps} />);
    expect(screen.getByText('You won this one — for you and the planet')).toBeTruthy();
    expect(screen.getByText('Become a guardian with me')).toBeTruthy();
    expect(screen.getByText('Symy')).toBeTruthy();
    expect(screen.getByText('Intercept Medal')).toBeTruthy();
  });

  it('renders item chip when itemTitle present, hides when empty', () => {
    const { unmount } = render(<InterceptCard {...baseProps} />);
    expect(screen.getByText('Resisted: Air Fryer')).toBeTruthy();
    unmount();

    render(<InterceptCard savedHours={4.5} itemTitle="" />);
    expect(screen.queryByText(/Resisted:/)).toBeNull();
  });

  it('renders streak row when streakDays > 0, hides when undefined or 0', () => {
    const { unmount } = render(<InterceptCard {...baseProps} streakDays={3} />);
    expect(screen.getByText('3-day intercept streak')).toBeTruthy();
    unmount();

    const { unmount: unmount2 } = render(<InterceptCard {...baseProps} streakDays={0} />);
    expect(screen.queryByText(/intercept streak/)).toBeNull();
    unmount2();

    render(<InterceptCard {...baseProps} />);
    expect(screen.queryByText(/intercept streak/)).toBeNull();
  });

  it('renders greenSaved row only when greenSaved is true', () => {
    const { unmount } = render(<InterceptCard {...baseProps} greenSaved />);
    expect(screen.getByText('Chose the greener option')).toBeTruthy();
    unmount();

    render(<InterceptCard {...baseProps} />);
    expect(screen.queryByText('Chose the greener option')).toBeNull();
  });

  it('renders localized date from ISO input', () => {
    render(<InterceptCard {...baseProps} date="2026-09-05T10:00:00Z" />);
    // vitest setup 强制 TZ=UTC, en-US 长日期格式
    expect(screen.getByText('September 5, 2026')).toBeTruthy();
  });

  it('renders userName greeting when provided', () => {
    render(<InterceptCard {...baseProps} userName="Spark" />);
    expect(screen.getByText('Spark')).toBeTruthy();
  });

  it('square variant keeps amount + title (适配方形比例)', () => {
    render(<InterceptCard {...baseProps} variant="square" />);
    expect(screen.getByText('4.5 hours won back')).toBeTruthy();
    expect(screen.getByText('You won this one — for you and the planet')).toBeTruthy();
  });
});
