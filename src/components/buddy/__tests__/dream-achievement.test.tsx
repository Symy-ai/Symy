// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DreamFundsSection } from '../dream-funds-section';
import { DreamCard } from '../../share/dream-card';
import { getShareTemplate, type ShareTemplateRenderProps } from '../../share/card-templates';
import { dreamAchievementKey } from '../dream-achievement';
import type { DreamFund } from '@/types/buddy-state';

const shareSpy = vi.fn();
vi.mock('@/components/share/share-modal', () => ({
  ShareModal: (props: Record<string, unknown>) => {
    shareSpy(props);
    return null;
  },
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = params?.defaultValue ?? key;
      if (params) for (const [k, v] of Object.entries(params)) if (k !== 'defaultValue') result = result.replaceAll(`{${k}}`, String(v));
      return result;
    },
    locale: 'en',
  }),
}));
vi.mock('@/lib/guard-ledger', () => ({
  fetchGuardTransfers: vi.fn().mockResolvedValue([]),
  guardSavedByFund: vi.fn().mockReturnValue({}),
  getGuardTargetFundId: vi.fn().mockReturnValue('savings'),
  setGuardTargetFundId: vi.fn(),
}));
vi.mock('@/lib/format', () => ({ formatCurrency: (amount: number) => `$${amount.toFixed(0)}` }));

function fund(overrides: Partial<DreamFund> = {}): DreamFund {
  return { id: 'df-1', name: 'Guitar', target: 100000, current: 0, emoji: '🎸', ...overrides };
}

describe('dream achievement', () => {
  beforeEach(() => {
    window.localStorage.clear();
    shareSpy.mockClear();
  });

  it('creates a baseline without retroactive celebration', () => {
    render(<DreamFundsSection dreamFunds={[fund({ current: 100000 })]} isDemo />);
    expect(screen.queryByTestId('dream-achievement-overlay')).toBeNull();
    expect(window.localStorage.getItem(dreamAchievementKey('df-1'))).toBe('1');
  });

  it('celebrates once and can celebrate again after a new goal reset', async () => {
    const { rerender } = render(<DreamFundsSection dreamFunds={[fund()]} isDemo={false} />);
    rerender(<DreamFundsSection dreamFunds={[fund({ current: 100000 })]} isDemo={false} />);
    expect(screen.getByTestId('dream-achievement-overlay')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dream-achievement-close'));
    rerender(<DreamFundsSection dreamFunds={[fund({ current: 100010 })]} isDemo={false} />);
    expect(screen.queryByTestId('dream-achievement-overlay')).toBeNull();

    fireEvent.click(screen.getByText('Set a new goal →'));
    const targetInput = await screen.findByDisplayValue('100000');
    fireEvent.change(targetInput, { target: { value: '120001' } });
    fireEvent.click(screen.getByText('buddy.dreamFundSave'));
    expect(window.localStorage.getItem(dreamAchievementKey('df-1'))).toBeNull();

    rerender(<DreamFundsSection dreamFunds={[fund({ target: 120001, current: 120000 })]} isDemo={false} />);
    rerender(<DreamFundsSection dreamFunds={[fund({ target: 120001, current: 120001 })]} isDemo={false} />);
    expect(screen.getByTestId('dream-achievement-overlay')).toBeTruthy();
  });

  it('never celebrates savings and claims only the largest same-tick winner', () => {
    const savings = fund({ id: 'df-savings', name: 'Savings', current: 100, target: 100 });
    const small = fund({ id: 'small', name: 'Book', current: 200, target: 200 });
    const large = fund({ id: 'large', name: 'Trip', current: 900, target: 900 });
    const { rerender } = render(
      <DreamFundsSection
        dreamFunds={[savings, fund({ id: 'small', name: 'Book', target: 200 }), fund({ id: 'large', name: 'Trip', target: 900 })]}
        isDemo
      />
    );
    rerender(<DreamFundsSection dreamFunds={[savings, small, large]} isDemo />);
    expect(screen.getByTestId('dream-achievement-fund').textContent).toBe('Trip');
    expect(window.localStorage.getItem(dreamAchievementKey('small'))).toBe('1');
    expect(window.localStorage.getItem(dreamAchievementKey('large'))).toBe('1');
  });

});

describe('dream share card', () => {
  beforeEach(() => window.localStorage.clear());

  it('renders dream fields without money symbols', () => {
    const props: ShareTemplateRenderProps = {
      medal: { itemTitle: 'Guitar', savedCents: 100000, date: '2026-09-06T00:00:00Z' },
      streakDays: 12,
      interceptCount: 3,
      savedHours: 50,
      dreamFund: { name: 'Guitar', savedCents: 100000, streakDays: 12 },
    };
    const card = getShareTemplate('dream').render(props);
    expect(card).toBeTruthy();
    render(<DreamCard name="Guitar" savedHours={50} streakDays={12} />);
    expect(screen.getByTestId('dream-card-name').textContent).toBe('Guitar');
    expect(screen.getByTestId('dream-card-hours').textContent).toContain('50');
    expect(document.body.textContent).not.toMatch(/[$¥€]/);
  });
});
