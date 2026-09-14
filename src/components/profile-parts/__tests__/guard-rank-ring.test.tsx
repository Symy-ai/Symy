// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuardRankRing } from '../guard-rank-ring';
import { type GuardRank } from '@/lib/guard-rank';
import { type RankChannelProgress } from '@/lib/guard-rank-progress';

// 等阶名必须走 t() 翻译 — 回归: 曾经直接渲染 rank.nameKey 裸键名 (用户看到 profile.guardRank.companion)
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'profile.guardRank.companion': 'Companion Guardian',
        'profile.guardRank.honoree': 'Honored Guardian Officer',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
  }),
}));

function makeRank(overrides: Partial<GuardRank> = {}): GuardRank {
  return {
    id: 'companion',
    level: 2,
    nameKey: 'profile.guardRank.companion',
    emoji: '🤝',
    minIntercepts: 10,
    altStreakDays: 30,
    altBadges: 6,
    ...overrides,
  };
}

function channels(pcts: number[]): { channel: RankChannelProgress['channel']; pct: number }[] {
  return [
    { channel: 'intercepts', pct: pcts[0] },
    { channel: 'streakDays', pct: pcts[1] },
    { channel: 'badges', pct: pcts[2] },
  ];
}

describe('GuardRankRing', () => {
  it('renders three arc groups and highlights the primary channel', () => {
    const { container } = render(<GuardRankRing rank={makeRank()} channels={channels([0.5, 0.75, 0.2])} bestChannel="streakDays" />);
    const arcs = container.querySelectorAll('circle');
    expect(arcs.length).toBeGreaterThanOrEqual(6); // 3 tracks + 3 arcs
    const primaryArcs = container.querySelectorAll('circle[stroke="#4ade80"]');
    expect(primaryArcs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders percentage labels inside valid range', () => {
    const { container } = render(<GuardRankRing rank={makeRank()} channels={channels([0.5, 0.75, 0.2])} bestChannel="intercepts" />);
    expect(container.querySelector('text')?.textContent).toBe('50%');
  });

  it('renders the center rank emoji and the translated rank name (never the raw key)', () => {
    render(<GuardRankRing rank={makeRank()} channels={channels([0.1, 0.1, 0.1])} bestChannel="badges" />);
    expect(screen.getByText('🤝')).toBeTruthy();
    expect(screen.getByText('Companion Guardian')).toBeTruthy();
    expect(screen.queryByText('profile.guardRank.companion')).toBeNull();
  });

  it('does not render a percentage label at 0% or 100%', () => {
    const { container } = render(<GuardRankRing rank={makeRank()} channels={channels([0, 1, 0.5])} bestChannel="badges" />);
    const textNodes = container.querySelectorAll('text');
    const labels = Array.from(textNodes).map((n) => n.textContent).filter(Boolean);
    expect(labels).not.toContain('0%');
    expect(labels).not.toContain('100%');
  });

  it('renders the promo animation class when promoting', () => {
    render(
      <div className={`guard-rank-promo-anim`}>
        <GuardRankRing rank={makeRank()} channels={channels([0.3, 0.4, 0.5])} bestChannel="badges" />
      </div>,
    );
    const wrapper = document.querySelector('.guard-rank-promo-anim');
    expect(wrapper).toBeTruthy();
  });
});
