// @vitest-environment happy-dom

/**
 * GuardWinRateCard 渲染测试 (batch49-c)
 * 胜率卡: 胜场/streak/金额行; 样本不足显示中性文案而非 0%。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GuardWinRateCard } from '../guard-win-rate-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/lib/format', () => ({
  formatCurrencyShort: (n: number) => `$${Math.round(n)}`,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations: Record<string, string> = {
      'profile.guardWinRateTitle': 'Guard Win Rate',
      'profile.guardWinRateEmpty': 'Play a few more guard rounds',
      'profile.guardWinRateHeadline': 'You won {percent}% of your guards ({wins}/{total} cooled off fully)',
      'profile.guardWinRateTipHigh': 'elephant impressed',
      'profile.guardWinRateTipMid': 'even split is normal',
      'profile.guardWinRateTipLow': 'not failures, practice — another round',
      'profile.guardWinRateStreak': '{days} days of guard wins in a row',
      'profile.guardWinRateAmount': '{amount} guarded across wins (visible only to you)',
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

interface Ev {
  eventType: string;
  triggerSource: string;
  triggerId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

let seq = 0;
function ev(eventType: 'challenge_completed' | 'challenge_failed' | 'challenge_reward', dayOffsetAgo = 0): Ev {
  seq += 1;
  return {
    eventType,
    triggerSource: eventType === 'challenge_reward' ? 'deposit_api' : 'chat_mcp',
    triggerId: `${eventType}:${seq}`,
    metadata: eventType === 'challenge_reward' ? { source: 'deposit', fundId: 's', amount: 40 } : null,
    createdAt: new Date(2026, 8, 8 - dayOffsetAgo, 10).toISOString(),
  };
}

/** apiFetch 按 event_type 参数分桶返回 */
function mockEvents(events: Ev[]) {
  vi.mocked(apiFetch).mockImplementation((url: string | URL) => {
    const u = new URL(String(url), 'http://localhost');
    const type = u.searchParams.get('event_type') || '';
    return Promise.resolve({ events: events.filter((e) => e.eventType === type) });
  });
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GuardWinRateCard', () => {
  it('renders skeleton while loading', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<GuardWinRateCard />);
    expect(screen.getByTestId('guard-win-rate-card-skeleton')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it('renders win percent, wins, streak highlight and in-app amount line', async () => {
    mockEvents([
      ev('challenge_completed'), ev('challenge_completed'), ev('challenge_completed'), ev('challenge_completed'),
      ev('challenge_failed'),
      ev('challenge_reward'), ev('challenge_reward'),
    ]);
    render(<GuardWinRateCard />);
    await waitFor(() => expect(screen.getByTestId('guard-win-rate-card')).toBeTruthy());

    expect(screen.getByTestId('guard-win-rate-card-headline').textContent).toContain('80%');
    expect(screen.getByTestId('guard-win-rate-card-headline').textContent).toContain('4/5');
    expect(screen.getByTestId('guard-win-rate-card-tip').textContent).toContain('elephant impressed');
    expect(screen.getByTestId('guard-win-rate-card-amount').textContent).toContain('$80');
    // 所有事件在同一天且有 1 败 → streak = 0, 亮点行不渲染
    expect(screen.queryByTestId('guard-win-rate-card-streak')).toBeNull();
  });

  it('renders streak line for consecutive clean win days', async () => {
    mockEvents([
      ev('challenge_completed', 0), ev('challenge_completed', 1), ev('challenge_completed', 2),
      ev('challenge_failed', 2), ev('challenge_failed', 2),
    ]);
    render(<GuardWinRateCard />);
    await waitFor(() => expect(screen.getByTestId('guard-win-rate-card')).toBeTruthy());
    expect(screen.getByTestId('guard-win-rate-card-streak').textContent).toContain('2');
    // 低胜率 (3/5=60%? 3/5=.6 → mid) — mid tip
    expect(screen.getByTestId('guard-win-rate-card-tip').textContent).toContain('even split is normal');
  });

  it('low win rate uses encouraging tone, never shame wording', async () => {
    mockEvents([
      ev('challenge_completed'),
      ev('challenge_failed'), ev('challenge_failed'), ev('challenge_failed'), ev('challenge_failed'),
    ]);
    render(<GuardWinRateCard />);
    await waitFor(() => expect(screen.getByTestId('guard-win-rate-card')).toBeTruthy());
    expect(screen.getByTestId('guard-win-rate-card-tip').textContent).toContain('not failures, practice');
  });

  it('insufficient sample shows neutral copy, no percent', async () => {
    mockEvents([ev('challenge_completed'), ev('challenge_failed')]);
    render(<GuardWinRateCard />);
    await waitFor(() => expect(screen.getByTestId('guard-win-rate-card-empty')).toBeTruthy());
    expect(screen.queryByTestId('guard-win-rate-card-headline')).toBeNull();
    expect(screen.getByText('Play a few more guard rounds')).toBeTruthy();
  });

  it('degrades silently to empty state when the endpoint fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    render(<GuardWinRateCard />);
    await waitFor(() => expect(screen.getByTestId('guard-win-rate-card-empty')).toBeTruthy());
  });
});
