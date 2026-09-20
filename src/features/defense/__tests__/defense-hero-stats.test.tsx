/**
 * Component tests for DefenseHeroStats
 *
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { DefenseTab } from '@/features/defense/components/defense-tab';
import { DefenseTabDemo } from '@/features/defense/components/defense-tab-demo';
import type { CommunityStats } from '@/features/defense/hooks/use-community-stats';

let locale = 'en';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'defense.title': 'The Guard Grove',
        'defense.subtitle': 'A community of green spenders.',
        'defense.defenders': 'guards',
        'defense.hoursTogether': 'Won back together: {hours}',
        'defense.collectiveWonBack': 'Won back together: {hours} · {guards} guards',
        'defense.yourContribution': 'Your contribution',
        'defense.founderLine': 'You are Guard #{number}',
        'defense.notEnoughData': 'Be one of the first guards!',
        'defense.notEnoughDataDesc': 'Complete a guard challenge.',
        'defense.details': 'Details',
        'defense.rank.gapIntercepts': '{count} more guards to become {title}',
        'defense.rank.gapDays': 'Guard {count} more days to become {title}',
        'defense.rank.gapBadges': 'Collect {count} more badges to become {title}',
        'defense.rank.topLine': 'Highest rank reached — this is honor.',
        'profile.guardRank.sprout': 'Sprout',
        'profile.guardRank.trainee': 'Trainee Guardian',
        'profile.guardRank.companion': 'Companion Guardian',
        'profile.guardRank.partner': 'Guardian Partner',
        'profile.guardRank.ambassador': 'Guardian Ambassador',
        'profile.guardRank.honoree': 'Honored Guardian Officer',
        'ahaMoment.demoBadge': 'Sample data',
      };
      let text = map[key] ?? key;
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
      return text;
    },
    locale,
    setLocale: () => {},
  }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const sampleStats: CommunityStats = {
  activeUsers: 1247,
  totalSaved: 48392,
  totalChallengesPassed: 3891,
  lifeHoursRecovered: 2419.6,
  hasData: true,
};

function mockDefenseApi(collective: unknown = { hours: 9.56, guards: 1234 }) {
  vi.mocked(apiFetch).mockImplementation((url: string) => {
    if (url === '/api/community/stats') return Promise.resolve(sampleStats as never);
    if (url === '/api/community/platform-index') {
      return Promise.resolve({ platforms: [], hasData: false } as never);
    }
    if (url === '/api/community/inducement-strategies') {
      return Promise.resolve({ strategies: [], source: 'sample', totalEvents: 0 } as never);
    }
    if (url === '/api/defense/collective') return Promise.resolve(collective as never);
    return Promise.reject(new Error(`unexpected API: ${url}`));
  });
}

describe('Defense hero stats', () => {
  it('renders community and personal guard stats without currency', async () => {
    locale = 'en';
    mockDefenseApi();

    render(
      <Wrapper>
        <DefenseTab
          isDemo={false}
          onAuthPrompt={() => {}}
          userTotalSaved={200}
          userDefenderNumber={12}
        />
      </Wrapper>,
    );

    expect(await screen.findByText('1247')).toBeTruthy();
    expect(screen.getByText('1936 hours')).toBeTruthy();
    expect(screen.getByText('Won back together: 1936 hours')).toBeTruthy();
    expect(screen.getByText('8.0 hours')).toBeTruthy();
    expect(screen.getByText('You are Guard #12')).toBeTruthy();
    expect(screen.getByTestId('defense-collective-line').textContent).toBe(
      'Won back together: 9.6 hours · 1,234 guards',
    );
    expect(document.querySelector('section[aria-label="defense.heroStats"]')?.textContent).not.toMatch(/[$¥€]|\bUSD\b|\bCNY\b/);
  });

  it('hides the collective line without surfacing an error when its API fails', async () => {
    locale = 'en';
    mockDefenseApi(() => {
      throw new Error('network down');
    });

    render(
      <Wrapper>
        <DefenseTab isDemo={false} onAuthPrompt={() => {}} />
      </Wrapper>,
    );

    expect(await screen.findByText('1247')).toBeTruthy();
    expect(screen.queryByTestId('defense-collective-line')).toBeNull();
    expect(document.querySelector('section[aria-label="defense.heroStats"]')?.textContent).not.toMatch(/[$¥€]|\bUSD\b|\bCNY\b/);
  });

  it('shows positive no-data copy while community stats load or remain empty', () => {
    locale = 'en';
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));

    render(
      <Wrapper>
        <DefenseTab isDemo={false} onAuthPrompt={() => {}} />
      </Wrapper>,
    );

    expect(screen.getByText('Be one of the first guards!')).toBeTruthy();
    expect(screen.getByText('Complete a guard challenge.')).toBeTruthy();
    expect(screen.queryByText(/Your contribution/i)).toBeNull();
  });

  it('renders the rank badge with a calm next-rank line under Guard #N', async () => {
    locale = 'en';
    mockDefenseApi();

    render(
      <Wrapper>
        <DefenseTab
          isDemo={false}
          onAuthPrompt={() => {}}
          userDefenderNumber={12}
          guardRankStats={{ totalIntercepts: 5, streakDays: 2, badgesUnlocked: 0 }}
        />
      </Wrapper>,
    );

    expect(await screen.findByText('You are Guard #12')).toBeTruthy();
    const rankLine = screen.getByTestId('defense-rank-line');
    // trainee (拦截通道); 下一级 companion 三通道余量 5/28/6 → 拦截通道最近
    expect(rankLine.textContent).toBe('🛡️ Trainee Guardian · 5 more guards to become Companion Guardian');
  });

  it('renders the sprout rank with a calm gap for an all-zero fresh guardian', async () => {
    locale = 'en';
    mockDefenseApi();

    render(
      <Wrapper>
        <DefenseTab
          isDemo={false}
          onAuthPrompt={() => {}}
          guardRankStats={{ totalIntercepts: 0, streakDays: 0, badgesUnlocked: 0 }}
        />
      </Wrapper>,
    );

    const rankLine = await screen.findByTestId('defense-rank-line');
    expect(rankLine.textContent).toBe('🌱 Sprout · 3 more guards to become Trainee Guardian');
  });

  it('shows the tribute line instead of a gap at the top rank', async () => {
    locale = 'en';
    mockDefenseApi();

    render(
      <Wrapper>
        <DefenseTab
          isDemo={false}
          onAuthPrompt={() => {}}
          guardRankStats={{ totalIntercepts: 100, streakDays: 365, badgesUnlocked: 14 }}
        />
      </Wrapper>,
    );

    const rankLine = await screen.findByTestId('defense-rank-line');
    expect(rankLine.textContent).toBe('👑 Honored Guardian Officer · Highest rank reached — this is honor.');
  });

  it('hides the rank line entirely when no rank stats are provided', async () => {
    locale = 'en';
    mockDefenseApi();

    render(
      <Wrapper>
        <DefenseTab isDemo={false} onAuthPrompt={() => {}} userDefenderNumber={12} />
      </Wrapper>,
    );

    expect(await screen.findByText('You are Guard #12')).toBeTruthy();
    expect(screen.queryByTestId('defense-rank-line')).toBeNull();
  });

  it('keeps the rank line free of money and FOMO phrasing', async () => {
    locale = 'en';
    mockDefenseApi();

    render(
      <Wrapper>
        <DefenseTab
          isDemo={false}
          onAuthPrompt={() => {}}
          guardRankStats={{ totalIntercepts: 3, streakDays: 2, badgesUnlocked: 0 }}
        />
      </Wrapper>,
    );

    const rankLine = await screen.findByTestId('defense-rank-line');
    expect(rankLine.textContent).not.toMatch(/[$¥€]|\bUSD\b|\bCNY\b/);
    // 禁 FOMO: 金额焦虑 + 稀缺/损失句式都不出现在段位差距行
    expect(rankLine.textContent).not.toMatch(/\bonly\b|about to (lose|be overtaken)|last chance|don'?t miss|hurry|running out|还差|即将|只剩|错过/i);
  });

  it('renders the same hero stats structure in demo mode', () => {
    locale = 'en';

    render(
      <Wrapper>
        <DefenseTabDemo
          onAuthPrompt={() => {}}
          stats={sampleStats}
          platformIndex={[]}
          strategies={[]}
          challenges={[]}
          joinChallenge={async () => {
            await Promise.resolve();
            return { success: true };
          }}
          checkin={async () => {
            await Promise.resolve();
            return { success: true };
          }}
          actionLoading={false}
          t={(key, values) => {
            let text = key === 'defense.hoursTogether' ? 'Won back together: {hours}' : key;
            for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, String(value));
            return text;
          }}
          locale={locale}
        />
      </Wrapper>,
    );

    expect(screen.getByText('1247')).toBeTruthy();
    expect(screen.getByText('1936 hours')).toBeTruthy();
    expect(screen.queryByText(/Your contribution/i)).toBeNull();
    expect(document.querySelector('section[aria-label="defense.heroStats"]')?.textContent).not.toMatch(/[$¥€]|\bUSD\b|\bCNY\b/);
  });
});
