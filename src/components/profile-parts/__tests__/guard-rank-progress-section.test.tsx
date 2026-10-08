// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.guardRankProgress.highestRankTribute': '已达最高守护段位——这是荣誉，不是羞耻。',
        'profile.guardRank.sprout': '新芽',
        'profile.guardRank.trainee': '见习守护者',
      };
      if (key === 'profile.guardRankProgress.anchorLine') {
        return (opts?.defaultValue ?? '').replace('{avgHours}', '2h').replace('{totalHours}', '2h');
      }
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => Promise.reject(new Error('no-mock'))) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 25 }) }));
vi.mock('@/lib/freedom-time', () => ({ moneyToFreedomLabel: (v: number) => `${v}h` }));
vi.mock('../guard-rank-ring', () => ({
  GuardRankRing: (p: { rank?: { id?: string; emoji?: string }; bestChannel?: string; channels?: { channel: string; pct: number }[] }) => (
    <div data-testid="guard-rank-ring" data-rank={p.rank?.id} data-best={p.bestChannel} data-pcts={(p.channels ?? []).map((c) => `${c.channel}:${c.pct}`).join(',')} />
  ),
}));

import { GuardRankProgressSection } from '../guard-rank-progress-section';
import { apiFetch } from '@/lib/api-client';
import { GUARD_RANKS } from '@/lib/guard-rank';

const mockApi = vi.mocked(apiFetch);

function renderUI(props: Partial<Parameters<typeof GuardRankProgressSection>[0]> = {}) {
  return render(
    <GuardRankProgressSection totalIntercepts={0} streakDays={0} badgesUnlocked={0} {...props} />,
  );
}

/**
 * guard-rank-progress-section.tsx (159行) — 守护段位进度区 (六段位阶梯)。
 *
 * 锁定:
 * - 零战绩 → sprout (level 0)
 * - 拦截 3+ → trainee 晋升
 * - 终局态 (honoree): 最高段位致敬文案, 无进度环
 * - weeklyReview prop 注入 → 零 fetch; 未注入+有战绩 → 内部 fetch
 * - fetch 失败 → week 保持 null 静默
 * - abort → 不 setState
 */
describe('GuardRankProgressSection 守护段位进度区', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('零战绩 → sprout 段位环渲染', () => {
    renderUI();
    expect(screen.getByTestId('guard-rank-ring').getAttribute('data-rank')).toBe('sprout');
  });

  it('拦截 3+ → trainee', () => {
    renderUI({ totalIntercepts: 3 });
    expect(screen.getByTestId('guard-rank-ring').getAttribute('data-rank')).toBe('trainee');
  });

  it('外部 rank prop 优先 (跳过内部计算): rank=trainee 但零战绩仍 trainee', () => {
    renderUI({ totalIntercepts: 0, rank: GUARD_RANKS[1] });
    expect(screen.getByTestId('guard-rank-ring').getAttribute('data-rank')).toBe('trainee');
  });

  it('honoree 终局态: 致敬文案 + 无进度环', () => {
    renderUI({ totalIntercepts: 100 });
    expect(screen.getByTestId('guard-rank-progress-section')).toBeTruthy();
    expect(screen.getByText('已达最高守护段位——这是荣誉，不是羞耻。')).toBeTruthy();
    expect(screen.queryByTestId('guard-rank-ring')).toBeNull();
  });

  it('weeklyReview prop 注入 → 零 fetch', () => {
    renderUI({ totalIntercepts: 5, weeklyReview: { challengesCompleted: 2, totalSaved: 100 } });
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('未注入+有战绩 → 内部 fetch weekly-review', async () => {
    mockApi.mockResolvedValueOnce({ challengesCompleted: 4, totalSaved: 200 } as never);
    renderUI({ totalIntercepts: 5 });
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/api/buddy/weekly-review', expect.anything()));
  });

  it('fetch 失败 → 静默 (warn 日志, 不炸)', async () => {
    mockApi.mockRejectedValueOnce(new Error('down') as never);
    renderUI({ totalIntercepts: 5 });
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(screen.getByTestId('guard-rank-ring')).toBeTruthy();
  });

  it('周战绩换算展示: 4 次 200 刀 @25 → 2 小时/次', async () => {
    mockApi.mockResolvedValueOnce({ challengesCompleted: 4, totalSaved: 200 } as never);
    renderUI({ totalIntercepts: 5 });
    await waitFor(() => expect(screen.getByTestId('guard-rank-progress-anchor')).toBeTruthy(), { timeout: 2000 });
  });
});
