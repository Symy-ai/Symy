// @vitest-environment happy-dom

/**
 * WeeklyGuardCompareCard 渲染测试 (batch50-c)
 * 周对比卡: 三指标行 + 趋势箭头 + 小象点评档位; 上周无数据走引导态。
 * i18n key 直接从真实 zh/en message 表读取, 保证两侧对齐 (无 defaultValue)。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WeeklyGuardCompareCard } from '../weekly-guard-compare-card';
import { localWeekStart } from '@/lib/weekly-guard-compare';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, setHourlyRate: vi.fn(), isDefaultRate: false }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const table = en.profile as unknown as Record<string, string>;
      let result = table[key.replace(/^profile\./, '')] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

interface Ev {
  eventType: string;
  triggerSource: string;
  triggerId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

let seq = 0;
function ev(
  eventType: 'challenge_completed' | 'challenge_failed' | 'challenge_reward',
  date: Date,
  amount = 25,
): Ev {
  seq += 1;
  return {
    eventType,
    triggerSource: eventType === 'challenge_reward' ? 'deposit_api' : 'chat_mcp',
    triggerId: `${eventType}:${seq}`,
    metadata: eventType === 'challenge_reward' ? { source: 'deposit', amount } : null,
    createdAt: date.toISOString(),
  };
}

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

describe('i18n key alignment', () => {
  const KEYS = [
    'weeklyCompareTitle',
    'weeklyCompareEmpty',
    'weeklyCompareIntercepts',
    'weeklyComparePassRate',
    'weeklyCompareHours',
    'weeklyCompareHoursValue',
    'weeklyCompareTipUp',
    'weeklyCompareTipFlat',
    'weeklyCompareTipDown',
  ] as const;

  it.each(KEYS)('profile.%s exists in both zh and en with no defaultValue', (key) => {
    expect(typeof en.profile[key]).toBe('string');
    expect(typeof zh.profile[key]).toBe('string');
    expect((en.profile[key] as string).length).toBeGreaterThan(0);
    expect((zh.profile[key] as string).length).toBeGreaterThan(0);
  });

  it('decline-tier wording is warm, never accusatory', () => {
    expect(zh.profile.weeklyCompareTipDown).toContain('难熬');
    expect(zh.profile.weeklyCompareTipDown).not.toContain('失败');
    expect(zh.profile.weeklyCompareTipDown).not.toContain('退步');
    expect(en.profile.weeklyCompareTipDown).not.toContain('fail');
  });
});

describe('WeeklyGuardCompareCard', () => {
  it('renders skeleton while loading', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<WeeklyGuardCompareCard />);
    expect(screen.getByTestId('weekly-guard-compare-card-skeleton')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it('no baseline: last week empty → guide state, no metrics/arrows rendered', async () => {
    // 本周二 (相对测试运行当周), 上周留空
    const tuesday = new Date(localWeekStart(new Date()).getTime() + 36 * 3600 * 1000);
    mockEvents([ev('challenge_completed', tuesday), ev('challenge_failed', tuesday)]);
    render(<WeeklyGuardCompareCard />);
    await waitFor(() => expect(screen.getByTestId('weekly-guard-compare-card-empty')).toBeTruthy());
    expect(screen.queryByTestId('weekly-guard-compare-intercepts')).toBeNull();
  });

  it('renders three metric rows with arrows and hours conversion', async () => {
    const monday = localWeekStart(new Date());
    const thisTuesday = new Date(monday.getTime() + 36 * 3600 * 1000);
    const lastTuesday = new Date(monday.getTime() - 7 * 24 * 3600 * 1000 + 36 * 3600 * 1000);
    mockEvents([
      // 本周: 2 局 2 胜, 存 50 → 2h
      ev('challenge_completed', thisTuesday), ev('challenge_completed', thisTuesday),
      ev('challenge_reward', thisTuesday, 50),
      // 上周: 3 局 1 胜, 存 25 → 1h
      ev('challenge_completed', lastTuesday),
      ev('challenge_failed', lastTuesday), ev('challenge_failed', lastTuesday),
      ev('challenge_reward', lastTuesday, 25),
    ]);
    render(<WeeklyGuardCompareCard />);
    await waitFor(() => expect(screen.getByTestId('weekly-guard-compare-card')).toBeTruthy());

    expect(screen.getByTestId('weekly-guard-compare-intercepts').textContent).toContain('2');
    expect(screen.getByTestId('weekly-guard-compare-intercepts').textContent).toContain('3');
    expect(screen.getByTestId('weekly-guard-compare-intercepts-trend').textContent).toBe('↓');
    expect(screen.getByTestId('weekly-guard-compare-passrate').textContent).toContain('100%');
    expect(screen.getByTestId('weekly-guard-compare-passrate-trend').textContent).toBe('↑');
    expect(screen.getByTestId('weekly-guard-compare-hours').textContent).toContain('2');
    expect(screen.getByTestId('weekly-guard-compare-hours-trend').textContent).toBe('↑');
    // 有升有降 → 回落档? 不: up 存在且 down 存在 → down 档文案
    expect(screen.getByTestId('weekly-guard-compare-card-tip').textContent)
      .toBe(en.profile.weeklyCompareTipDown as string);
  });

  it('all-flat week uses steady tip wording', async () => {
    const monday = localWeekStart(new Date());
    const thisTuesday = new Date(monday.getTime() + 36 * 3600 * 1000);
    const lastTuesday = new Date(monday.getTime() - 7 * 24 * 3600 * 1000 + 36 * 3600 * 1000);
    mockEvents([
      ev('challenge_completed', thisTuesday),
      ev('challenge_completed', lastTuesday),
    ]);
    render(<WeeklyGuardCompareCard />);
    await waitFor(() => expect(screen.getByTestId('weekly-guard-compare-card')).toBeTruthy());
    expect(screen.getByTestId('weekly-guard-compare-card-tip').textContent)
      .toBe(en.profile.weeklyCompareTipFlat as string);
    expect(screen.getByTestId('weekly-guard-compare-hours-trend').textContent).toBe('→');
  });
});
