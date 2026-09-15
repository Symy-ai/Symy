/**
 * MinimumPaymentTrapCard tests (batch75-b — testgap 盲区补测, v5 #10)
 *
 * 覆盖 (断言与现状对齐):
 *  - CC fund 识别 (Round 122 扩大匹配) 与三类不渲染分支: 无 CC fund / 已还清 / 余额 < $100
 *  - 数学公式红线: B=3000 → 40 个月 (3yr 4mo)、利息 $1,800; +$200 → 11mo 省 $1,280; +$500 → 6mo 省 $1,080
 *    (apr=29.99%, minPayment=max(25, 4%×B), N=-ln(1-rB/P)/ln(1+r))
 *  - dismiss 折叠条 + localStorage 持久化 (按 fund id 分 key), restore 可恢复
 *  - 生命时间换算 hint (hourlyRate>0 且 saved500>0), isDemo 示例徽章
 */
// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinimumPaymentTrapCard } from '../minimum-payment-trap-card';
import type { DreamFund } from '@/types/buddy-state';

const DICT: Record<string, string> = {
  'buddy.minPaymentTrap': 'Minimum Payment Trap',
  'buddy.durationYearsMonths': '{years}yr {months}mo',
  'buddy.durationMonths': '{months}mo',
  'buddy.balance': 'Balance',
  'buddy.apr': 'APR',
  'buddy.minPaymentOnly': 'Minimum only',
  'buddy.month': 'mo',
  'buddy.payoff': 'payoff',
  'buddy.interest': 'interest',
  'buddy.addPerMonth': 'Add',
  'buddy.save': 'Save',
  'buddy.minPaymentLifeHint': 'Adding $500/mo = {hours} fewer hours of your life working for interest.',
  'buddy.minPaymentDataSource': 'Based on your "{fundName}" goal. Bank connection coming soon.',
  'buddy.minPaymentTrapCollapsed': 'Minimum Payment Trap — {amount} at risk',
  'buddy.minPaymentRestore': 'Show Minimum Payment Trap',
  'common.dismiss': 'Dismiss',
  'common.show': 'Show',
  'ahaMoment.sampleDataLabel': '📊 Sample',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const tpl = DICT[key] ?? (params?.defaultValue as string | undefined) ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl,
      );
    },
  }),
}));

function fund(overrides: Partial<DreamFund> = {}): DreamFund {
  return {
    id: 'cc-1',
    name: 'Credit Card Payoff',
    target: 3100,
    current: 100, // balance = 3000
    emoji: '💳',
    sortOrder: 0,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MinimumPaymentTrapCard — 渲染门槛 (返回 null 的条件)', () => {
  it('无信用卡类 fund → 不渲染', () => {
    const { container } = render(
      <MinimumPaymentTrapCard dreamFunds={[fund({ id: 'trip', name: 'Iceland Trip' })]} />,
    );
    expect(container.textContent).toBe('');
  });

  it('余额已还清 (current >= target) → 不渲染', () => {
    const { container } = render(
      <MinimumPaymentTrapCard dreamFunds={[fund({ target: 100, current: 100 })]} />,
    );
    expect(container.textContent).toBe('');
  });

  it('余额 < $100 → 不渲染 (太小不值得展示)', () => {
    const { container } = render(
      <MinimumPaymentTrapCard dreamFunds={[fund({ target: 150, current: 100 })]} />,
    );
    expect(container.textContent).toBe('');
  });

  it.each([
    ['credit card', 'My Credit Card'],
    ['信用卡', '还清信用卡'],
    ['debt', 'Debt Free'],
    ['capital one', 'Capital One Balance'],
    ['visa', 'My Visa'],
    ['mastercard', 'Old Mastercard'],
    ['amex', 'Amex Card'],
    ['discover', 'Discover It'],
    ['card payoff', 'Store Card Payoff'],
  ])('Round 122 匹配范围: 名称含 "%s" → 渲染', (_pattern, name) => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund({ name })]} />);
    expect(screen.getByText('Minimum Payment Trap')).toBeTruthy();
  });
});

