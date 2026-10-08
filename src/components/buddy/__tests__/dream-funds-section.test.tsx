// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DreamFundsSection } from '../dream-funds-section';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';
import type { DreamFund } from '@/types/buddy-state';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'ahaMoment.sampleDataLabel': '📊 示例',
        'buddy.dreamFunds': 'Dream Funds',
        'buddy.dreamFundSavings': 'Savings',
        'buddy.moneySavedFliesHere': 'Money saved flies here',
        'buddy.dreamFundAdd': 'Add fund',
        'buddy.dreamFundEdit': 'Edit fund',
        'buddy.dreamFundDelete': 'Delete fund',
        'buddy.dreamFundDeleted': 'Fund deleted',
        'buddy.dreamFundDeleteConfirm': 'Delete this fund?',
        'buddy.dreamFundDeleteConfirmWithProgress': `Delete this fund with ${String(params?.amount ?? '')}?`,
        'buddy.dreamFundHistoryTitle': 'Fill history',
        'buddy.dreamFundHistoryEmpty': 'No fill history yet',
        'common.loading': 'Loading...',
      };
      return translations[key] ?? key;
    },
  }),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number, opts?: { decimals?: boolean }) =>
    opts?.decimals === false
      ? `$${Math.round(amount).toLocaleString('en-US')}`
      : `$${amount.toFixed(2)}`,
}));

vi.mock('@/lib/guard-ledger', () => ({
  fetchGuardTransfers: vi.fn().mockResolvedValue([]),
  guardSavedByFund: vi.fn().mockReturnValue({}),
  getGuardTargetFundId: vi.fn().mockReturnValue('df-savings'),
  setGuardTargetFundId: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('../dream-fund-editor', () => ({
  DreamFundEditor: vi.fn((props: { open: boolean; mode: string; editingFund: DreamFund | null }) =>
    props.open ? (
      <div data-testid="fund-editor">
        {props.mode}:{props.editingFund?.name ?? 'new'}
      </div>
    ) : null
  ),
}));

vi.mock('../dream-achievement-overlay', () => ({
  DreamAchievementOverlay: () => null,
}));

const makeFund = (overrides: Partial<DreamFund> = {}): DreamFund => ({
  id: 'fund-1',
  name: 'Japan Trip',
  target: 2000,
  current: 500,
  emoji: '✈️',
  sortOrder: 0,
  ...overrides,
});

const makeFunds = (): DreamFund[] => [
  makeFund(),
  makeFund({ id: 'fund-2', name: 'Home', target: 50000, current: 1200, emoji: '🏠', sortOrder: 1 }),
  makeFund({ id: SAVINGS_FUND_ID, name: 'Other savings', target: 2147483647, current: 98765, emoji: '🏦', sortOrder: 2 }),
];

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(apiFetchMock).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DreamFundsSection', () => {
  it('renders all funds, aggregate balance, and progress width', () => {
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo />);

    expect(screen.getByText('Dream Funds')).toBeTruthy();
    expect(screen.getByText(/\$100,465/)).toBeTruthy();
    expect(screen.getByText('Japan Trip')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.getByText('$500 / $2,000')).toBeTruthy();
    expect(screen.getByText('$98,765')).toBeTruthy();
    expect(screen.getByText('/ ∞')).toBeTruthy();
    expect(document.querySelector('[data-fund-id="fund-1"] [style*="width: 25%"]')).toBeTruthy();
  });

  it('renders an empty fund list with the aggregate still showing zero', () => {
    render(<DreamFundsSection dreamFunds={[]} isDemo />);

    expect(screen.getByText('Dream Funds')).toBeTruthy();
    expect(screen.getByText(/\$0/)).toBeTruthy();
    expect(screen.queryByTestId('fund-1')).toBeNull();
  });

  it('marks demo mode and hides management actions', () => {
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo />);

    expect(screen.getByText('📊 示例')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add fund' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit fund' })).toBeNull();
  });

  it('opens the editor in create mode from the add button', () => {
    render(<DreamFundsSection dreamFunds={[]} isDemo={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add fund' }));

    expect(screen.getByTestId('fund-editor').textContent).toBe('create:new');
  });

  it('opens the editor in edit mode for the selected fund', () => {
    render(<DreamFundsSection dreamFunds={makeFunds()} isDemo={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit fund' })[1]);

    expect(screen.getByTestId('fund-editor').textContent).toBe('edit:Home');
  });

  it('deletes a fund only after confirmation and emits a toast', () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const onDeleteDreamFund = vi.fn();
    const onToast = vi.fn();
    render(
      <DreamFundsSection
        dreamFunds={[makeFund(), makeFund({ id: 'fund-2', name: 'Home' })]}
        isDemo={false}
        onDeleteDreamFund={onDeleteDreamFund}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete fund' })[0]);

    expect(confirmSpy).toHaveBeenCalledWith('Delete this fund with 500?');
    expect(onDeleteDreamFund).toHaveBeenCalledWith('fund-1');
    expect(onToast).toHaveBeenCalledWith('Fund deleted', 'info');
    vi.unstubAllGlobals();
  });

  it('loads expanded history with formatted amounts and dates', async () => {
    vi.mocked(apiFetchMock).mockResolvedValue({
      history: [
        {
          id: 'history-1',
          amount: 123.4,
          description: 'Skipped Mechanical Keyboard',
          createdAt: '2026-04-05T12:00:00.000Z',
          eventType: 'challenge_reward',
          triggerSource: 'deposit_api',
        },
      ],
    });
    render(<DreamFundsSection dreamFunds={[makeFund()]} isDemo={false} />);

    fireEvent.click(screen.getByText('Japan Trip'));

    expect(await screen.findByText('Skipped Mechanical Keyboard')).toBeTruthy();
    expect(screen.getByText('+$123.40')).toBeTruthy();
    expect(screen.getByText(/Apr 5/)).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/buddy/dream-funds/fund-1/history',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('falls back to empty history when loading fails', async () => {
    vi.mocked(apiFetchMock).mockRejectedValue(new Error('network down'));
    render(<DreamFundsSection dreamFunds={[makeFund()]} isDemo={false} />);

    fireEvent.click(screen.getByText('Japan Trip'));

    expect(await screen.findByText('No fill history yet')).toBeTruthy();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
  });
});
