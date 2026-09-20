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
      if (key === 'profile.guardPolicyMetricEvents') return `${values?.count ?? ''} 次`;
      if (key === 'profile.guardPolicyMetricCategories') return `${values?.count ?? ''} 个品类`;
      if (key === 'profile.guardPolicyMetricHours') return `${values?.hours ?? ''} guarded hours`;
      if (key === 'profile.guardPolicyDisturbance') return `${values?.count ?? ''} 天`;
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
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn((text: string) => { copiedText.current = text; return Promise.resolve(true); }) }),
}));

const copiedText = { current: '' };

const now = Date.now();
const event = (daysAgo: number, hour: number, category: string, triggerId: string) => {
  const date = new Date(now - daysAgo * 86400000);
  date.setHours(hour, 0, 0, 0);
  return { eventType: 'challenge_completed', triggerId, createdAt: date.toISOString(), metadata: { category, savedAmount: 50 } };
};
const events = [
  event(1, 20, 'food', '1'),
  event(2, 23, 'electronics', '2'),
  event(3, 10, 'clothing', '3'),
  event(4, 12, 'food', '4'),
  event(5, 22, 'home', '5'),
  event(7, 18, 'clothing', '6'),
  event(8, 20, 'food', '7'),
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
      json: () => Promise.resolve({ events }),
    } as Response);
    render(<GuardPolicyPreviewSetting />);

    await waitFor(() => expect(screen.getByTestId('guard-policy-preview-card').dataset.status).toBe('ok'));
    fireEvent.click(screen.getByTestId('guard-policy-copy'));
    expect(copiedText.current).toContain('7 次');
    expect(copiedText.current).not.toContain('$');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBeNull();
  });

  it('saves only through existing normalized hooks', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ events }),
    } as Response);
    render(<GuardPolicyPreviewSetting />);
    await waitFor(() => expect(screen.getByTestId('guard-policy-preview-card').dataset.status).toBe('ok'));
    fireEvent.click(screen.getByTestId('guard-policy-intensity-chips').children[2]);
    fireEvent.click(screen.getByTestId('guard-policy-save'));

    expect(getGuardIntensity()).toBe('strict');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
  });

  it('keeps preview sensitive to candidate, stored scope, and night settings', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(input).includes('/api/push/preferences') ? undefined : { events }),
      } as Response));

    window.localStorage.setItem(
      'symy-guard-scope',
      JSON.stringify({ clothing: 'exempt' }),
    );
    window.localStorage.setItem('symy-night-window', 'standard');
    render(<GuardPolicyPreviewSetting />);

    await waitFor(() => expect(screen.getByTestId('guard-policy-preview-card').dataset.status).toBe('ok'));
    expect(screen.getByTestId('guard-policy-metrics').textContent).toContain('5 次');
    expect(screen.getByTestId('guard-policy-metrics').textContent).toContain('3 个品类');
    expect(screen.getByTestId('guard-policy-disturbance').textContent).toContain('0 天');

    fireEvent.click(screen.getByTestId('guard-policy-scope-chips').children[1]);
    fireEvent.click(screen.getByTestId('guard-policy-copy'));
    expect(copiedText.current).toContain('7 次');
    expect(copiedText.current).toContain('4 个品类');

    fireEvent.click(screen.getByTestId('guard-policy-scope-chips').children[2]);
    fireEvent.click(screen.getByTestId('guard-policy-copy'));
    expect(copiedText.current).toContain('5 次');
    expect(copiedText.current).toContain('3 个品类');
    expect(copiedText.current).toContain('2 天');

    fireEvent.click(screen.getByTestId('guard-policy-save'));
    expect(getGuardIntensity()).toBe('balanced');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('balanced');
    const savedScope = JSON.parse(window.localStorage.getItem('symy-guard-scope') ?? '{}');
    expect(savedScope.food).toBe('strict');
    expect(savedScope.electronics).toBe('strict');
    expect(savedScope.clothing).toBe('exempt');
    expect(savedScope.home).toBe('strict');
    expect(savedScope.beauty).toBe('guard');
  });
});