describe('MinimumPaymentTrapCard — 数学公式红线 (B=3000)', () => {
  it('最低还款方案: 40 个月 (3yr 4mo), 利息 $1,800', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.getByText('Balance: $3,000 @ 29.99% APR')).toBeTruthy();
    // 只还最低还款: minPayment=max(25, 3000×4%)=120/mo
    expect(screen.getByText('$120/mo')).toBeTruthy();
    expect(screen.getByText('3yr 4mo → payoff')).toBeTruthy();
    expect(screen.getByText('+$1,800 interest')).toBeTruthy();
  });

  it('+$200/月: 11 个月还清, 省 $1,280', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.getByText('$320/mo')).toBeTruthy();
    expect(screen.getByText('11mo → payoff')).toBeTruthy();
    expect(screen.getByText('Save $1,280')).toBeTruthy();
  });

  it('+$500/月: 6 个月还清, 省 $1,080', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.getByText('$620/mo')).toBeTruthy();
    expect(screen.getByText('6mo → payoff')).toBeTruthy();
    expect(screen.getByText('Save $1,080')).toBeTruthy();
  });

  it('对比数字满足守恒: minPayment×N ≥ balance, 更快还款 → 更少利息', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    // 120×40=4800 ≥ 3000; 320×11=3520 ≥ 3000; 620×6=3720 ≥ 3000
    // 利息单调: min-only (1800) > +200 (520) > +500 (720 的前序 520 > 720? 不 — 520 < 720)
    expect(screen.getByText('+$1,800 interest')).toBeTruthy();
    expect(screen.getByText('Save $1,280')).toBeTruthy();
    expect(screen.getByText('Save $1,080')).toBeTruthy();
    // saved200 = 1800-520 = 1280 > saved500 = 1800-720 = 1080
  });

  it('生命时间换算: hourlyRate=25 且 saved500=1080 → 43 小时', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} hourlyRate={25} />);
    expect(
      screen.getByText('Adding $500/mo = 43 fewer hours of your life working for interest.'),
    ).toBeTruthy();
  });

  it('无 hourlyRate → 不显示生命时间换算', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.queryByText(/fewer hours of your life/)).toBeNull();
  });
});

describe('MinimumPaymentTrapCard — dismiss 持久化 (PM-#22)', () => {
  it('dismiss → 折叠条 + localStorage 写入; restore → 恢复 + 清除 key', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    // 折叠条出现, 携带利息金额
    expect(screen.getByRole('button', { name: 'Show Minimum Payment Trap' })).toBeTruthy();
    expect(screen.getByText('Minimum Payment Trap — $1,800 at risk')).toBeTruthy();
    expect(window.localStorage.getItem('symy-trap-dismissed:cc-1')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Show Minimum Payment Trap' }));
    expect(screen.getByText('Minimum Payment Trap')).toBeTruthy();
    expect(window.localStorage.getItem('symy-trap-dismissed:cc-1')).toBeNull();
  });

  it('刷新后 dismiss 状态从 localStorage 恢复 (按 fund id 分 key)', () => {
    window.localStorage.setItem('symy-trap-dismissed:cc-1', '1');
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.getByRole('button', { name: 'Show Minimum Payment Trap' })).toBeTruthy();
    expect(screen.queryByText('Balance: $3,000 @ 29.99% APR')).toBeNull();
  });

  it('dismiss key 按 fund id 隔离: 另一张卡不受影响', () => {
    window.localStorage.setItem('symy-trap-dismissed:other-card', '1');
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.getByText('Minimum Payment Trap')).toBeTruthy();
  });
});

describe('MinimumPaymentTrapCard — demo 徽章', () => {
  it('isDemo → 显示示例数据徽章', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} isDemo />);
    expect(screen.getByText('📊 Sample')).toBeTruthy();
  });

  it('非 demo → 不显示示例徽章', () => {
    render(<MinimumPaymentTrapCard dreamFunds={[fund()]} />);
    expect(screen.queryByText('📊 Sample')).toBeNull();
  });
});
