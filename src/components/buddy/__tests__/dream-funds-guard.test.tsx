/**
 * DreamFundsSection 守护转存构成拆线 + 守护目标 tests (batch6-b)
 *
 * 覆盖:
 *  - 拦截结算 (deposit 审计记录) 后, 目标基金卡出现"其中守护攒下 X"行, 金额与结算额一致
 *  - 无守护数据的基金不显示守护攒下行 (荣誉非羞辱, 不出 0 行)
 *  - 守护目标徽章默认落在 Savings; 展开卡可换目标 (localStorage 持久化)
 *  - demo 模式不拉取审计记录、不出守护 UI
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DreamFundsSection } from '../dream-funds-section';
import type { DreamFund } from '@/types/buddy-state';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// formatCurrency 桩 — 确定性 "$46.80" / "$47"
vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number, opts?: { decimals?: boolean }) =>
    opts?.decimals === false
      ? `$${Math.round(amount).toLocaleString('en-US')}`
      : `$${Number(amount).toFixed(2)}`,
}));

// i18n 桩 — 关键 key 用真实文案语义, 其余原样返回
const DICT: Record<string, string> = {
  'buddy.dreamFundSavings': 'Savings',
  'buddy.dreamFund.guardSavedLine': '🛡️ {amount} of this came from your guards',
  'buddy.dreamFund.guardTargetBadge': 'Guard target',
  'buddy.dreamFund.guardTargetSet': '🛡️ Set as guard target',
  'buddy.dreamFund.guardTargetSetAria': 'Set as the guard target fund',
  'buddy.dreamFund.guardTargetActiveHint': 'Money your guards save lands here first.',
  'buddy.dreamFund.guardTargetSaved': 'Guard target set 🛡️',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const tpl = DICT[key] ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl
      );
    },
  }),
}));

function makeFund(overrides: Partial<DreamFund> = {}): DreamFund {
  return { id: 'df-1', name: 'Credit Card Payoff', target: 2000, current: 0, emoji: '💳', sortOrder: 0, ...overrides };
}

function makeFunds(): DreamFund[] {
  return [
    makeFund(),
    makeFund({ id: 'df-2', name: 'Iceland Trip', target: 5000, current: 100, emoji: '🏔️', sortOrder: 1 }),
    makeFund({ id: SAVINGS_FUND_ID, name: 'Savings', target: 2147483647, current: 50, emoji: '🏦', sortOrder: 2 }),
  ];
}

/** 一次拦截结算 (deposit 46.80 → df-1) 的审计记录 */
const SETTLEMENT_EVENTS = {
  events: [
    {
      id: 'evt-1',
      eventType: 'challenge_reward',
      triggerSource: 'deposit_api',
      triggerId: 'deposit:user-1:ch-1:df-1:46.8',
      description: '',
      metadata: { source: 'deposit', fundId: 'df-1', fundName: 'Credit Card Payoff', amount: 46.8 },
      createdAt: '2026-09-01T10:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue(SETTLEMENT_EVENTS);
});

describe('DreamFundsSection — 守护构成拆线', () => {
  it('拦截结算后目标基金卡出现"守护攒下"行, 金额等于结算额; 无守护数据的基金不显示该行', async () => {
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-saved-line-df-1')).toBeTruthy();
    });
    expect(screen.getByTestId('guard-saved-line-df-1').textContent).toContain('$46.80');
    // df-2 / Savings 无守护数据 → 不渲染拆线 (不出 0)
    expect(screen.queryByTestId('guard-saved-line-df-2')).toBeNull();
    expect(screen.queryByTestId(`guard-saved-line-${SAVINGS_FUND_ID}`)).toBeNull();
    // 审计管道 URL 过滤 challenge_reward
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/buddy/health-events?event_type=challenge_reward')
    );
  });

  it('审计记录拉取失败时基金列表照常渲染 (非关键区块静默为空)', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo={false} />);
    expect(screen.getByText('Credit Card Payoff')).toBeTruthy();
    // 等待 rejection 被吞掉
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('guard-saved-line-df-1')).toBeNull();
  });
});

describe('DreamFundsSection — 守护目标基金', () => {
  it('默认守护目标是 Savings; 展开卡可换目标并持久化到 localStorage', async () => {
    const onToast = vi.fn();
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={onToast} />);

    await waitFor(() => expect(screen.getByTestId(`guard-target-badge-${SAVINGS_FUND_ID}`)).toBeTruthy());

    // 展开.df-1
    fireEvent.click(screen.getByTestId('guard-saved-line-df-1').closest('[data-fund-id]') as HTMLElement);
    const setBtn = await screen.findByRole('button', { name: 'Set as the guard target fund' });
    fireEvent.click(setBtn);

    // 徽章迁移 + localStorage 持久化 + 正向 toast
    await waitFor(() => expect(screen.getByTestId('guard-target-badge-df-1')).toBeTruthy());
    expect(window.localStorage.getItem('symy-buddy-guard-target-fund')).toBe('df-1');
    expect(onToast).toHaveBeenCalledWith('Guard target set 🛡️', 'success');
    // 展开卡显示守护目标正面期待文案
    expect(screen.getByTestId(`guard-target-active-df-1`).textContent).toContain('Money your guards save lands here first.');
  });

  it('demo 模式不拉取审计记录, 不出守护 UI', () => {
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo />);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`guard-target-badge-${SAVINGS_FUND_ID}`)).toBeNull();
  });
});
