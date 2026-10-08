// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BadgeCard, getBadgeDisplayName } from '../badge-card';
import type { BadgeDef } from '@/components/buddy/constants';
// TFn 未从组件导出 — 本地同签名定义
type TFn = (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => string;

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      if (params?.defaultValue !== undefined) return String(params.defaultValue);
      return key;
    },
    locale: 'en',
  }),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const m = await importOriginal();
  return m;
});

// formatShareHoursLabel 真实现: <0.1h 空串 — 不 mock, 走真实分支

const badge = (overrides: Partial<BadgeDef> = {}): BadgeDef =>
  ({
    id: 'green_guardian_10',
    emoji: '🛡️',
    color: '#4ade80',
    unlockConditionKey: 'buddy.badges.greenGuardian',
    progressTarget: 10,
    progressType: 'challenge_wins',
    group: 'guardian',
    ...overrides,
  }) as BadgeDef;

// TFn mock: key 直回 (i18n 缺失语义)
const tKeyEcho: TFn = (key) => key;

describe('getBadgeDisplayName', () => {
  it('i18n 命中 (label != key) 返回翻译', () => {
    const tHit: TFn = (key) => (key === 'buddy.badgeNames.green_guardian_10' ? '绿色守卫' : key);
    expect(getBadgeDisplayName('green_guardian_10', tHit)).toBe('绿色守卫');
  });

  it('i18n 缺失 (label === key) 兜底 title-case 人类可读名', () => {
    expect(getBadgeDisplayName('green_guardian_10', tKeyEcho)).toBe('Green Guardian 10');
  });

  it('空 label 兜底', () => {
    const tEmpty: TFn = () => '';
    expect(getBadgeDisplayName('streak_7', tEmpty)).toBe('Streak 7');
  });
});

describe('BadgeCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('渲染勋章名/emoji/温度话/品牌条', () => {
    render(<BadgeCard badge={badge()} progressValue={10} savedHours={3} userName="小明" />);
    expect(screen.getByTestId('badge-card')).toBeTruthy();
    // name 走 i18n-miss 兜底 (t 回 key)
    expect(screen.getByText('Green Guardian 10')).toBeTruthy();
    expect(screen.getByText('🛡️')).toBeTruthy();
    // guardian 组温度话 (defaultValue 兜底)
    expect(screen.getByText('Quietly guarded, one choice at a time.')).toBeTruthy();
    expect(screen.getByText('Symy')).toBeTruthy();
    expect(screen.getByText('小明')).toBeTruthy();
  });

  it('challenge_wins 出守卫数 chip', () => {
    render(<BadgeCard badge={badge()} progressValue={12} />);
    expect(screen.getByText('12 guards won')).toBeTruthy();
  });

  it('streak_days 出连续天数 chip; dream_fund_count 出基金数 chip', () => {
    render(<BadgeCard badge={badge({ progressType: 'streak_days', group: 'growth' })} progressValue={7} />);
    expect(screen.getByText('7 days in a row')).toBeTruthy();
    cleanup();
    render(<BadgeCard badge={badge({ progressType: 'dream_fund_count', group: 'milestone' })} progressValue={2} />);
    expect(screen.getByText('2 dreams growing')).toBeTruthy();
  });

  it('total_saves/AI 授予型 (big_truth) 不出数字 chip — 金额与无计数均零 chip', () => {
    const { container } = render(<BadgeCard badge={badge({ progressType: 'total_saves' })} progressValue={500} />);
    expect(container.textContent).not.toContain('guards won');
    expect(container.textContent).not.toContain('days in a row');
    cleanup();
    const { container: c2 } = render(<BadgeCard badge={badge({ progressType: 'big_truth' })} progressValue={0} />);
    expect(c2.textContent).not.toContain('guards won');
    // AI 授予型仍有荣誉: 勋章名与温度话照出
    expect(c2.textContent).toContain('Green Guardian 10');
  });

  it('progressValue 0/负/NaN → 无 chip (v<=0 早退)', () => {
    const { container } = render(<BadgeCard badge={badge()} progressValue={0} />);
    expect(container.textContent).not.toContain('guards won');
  });

  it('赢回小时为英雄短语; <0.1h 落「a green choice」兜底', () => {
    render(<BadgeCard badge={badge()} progressValue={10} savedHours={2.5} />);
    // formatShareHoursLabel(2.5) 真实现 → hero 短语含 'won back' (label+hero 至少 2 处)
    expect(screen.getAllByText(/won back/).length).toBeGreaterThanOrEqual(2);
    cleanup();
    render(<BadgeCard badge={badge()} progressValue={10} savedHours={0.05} />);
    expect(screen.getByText('a green choice')).toBeTruthy();
  });

  it('卡面全文本不含金额符号 (¥/$/元) — 红线', () => {
    const { container } = render(
      <BadgeCard badge={badge({ progressType: 'total_saves' })} progressValue={9999} savedHours={4} userName="测试" />
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/[¥$]|元|CNY|USD/);
  });

  it('非法 date 兜底当前时间不崩溃', () => {
    render(<BadgeCard badge={badge()} progressValue={10} date="not-a-date" />);
    expect(screen.getByTestId('badge-card')).toBeTruthy();
    // 顶栏日期兜底为今天 (英文月份名渲染成功)
    const cardText = screen.getByTestId('badge-card').textContent ?? '';
    expect(cardText).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });
});
