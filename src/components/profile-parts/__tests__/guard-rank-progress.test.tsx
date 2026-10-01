// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GuardRankProgressSection } from '../guard-rank-progress-section';
import { GUARD_RANKS } from '@/lib/guard-rank';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ challengesCompleted: 10, totalSaved: 200 })),
}));

import { apiFetch } from '@/lib/api-client';

const translations: Record<string, string> = {
  'profile.guardRankProgress.title': 'Guardian path',
  'profile.guardRankProgress.channelIntercepts': 'Guards',
  'profile.guardRankProgress.channelDays': 'Days',
  'profile.guardRankProgress.channelBadges': 'Marks',
  'profile.guardRankProgress.anchorLine': 'Each guard ≈ {avgHours} · {remainingGuards} more ≈ {totalHours}',
  'profile.guardRankProgress.highestRankTribute': 'Highest guardian rank achieved — honor, not shame.',
  'profile.guardRank.honoree': 'Honored Guardian Officer',
  'buddy.growthStage.baby': 'Baby Elephant',
  'buddy.growthStage.young': 'Young Elephant',
  'buddy.growthStage.adult': 'Adult Elephant',
  'buddy.growthStage.elder': 'Guardian Elder',
};

const useI18nMock = vi.fn((): { t: (key: string, params?: Record<string, unknown>) => string; locale: 'en' | 'zh'; setLocale: () => void } => ({
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
  setLocale: () => {},
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: vi.fn(),
}));

import { useI18n } from '@/i18n/provider';
vi.mocked(useI18n).mockImplementation(useI18nMock);

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25 }),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GuardRankProgressSection', () => {
  it('renders ring SVG and highlights the primary channel', async () => {
    render(<GuardRankProgressSection totalIntercepts={10} streakDays={31} badgesUnlocked={7} />);
    const root = await waitFor(() => screen.getByTestId('guard-rank-progress-section'));
    expect(root.querySelector('svg')).toBeTruthy();
    expect(root.querySelector('circle[stroke="#4ade80"]')).toBeTruthy();
    expect(root.querySelector('text')?.textContent).toBeTruthy();
  });

  it('renders final honoree tribute state without progress ring', async () => {
    render(
      <GuardRankProgressSection
        totalIntercepts={200}
        streakDays={400}
        badgesUnlocked={20}
        rank={GUARD_RANKS[GUARD_RANKS.length - 1]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('guard-rank-progress-section').textContent).toContain('Highest guardian rank achieved');
    });
    expect(screen.queryByTestId('guard-rank-progress-section')?.querySelector('svg')).toBeNull();
    // 回归 (batch73-b): 终局态曾直出 rank.nameKey 裸键名, 必须显示翻译后的段位名
    const tributeText = screen.getByTestId('guard-rank-progress-section').textContent ?? '';
    expect(tributeText).toContain('Honored Guardian Officer');
    expect(tributeText).not.toMatch(/profile\.guardRank\./);
  });

  it('omits anchor line when weekly review is missing or non-positive', () => {
    render(<GuardRankProgressSection totalIntercepts={5} streakDays={5} badgesUnlocked={5} weeklyReview={null} />);
    expect(screen.queryByTestId('guard-rank-progress-anchor')).toBeNull();
  });

  it('does not contain threat-like copy or currency symbols', async () => {
    render(<GuardRankProgressSection totalIntercepts={10} streakDays={31} badgesUnlocked={7} />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-rank-progress-section').textContent).not.toMatch(/降级|掉段|保持不住/);
      expect(screen.getByTestId('guard-rank-progress-section').textContent).not.toMatch(/\$/);
    });
  });

  it('switches freedom-time formatting when locale changes', async () => {
    // avgHours = totalSaved / hourlyRate / challengesCompleted = 5000 / 25 / 1 = 8 hours per guard
    // remainingGuards = 2 (from totalIntercepts=10 → next rank at 25)
    const { rerender } = render(
      <GuardRankProgressSection totalIntercepts={10} streakDays={31} badgesUnlocked={7} weeklyReview={{ challengesCompleted: 1, totalSaved: 5000 }} />,
    );
    await waitFor(() => expect(screen.getByTestId('guard-rank-progress-anchor')).toBeTruthy());
    expect(screen.getByTestId('guard-rank-progress-anchor').textContent).toContain('8.0 hours');

    vi.mocked(useI18n).mockImplementationOnce(() => ({
      ...useI18nMock(),
      locale: 'zh' as const,
    }));
    rerender(
      <GuardRankProgressSection totalIntercepts={10} streakDays={31} badgesUnlocked={7} weeklyReview={{ challengesCompleted: 1, totalSaved: 5000 }} />,
    );
    await waitFor(() => expect(screen.getByTestId('guard-rank-progress-anchor').textContent).toContain('8.0 小时'));
  });
});
