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
        'defense.yourContribution': 'Your contribution',
        'defense.founderLine': 'You are Guard #{number}',
        'defense.notEnoughData': 'Be one of the first guards!',
        'defense.notEnoughDataDesc': 'Complete a guard challenge.',
        'defense.details': 'Details',
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

describe('Defense hero stats', () => {
  it('renders community and personal guard stats without currency', async () => {
    locale = 'en';
    vi.mocked(apiFetch).mockResolvedValue(sampleStats as never);

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
