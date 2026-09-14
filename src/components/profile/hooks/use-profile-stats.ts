'use client';

import { useMemo } from 'react';
import type { EmailReceipt } from '@/lib/supabase';

interface UseProfileStatsArgs {
  uniqueReceipts: EmailReceipt[];
  buddyStreak?: number;
  buddyTotalSaved?: number;
  buddyChallengesCompleted?: number;
  buddyDreamFunds?: Array<{ current: number; target: number }>;
}

/**
 * 🔧 BUG-5/6 fix: Use buddyState as source of truth for streak/saved/challenges
 * (原为 profile-tab.tsx 内联 `_stats` memo — File Split Wave 1 纯搬运, 行为零变化)
 *
 * 🔧 BUG-5 fix: Use buddyStreak as SINGLE SOURCE OF TRUTH for streak.
 * 🔧 BUG-328 (N3) fix: 统一 Events / Interventions 语义（与 page.tsx 保持一致）
 * 🔧 PM5-P2-2 fix: "You saw" = challenge_completed + challenge_failed + refunded
 */
export function useProfileStats({ uniqueReceipts, buddyStreak, buddyTotalSaved, buddyChallengesCompleted, buddyDreamFunds }: UseProfileStatsArgs) {
  const _stats = useMemo(() => ({
    impulseInterventions: (buddyChallengesCompleted || 0) + uniqueReceipts.filter((r) => r.status === 'refunded').length,
    // 🔧 Bug 7 fix: 用 sum(dreamFunds.current) 替代 buddyTotalSaved
    //   旧代码: ... + (buddyTotalSaved || 0) — totalSaved 在 RPC LEAST clamp 下会持续累加 (即使 fund.current 已饱和到 target)
    //   → ProfileTab moneySaved 与 BuddyTab Balance 不一致 (BuddyTab 已修复用 sum(dreamFunds.current))
    //   修复: 也用 sum(dreamFunds.current), 保证三个 tab 数据一致。
    //   fallback: dreamFunds 未传 (undefined) 时回退到 buddyTotalSaved (向后兼容)
    moneySaved: uniqueReceipts
      .filter((r) => r.status === 'refunded')
      .reduce((sum, r) => sum + (r.amount || 0), 0) + (
        buddyDreamFunds && buddyDreamFunds.length > 0
          ? buddyDreamFunds.reduce((sum, f) => sum + (f.current || 0), 0)
          : (buddyTotalSaved || 0)
      ),
    daysStreak: buddyStreak || 0,
  }), [uniqueReceipts, buddyStreak, buddyTotalSaved, buddyChallengesCompleted, buddyDreamFunds]);

  return _stats;
}
