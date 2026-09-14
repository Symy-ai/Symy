// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuardPolicyPreviewSetting } from '../guard-policy-preview-setting';
import {
  _resetGuardIntensityStateForTest,
  getGuardIntensity,
} from '@/hooks/use-guard-intensity';
import { _resetGuardScopeStateForTest } from '@/hooks/use-guard-scope';
import { _resetNightWindowStateForTest } from '@/hooks/use-night-window';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, values?: Record<string, unknown>) => {
      return key
        .replace('{count}', String(values?.count ?? ''))
        .replace('{hours}', String(values?.hours ?? ''))
        .replace('{amount}', String(values?.amount ?? ''));
    },
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 50, rateIsDefault: false, setHourlyRate: vi.fn(), isLoading: false }),
}));

vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async (text: string) => { copiedText.current = text; }) }),
}));

const copiedText = { current: '' };

const now = Date.now();
const event = (daysAgo: number, hour: number, category: string, amount: number, triggerId: string) => {
  const date = new Date(now - daysAgo * 86400000);
  date.setHours(hour, 0, 0, 0);
  return { eventType: 'challenge_completed', triggerId, createdAt: date.toISOString(), metadata: { category, savedAmount: amount } };
};
const events = [
  event(1, 20, 'food', 50, '1'),
  event(2, 23, 'electronics', 50, '2'),
  event(3, 10, 'clothing', 50, '3'),
  event(4, 12, 'food', 50, '4'),
  event(5, 22, 'home', 50, '5'),
];

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  copiedText.current = '';
  window.localStorage.clear();
  _resetGuardIntensityStateForTest();
  _resetGuardScopeStateForTest();
  _resetNightWindowStateForTest();
});

describe('GuardPolicyPreviewSetting', () => {
  it('previews without writing settings before Save', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ events }),
    } as Response);
    render(<GuardPolicyPreviewSetting />);

    await waitFor(() => expect(screen.getByTestId('guard-policy-preview-card').dataset.status).toBe('ok'));
    fireEvent.click(screen.getByTestId('guard-policy-copy'));
    expect(copiedText.current).toContain('5 次');
    expect(copiedText.current).not.toContain('$');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBeNull();
  });

  it('saves only through existing normalized hooks', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ events }),
    } as Response);
    render(<GuardPolicyPreviewSetting />);
    await waitFor(() => expect(screen.getByTestId('guard-policy-preview-card').dataset.status).toBe('ok'));
    fireEvent.click(screen.getByTestId('guard-policy-intensity-chips').children[2]);
    fireEvent.click(screen.getByTestId('guard-policy-save'));

    expect(getGuardIntensity()).toBe('strict');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
  });
});
