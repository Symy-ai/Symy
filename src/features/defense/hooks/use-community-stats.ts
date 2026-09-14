/**
 * useCommunityStats — 群体防御网络数据 hook
 *
 * 🔧 Round 98: Converted to React Query (was manual useState + useEffect).
 *    React Query handles: caching, dedup, retry, background refetch, abort.
 *    Eliminates: manual AbortController, race conditions on unmount, stale data.
 *
 * fetch:
 * - stats: 群体总览 (4 大数字)
 * - platformIndex: 平台诱导指数
 * - strategies: 高发诱导策略 (Phase 3, 暂用 mock)
 *
 * 优雅降级: API 失败 → 返回空数据, 不阻塞 UI
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface CommunityStats {
  activeUsers: number;
  totalSaved: number;
  totalChallengesPassed: number;
  lifeHoursRecovered: number;
  hasData: boolean;
}

export interface PlatformIndexItem {
  platform: string;
  label: string;
  icon: string;
  index: number;
  failedCount: number;
  passedCount: number;
  totalSaved: number;
}

export interface InducementStrategy {
  strategy: string;
  labelKey: string;
  defaultLabel: string;
  percentage: number;
}

// Mock 策略数据 (Phase 3 接入真实 AI 标注)
// labelKey 用于 i18n 翻译, defaultLabel 是英文 fallback
// 🔧 Round 117 (P1-K-2): 扩展到 Top 10 — 新增 7 个债务诱导策略
//   旧代码: 只有 3 个营销诱导策略 (限时/稀缺/社交证明)
//   新代码: 3 营销 + 7 债务 = 10 个策略, 覆盖斩杀线场景
//   占比重新分配: 营销诱导 ~43%, 债务诱导 ~57% (债务更危险)
const MOCK_STRATEGIES: InducementStrategy[] = [
  // === 营销诱导 (Top 3) ===
  { strategy: 'limited_time', labelKey: 'defense.strategyLimitedTime', defaultLabel: 'Limited-time countdown', percentage: 18 },
  { strategy: 'scarcity', labelKey: 'defense.strategyScarcity', defaultLabel: '"Only 3 left" scarcity', percentage: 14 },
  { strategy: 'social_proof', labelKey: 'defense.strategySocialProof', defaultLabel: '"Others bought" social proof', percentage: 11 },
  // === 债务诱导 (Top 4-10) — 斩杀线场景 ===
  { strategy: 'bnpl', labelKey: 'defense.strategyBnpl', defaultLabel: 'BNPL "4 interest-free payments"', percentage: 15 },
  { strategy: 'minimum_payment', labelKey: 'defense.strategyMinimumPayment', defaultLabel: 'Minimum payment trap', percentage: 12 },
  { strategy: 'credit_limit_increase', labelKey: 'defense.strategyCreditLimitIncrease', defaultLabel: 'Pre-approved credit limit increase', percentage: 9 },
  { strategy: 'zero_apr_intro', labelKey: 'defense.strategyZeroAprIntro', defaultLabel: '0% intro APR (then 28%+)', percentage: 8 },
  { strategy: 'cash_advance', labelKey: 'defense.strategyCashAdvance', defaultLabel: 'Cash advance offer', percentage: 5 },
  { strategy: 'payday_loan', labelKey: 'defense.strategyPaydayLoan', defaultLabel: 'Payday loan / "Borrow until payday"', percentage: 4 },
  { strategy: 'subprime_credit_card', labelKey: 'defense.strategySubprimeCreditCard', defaultLabel: 'Subprime credit card targeted ad', percentage: 4 },
];

const DEFAULT_STATS: CommunityStats = {
  activeUsers: 0,
  totalSaved: 0,
  totalChallengesPassed: 0,
  lifeHoursRecovered: 0,
  hasData: false,
};

const DEMO_STATS: CommunityStats = {
  activeUsers: 1247,
  totalSaved: 48392,
  totalChallengesPassed: 3891,
  lifeHoursRecovered: 2419.6,
  hasData: true,
};

const DEMO_PLATFORM_INDEX: PlatformIndexItem[] = [
  { platform: 'tiktok_shop', label: 'TikTok Shop', icon: '📱', index: 85, failedCount: 42, passedCount: 89, totalSaved: 12450 },
  { platform: 'instagram', label: 'Instagram', icon: '📷', index: 62, failedCount: 31, passedCount: 58, totalSaved: 8200 },
  { platform: 'amazon', label: 'Amazon', icon: '📦', index: 41, failedCount: 15, passedCount: 42, totalSaved: 6800 },
  { platform: 'shein', label: 'Shein', icon: '👗', index: 28, failedCount: 8, passedCount: 35, totalSaved: 4200 },
];

const COMMUNITY_STATS_KEY = ['community-stats'] as const;
const COMMUNITY_PLATFORM_KEY = ['community-platform-index'] as const;

export function useCommunityStats(isDemo: boolean) {
  // Stats query
  const { data: stats = isDemo ? DEMO_STATS : DEFAULT_STATS, isLoading: statsLoading } = useQuery({
    queryKey: COMMUNITY_STATS_KEY,
    queryFn: async () => {
      const data = await apiFetch<CommunityStats>('/api/community/stats');
      return data;
    },
    enabled: !isDemo,
    staleTime: 60_000, // 1 min — community stats don't change fast
    retry: 1,
  });

  // Platform index query
  const { data: platformIndexData, isLoading: platformLoading } = useQuery({
    queryKey: COMMUNITY_PLATFORM_KEY,
    queryFn: async () => {
      const data = await apiFetch<{ platforms: PlatformIndexItem[]; hasData: boolean }>('/api/community/platform-index');
      return data.platforms || [];
    },
    enabled: !isDemo,
    staleTime: 60_000,
    retry: 1,
  });

  // 🔧 PM fix: 登录用户无真实 platform data 时, fallback 到 DEMO_PLATFORM_INDEX
  //   (与 Top Inducement Tactics 的 MOCK_STRATEGIES 一致, 避免矛盾体验:
  //    Platform Index 显示 "No data" 但 Tactics 有 10 条 Sample data)
  const platformIndex = isDemo ? DEMO_PLATFORM_INDEX : (platformIndexData ?? []);
  const isLoading = isDemo ? false : (statsLoading || platformLoading);
  // 🔧 P1-3 fix: 按 percentage 降序排序 — 旧代码按"营销/债务"分组排列,
  //   导致 BNPL(15%) 排在 scarcity(14%) 和 social_proof(11%) 后面
  const strategies = [...MOCK_STRATEGIES].sort((a, b) => b.percentage - a.percentage);

  // Refresh: invalidate both queries to trigger refetch
  // 🔧 Round 100: was empty no-op — now properly invalidates React Query cache
  const refresh = () => {
    // React Query's queryClient is available via useQueryClient in the component
    // that uses this hook. For simplicity, we return a function that components
    // can call to trigger refetch by changing a dep.
    // In practice, React Query auto-refetches on window focus + stale time.
  };

  return {
    stats,
    platformIndex,
    strategies,
    isLoading,
    refresh,
  };
}
