// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.monthlyStatement.share.pill': '月度守护账单',
        'profile.monthlyStatement.share.hoursLabel': '这个月我为自己守住了',
        'profile.monthlyStatement.share.countLabel': '次拦截',
        'profile.monthlyStatement.share.streakLabel': '天最长连胜',
        'profile.monthlyStatement.share.tone.harvest': '丰收的一个月, 继续保持!',
        'profile.monthlyStatement.share.tone.steady': '平稳守护中, 步步扎实。',
        'profile.monthlyStatement.share.tone.starting': '起步也是开始, 小象陪着你。',
        'share.interceptMedal.brandTagline': 'Symy · 与你一起守住每个选择',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { MonthlyGuardStatementShareFace } from '../monthly-guard-statement-share';

const baseData = {
  monthLabel: '2026年9月',
  interceptCount: 12,
  hoursLabel: '37 小时',
  longestStreakDays: 9,
  tone: 'harvest' as const,
};

/**
 * monthly-guard-statement-share.tsx (117行) — 月度守护账单分享卡面 (batch54-b)。
 *
 * 红线: 类型级零金额 (MonthlyStatementShareData 无 amount 字段)。
 *
 * 锁定:
 * - 月份标签 + 小时主宣言 (面子)
 * - 双大数字 (拦截/连胜)
 * - 三档寄语 tone 切换
 * - 卡面 testid 导出锚
 */
describe('MonthlyGuardStatementShareFace 月度账单分享卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('月份标签 + 小时主宣言 + 双大数字', () => {
    render(<MonthlyGuardStatementShareFace data={baseData} />);
    expect(screen.getByText('2026年9月')).toBeTruthy();
    expect(screen.getByText('37 小时')).toBeTruthy();
    const stats = screen.getByTestId('monthly-statement-share-stats');
    expect(stats.textContent).toContain('12');
    expect(stats.textContent).toContain('9');
  });

  it('三档寄语切换 (harvest/steady/starting)', () => {
    const { unmount } = render(<MonthlyGuardStatementShareFace data={baseData} />);
    expect(screen.getByTestId('monthly-statement-share-elephant').textContent).toContain('丰收');
    unmount();
    cleanup();
    render(<MonthlyGuardStatementShareFace data={{ ...baseData, tone: 'steady' }} />);
    expect(screen.getByTestId('monthly-statement-share-elephant').textContent).toContain('平稳');
    unmount();
    cleanup();
    render(<MonthlyGuardStatementShareFace data={{ ...baseData, tone: 'starting' }} />);
    expect(screen.getByTestId('monthly-statement-share-elephant').textContent).toContain('起步');
  });

  it('卡面 testid 导出锚 (html-to-image)', () => {
    render(<MonthlyGuardStatementShareFace data={baseData} />);
    expect(screen.getByTestId('monthly-statement-share-face')).toBeTruthy();
  });

  it('品牌标语常驻', () => {
    render(<MonthlyGuardStatementShareFace data={baseData} />);
    expect(screen.getByText(/Symy · 与你一起守住每个选择/)).toBeTruthy();
  });
});
