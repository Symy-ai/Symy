// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NightGuardBanner } from '../night-guard-banner';
import { _resetNightWindowStateForTest, setNightWindow } from '@/hooks/use-night-window';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === 'chat.nightGuardBanner'
        ? 'Still up this late? Your elephant is keeping watch — park tonight wants in the wishlist and decide tomorrow'
        : key,
    locale: 'en',
  }),
}));

/** 本地固定时刻事件 (深夜高危分布: 6 深夜 + 2 白天) */
function lateNightDominator() {
  return [22, 23, 0, 1, 2, 23, 12, 13].map((h) => ({
    createdAt: new Date(2026, 5, 15, h).toISOString(),
  }));
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NightGuardBanner', () => {
  it('renders inside the late-night window when late night is the dominant window', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: lateNightDominator() });
    render(<NightGuardBanner now={new Date(2026, 5, 15, 23, 30)} />);
    await waitFor(() => expect(screen.getByTestId('night-guard-banner')).toBeTruthy());
    const text = screen.getByTestId('night-guard-banner').textContent || '';
    expect(text).toContain('wishlist');
    expect(text).not.toMatch(/\$|kg|CO2/i);
  });

  it('renders for the post-midnight half of the window (00:00–05:00)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: lateNightDominator() });
    render(<NightGuardBanner now={new Date(2026, 5, 16, 1, 0)} />);
    await waitFor(() => expect(screen.getByTestId('night-guard-banner')).toBeTruthy());
  });

  it('does not render outside the window even for dominant late-night users', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: lateNightDominator() });
    const { container } = render(<NightGuardBanner now={new Date(2026, 5, 15, 14, 0)} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    // 白天: 不渲染任何横幅
    expect(container.firstChild).toBeNull();
  });

  it('does not render in the window when the top window is not late night', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      events: [12, 13, 14, 12, 13, 12, 13, 12].map((h) => ({
        createdAt: new Date(2026, 5, 15, h).toISOString(),
      })),
    });
    const { container } = render(<NightGuardBanner now={new Date(2026, 5, 15, 23, 0)} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('does not render when data is insufficient or the fetch fails', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: [{ createdAt: new Date(2026, 5, 15, 23).toISOString() }] });
    const a = render(<NightGuardBanner now={new Date(2026, 5, 15, 23, 0)} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(a.container.firstChild).toBeNull();

    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    const b = render(<NightGuardBanner now={new Date(2026, 5, 15, 23, 0)} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(b.container.firstChild).toBeNull();
  });
});

describe('NightGuardBanner × user night-window setting (batch49-a)', () => {
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

  it('never renders when the user chose "off", even dominant + inside the default window', async () => {
    setNightWindow('off');
    vi.mocked(apiFetch).mockResolvedValue({ events: lateNightDominator() });
    const { container } = render(<NightGuardBanner now={new Date(2026, 5, 15, 23, 30)} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  /** 夜猫窗口下深夜主导的事件集 (6 条 0–4 点 + 2 条白天) */
  function nightOwlDominator() {
    return [0, 1, 2, 3, 4, 1, 12, 13].map((h) => ({
      createdAt: new Date(2026, 5, 15, h).toISOString(),
    }));
  }

  /** 早睡窗口 (21–24) 下深夜主导的事件集 (6 条 21–23 点 + 2 条白天) */
  function earlySleeperDominator() {
    return [21, 22, 23, 21, 22, 23, 12, 13].map((h) => ({
      createdAt: new Date(2026, 5, 15, h).toISOString(),
    }));
  }

  it('renders only inside 00:00–05:00 for night-owl users', async () => {
    setNightWindow('nightOwl');
    vi.mocked(apiFetch).mockResolvedValue({ events: nightOwlDominator() });

    // 23:00 不在夜猫窗口 (0–5) → 不渲染
    const before = render(<NightGuardBanner now={new Date(2026, 5, 15, 23, 0)} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(before.container.firstChild).toBeNull();
    cleanup();

    // 01:00 在夜猫窗口 → 渲染
    vi.mocked(apiFetch).mockResolvedValue({ events: nightOwlDominator() });
    render(<NightGuardBanner now={new Date(2026, 5, 16, 1, 0)} />);
    await waitFor(() => expect(screen.getByTestId('night-guard-banner')).toBeTruthy());
    cleanup();
  });

  it('early-sleeper users see the banner at 22:00 (inside 21–24)', async () => {
    setNightWindow('early');
    vi.mocked(apiFetch).mockResolvedValue({ events: earlySleeperDominator() });
    render(<NightGuardBanner now={new Date(2026, 5, 15, 22, 0)} />);
    await waitFor(() => expect(screen.getByTestId('night-guard-banner')).toBeTruthy());
  });
});
