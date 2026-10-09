// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/use-collective-defense-stats', () => ({
  useCollectiveDefenseStats: vi.fn(() => ({ collectiveStats: { hours: 1234.5, guards: 5678 }, isLoading: false })),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: vi.fn(() => ({ hourlyRate: 50 })),
}));
vi.mock('@/lib/freedom-time', () => ({
  DEFAULT_HOURLY_RATE: 50,
  formatFreedomTime: vi.fn((h: number) => `${Math.round(h)} 小时`),
  moneyToFreedomLabel: vi.fn((money: number, _l: string, rate: number) => `${Math.round(money / rate)} 小时`),
}));

import { DefenseHeroStats } from '../defense-hero-stats';

const stableT = (key: string, opts?: { defaultValue?: string; hours?: string; number?: number; count?: number; title?: string }) => {
  const map: Record<string, string> = {
    'defense.heroStats': '守护者总览',
    'defense.defenders': '位守护者',
    'defense.hoursTogether': '一起赢回 {hours}',
    'defense.notEnoughData': '数据积累中',
    'defense.notEnoughDataDesc': '再守几次就有数据了',
    'defense.yourContribution': '你的贡献',
    'defense.founderLine': '你是第 {number} 位守护者',
    'profile.guardRank.sprout': '新芽',
    'profile.guardRank.trainee': '见习守卫',
    'defense.rank.gapIntercepts': '再守 {count} 次成为 {title}',
    'defense.rank.topLine': '已是最高段位',
    'defense.collectiveWonBack': '社区已共同赢回 {hours} · {guards} 次守护',
  };
  let v = map[key] ?? opts?.defaultValue ?? key;
  if (opts) {
    for (const [k, val] of Object.entries(opts)) {
      if (val !== undefined) v = v.split(`{${k}}`).join(String(val));
    }
  }
  return v;
};

const stats = { hasData: true, activeUsers: 42, totalSaved: 10000 } as never;

/**
 * defense-hero-stats.tsx (103行) — 守护者总览 (含段位行+集体行)。
 *
 * 锁定:
 * - 双格: hasData → 数字; 无数据 → 诚实降级文案
 * - showContribution: userTotalSaved 有值 → 贡献格 (col-span-2)
 * - founderLine: userDefenderNumber 插值
 * - 段位行: rank 数据有 → emoji+段名+差距文案; 无 rank → 整行不出 (诚实降级)
 * - 集体行: hours/guards 千分位
 */
describe('DefenseHeroStats 守护者总览', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('双格: 有数据 → 数字+自由时标签', () => {
    render(<DefenseHeroStats stats={stats} isLoading={false} t={stableT} locale="zh" />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('位守护者')).toBeTruthy();
    expect(screen.getByText('200 小时')).toBeTruthy(); // 10000/50
    expect(screen.getByText(/一起赢回/)).toBeTruthy();
  });

  it('无数据 → 诚实降级文案', () => {
    render(<DefenseHeroStats stats={{ hasData: false } as never} isLoading={false} t={stableT} locale="zh" />);
    expect(screen.getByText('数据积累中')).toBeTruthy();
    expect(screen.getByText('再守几次就有数据了')).toBeTruthy();
    expect(screen.queryByText('42')).toBeNull();
  });

  it('贡献格+founderLine 插值', () => {
    render(<DefenseHeroStats stats={stats} isLoading={false} userTotalSaved={500} userDefenderNumber={7} t={stableT} locale="zh" />);
    expect(screen.getByText('10 小时')).toBeTruthy(); // 500/50
    expect(screen.getByText('你的贡献')).toBeTruthy();
    expect(screen.getByText('你是第 7 位守护者')).toBeTruthy();
  });

  it('段位行: 有 rank → emoji+段名+差距; 无 rank → 整行不出', () => {
    const { unmount } = render(
      <DefenseHeroStats stats={stats} isLoading={false} guardRankStats={{ totalIntercepts: 0, streakDays: 0, badgesUnlocked: 0 }} t={stableT} locale="zh" />,
    );
    const line = screen.getByTestId('defense-rank-line');
    expect(line.textContent).toContain('🌱');
    expect(line.textContent).toContain('新芽');
    expect(line.textContent).toContain('再守 3 次成为 见习守卫'); // 平静陈述差距
    unmount();
    render(<DefenseHeroStats stats={stats} isLoading={false} t={stableT} locale="zh" />);
    expect(screen.queryByTestId('defense-rank-line')).toBeNull(); // 诚实降级
  });

  it('集体行: hours+guards 千分位', () => {
    render(<DefenseHeroStats stats={stats} isLoading={false} t={stableT} locale="zh" />);
    const line = screen.getByTestId('defense-collective-line');
    expect(line.textContent).toContain('1235 小时'); // round
    expect(line.textContent).toContain('5,678'); // 千分位
  });
});
