// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SymyLedger } from '../symy-ledger';
import type { BuddyState } from '@/types/buddy-state';

const apiFetchMock = vi.hoisted(() => vi.fn());
const shareCardSpy = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, setHourlyRate: vi.fn() }),
}));

vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number, opts?: { decimals?: boolean }) =>
    opts?.decimals === false
      ? `$${Math.round(amount).toLocaleString('en-US')}`
      : `$${amount.toFixed(2)}`,
}));

vi.mock('@/lib/guard-ledger', () => ({
  fetchGuardTransfers: fetchGuardTransfersMock,
  guardTransfersTotal: vi.fn((entries: Array<{ amount: number }>) =>
    entries.reduce((total, entry) => total + entry.amount, 0)),
}));

const fetchGuardTransfersMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../share-card-modal', () => ({
  ShareCardModal: (props: Record<string, unknown>) => {
    shareCardSpy(props);
    return <div data-testid="share-card-modal" />;
  },
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'buddy.symyLedger': 'Symy Ledger',
        'buddy.dayStreak': `${String(params?.n ?? '')}-day streak`,
        'buddy.streakTooltip': 'Daily check-in keeps your streak alive.',
    'buddy.yourBalance': 'Won-back time',
        'buddy.viewDreamFunds': 'View Dream Funds →',
        'buddy.shareProgress': 'Share my progress',
        'home.moneySavedDetailBody': 'These are hours you won back.',
        'ahaMoment.sampleDataLabel': '📊 示例',
        'common.gotIt': 'Got it',
        'home.moneySavedDetail': 'Time represented by money you did not spend.',
      };
      return translations[key] ?? key;
    },
  }),
}));

const makeState = (overrides: Partial<BuddyState> = {}): BuddyState => ({
  vitality: 80,
  tokens: 10,
  health: 'healthy',
  level: 3,
  xp: 40,
  xpToNext: 100,
  streak: 7,
  dreamFunds: [{ id: 'fund-1', name: 'Camera', target: 1000, current: 500, emoji: '📷' }],
  badges: [],
  totalSaved: 500,
  challengesCompleted: 1,
  lastHealingKitAt: null,
  version: 1,
  growthStage: 'young',
  personality: 'unknown',
  intimacy: 10,
  dailyNeeds: { clarity: 50, connection: 50 },
  proactiveMessages: [],
  personalityAwakenedAt: null,
  lastActiveAt: null,
  ...overrides,
});

const renderLedger = (props: Partial<Parameters<typeof SymyLedger>[0]> = {}) =>
  render(
    <SymyLedger
      buddyState={makeState()}
      config={{ color: '#000', neonGradient: 'g' }}
      isDemo={false}
      {...props}
    />,
  );

beforeEach(() => {
  window.localStorage.clear();
  fetchGuardTransfersMock.mockReset().mockResolvedValue([]);
  apiFetchMock.mockReset();
  shareCardSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('SymyLedger', () => {
  it('renders the primary ledger rows and calculates won-back hours', async () => {
    renderLedger();

    expect(screen.getByText('Symy Ledger')).toBeTruthy();
    expect(screen.getByText('7-day streak')).toBeTruthy();
    expect(screen.getByText('Won-back time')).toBeTruthy();
    expect(screen.getByText('20h')).toBeTruthy();
    await waitFor(() => expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/chat/history')));
  });

  it('formats thousands of won-back hours with grouping', () => {
    renderLedger({
      buddyState: makeState({
        dreamFunds: [{ id: 'fund-1', name: 'Home', target: 1000, current: 2500000, emoji: '🏠' }],
      }),
    });

    expect(screen.getByText('100,000h')).toBeTruthy();
  });

  it('shows an empty guard ledger without a zero block', async () => {
    renderLedger();

    await waitFor(() => expect(vi.mocked(fetchGuardTransfersMock)).toHaveBeenCalled());
    expect(screen.queryByTestId('guard-transfer-block')).toBeNull();
  });

  it('marks demo data and hides sharing', () => {
    renderLedger({ isDemo: true });

    expect(screen.getByText('📊 示例')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Share my progress/ })).toBeNull();
    expect(fetchGuardTransfersMock).not.toHaveBeenCalled();
  });

  it('opens and closes the streak tooltip through keyboard and backdrop', () => {
    renderLedger();
    const trigger = screen.getByRole('button', { name: /7-day streak/ });

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByText('Daily check-in keeps your streak alive.')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Daily check-in keeps your streak alive.')).toBeNull();
  });

  it('opens the reclaim detail overlay and invokes the dream funds callback', () => {
    const onSetRate = vi.fn();
    renderLedger({ onSetRate });

    fireEvent.click(screen.getByRole('button', { name: /Time represented by money/ }));
    expect(screen.getByText(/Time represented by money you did not spend/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'View Dream Funds →' })[1]);
    expect(onSetRate).toHaveBeenCalledTimes(1);
  });

  it('shares only after a completed challenge and forwards a scrubbed quote', async () => {
    apiFetchMock.mockResolvedValue({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'You resisted the shiny lens. That choice protects your future.' },
      ],
    });
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: /Share my progress/ }));

    await waitFor(() => expect(screen.getByTestId('share-card-modal')).toBeTruthy());
    expect(apiFetchMock).toHaveBeenCalledWith('/api/chat/history?limit=50&mode=challenge');
    expect(shareCardSpy).toHaveBeenCalledWith(expect.objectContaining({
      aiQuote: 'You resisted the shiny lens. That choice protects your future.',
    }));
  });
});
