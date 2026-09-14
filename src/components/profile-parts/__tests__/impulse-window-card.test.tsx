// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ImpulseWindowCard } from '../impulse-window-card';
import { _resetNightWindowStateForTest, setNightWindow } from '@/hooks/use-night-window';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations: Record<string, string> = {
      'profile.impulseWindowTitle': 'Your Danger Window',
      'profile.impulseWindowEmpty': 'Guard a few more times to reveal your impulse-prone hours',
      'profile.impulseWindowHeadline': '{percent}% of your guards happen in the {window}',
      'profile.impulseWindowName.dawn': 'early morning',
      'profile.impulseWindowName.daytime': 'daytime',
      'profile.impulseWindowName.evening': 'evening',
      'profile.impulseWindowName.lateNight': 'late night',
      'profile.impulseWindowTip.lateNight': 'One rule: no shopping apps before bed',
      'profile.impulseWindowTipBalanced': 'No clear hotspot — pause three seconds on any urge',
      'profile.impulseWindowActiveWindow': 'Active window: {window}',
      'profile.impulseWindowOffNote': 'Late-night banner is off; stats keep recording',
      'profile.nightWindowName.early': 'early sleeper',
      'profile.nightWindowName.standard': 'standard',
      'profile.nightWindowName.nightOwl': 'night owl',
    };
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale: 'en',
    };
  },
}));

/** 本地固定时刻事件, 避免 UTC 炸弹 */
function eventsAt(hours: number[]) {
  return hours.map((h) => ({ createdAt: new Date(2026, 5, 15, h).toISOString() }));
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ImpulseWindowCard', () => {
  it('renders skeleton while loading', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<ImpulseWindowCard />);
    expect(screen.getByTestId('impulse-window-card-skeleton')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it('renders late-night headline with percent and actionable tip, no money or carbon figures', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: eventsAt([22, 23, 0, 1, 2, 23, 12, 13]) });
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card')).toBeTruthy());

    expect(screen.getByTestId('impulse-window-card-headline').textContent).toContain('75%');
    expect(screen.getByTestId('impulse-window-card-headline').textContent).toContain('late night');
    expect(screen.getByTestId('impulse-window-card-tip').textContent).toContain('no shopping apps before bed');

    const text = document.body.textContent || '';
    expect(text).not.toMatch(/\$|\d+(\.\d+)?\s*(kg|tCO₂|CO2)/i);
  });

  it('uniform distribution uses the non-exaggerated balanced tip', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: eventsAt([2, 2, 12, 12, 18, 18, 8, 8]) });
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card')).toBeTruthy());
    expect(screen.getByTestId('impulse-window-card-tip').textContent).toContain('No clear hotspot');
  });

  it('shows insufficient state below the sample threshold, no fake insight', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: eventsAt([23, 23, 23]) });
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card-empty')).toBeTruthy());
    expect(screen.queryByTestId('impulse-window-card-headline')).toBeNull();
    expect(screen.getByText('Guard a few more times to reveal your impulse-prone hours')).toBeTruthy();
  });

  it('degrades silently to empty state when the endpoint fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card-empty')).toBeTruthy());
  });
});

describe('ImpulseWindowCard × user night-window setting (batch49-a)', () => {
  beforeEach(() => {
    _resetNightWindowStateForTest();
    window.localStorage.clear();
  });

  afterEach(() => {
    _resetNightWindowStateForTest();
    window.localStorage.clear();
    vi.clearAllMocks();
    cleanup();
  });

  it('shows the active window line for night-owl users, with the range label', async () => {
    setNightWindow('nightOwl');
    vi.mocked(apiFetch).mockResolvedValue({ events: eventsAt([0, 1, 2, 3, 4, 12, 12, 13]) });
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card')).toBeTruthy());
    const line = screen.getByTestId('impulse-window-card-active-window');
    expect(line.textContent).toContain('night owl');
    expect(line.textContent).toContain('00:00–05:00');
    expect(line.textContent).not.toMatch(/\$|CO2/i);
  });

  it('shows a transparency note (not a window name) when the banner is off', async () => {
    setNightWindow('off');
    vi.mocked(apiFetch).mockResolvedValue({ events: eventsAt([23]) });
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card-empty')).toBeTruthy());
    expect(screen.getByTestId('impulse-window-card-active-window').textContent).toContain('stats keep recording');
  });

  it('hides the line entirely on the default standard preset (baseline unchanged)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: eventsAt([22, 23, 0, 1, 2, 23, 12, 13]) });
    render(<ImpulseWindowCard />);
    await waitFor(() => expect(screen.getByTestId('impulse-window-card')).toBeTruthy());
    expect(screen.queryByTestId('impulse-window-card-active-window')).toBeNull();
  });
});
