'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { GUARD_RANKS, getGuardRank, getNextGuardRankProgress, type GuardRank, type GuardRankStats } from '@/lib/guard-rank';
import { getRankProgressPct, getAvgHoursPerGuard, type RankChannelProgress } from '@/lib/guard-rank-progress';
import { GuardRankRing } from './guard-rank-ring';

/** /api/buddy/weekly-review 返回中本区用到的字段 */
interface WeeklyReviewLite {
  challengesCompleted: number;
  totalSaved: number;
}

export interface GuardRankProgressSectionProps {
  /** 全时段累计拦截 */
  totalIntercepts: number;
  /** 当前连续守护天数 */
  streakDays: number;
  /** 已解锁勋章数 */
  badgesUnlocked: number;
  /** 当前段位 (可选, 外部传入避免重复计算; 不传则内部计算) */
  rank?: GuardRank;
  /** 外部注入的周度数据 (可选; 不传则内部 fetch) */
  weeklyReview?: WeeklyReviewLite | null;
}

/** 一段 ≤1.5s 的 CSS-only 晋升轻动效 */
const PROMO_STYLE = `
@keyframes guard-rank-promo {
  0% { opacity: 0.45; transform: translateY(4px); }
  60% { opacity: 1; transform: translateY(0); }
  100% { opacity: 1; transform: translateY(0); }
}
.guard-rank-promo-anim {
  animation: guard-rank-promo 1.2s ease-out both;
}
`;

export function GuardRankProgressSection({ totalIntercepts, streakDays, badgesUnlocked, rank: rankProp, weeklyReview: weeklyReviewProp }: GuardRankProgressSectionProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const [week, setWeek] = useState<WeeklyReviewLite | null>(weeklyReviewProp ?? null);
  const prevLevelRef = useRef<number | null>(null);
  const [promoting, setPromoting] = useState(false);

  const stats: GuardRankStats = { totalIntercepts, streakDays, badgesUnlocked };
  const rank = rankProp ?? getGuardRank(stats);
  const nextRank = getNextGuardRankProgress(rank, stats);
  const best = getRankProgressPct(rank, stats);
  const avgHours = getAvgHoursPerGuard(week, hourlyRate);

  // 内部 fetch weekly-review
  useEffect(() => {
    if (weeklyReviewProp !== undefined || !stats.totalIntercepts) return;
    const controller = new AbortController();
    // safe to ignore: weekly-review 是可选增强数据, AbortController 已防悬挂; 组件挂载时 auth 必已就绪, 不属冷载 401 风暴类
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
    apiFetch<WeeklyReviewLite>('/api/buddy/weekly-review', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setWeek(data); })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.warn('[GuardRankProgressSection] weekly-review fetch failed:', err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [weeklyReviewProp, stats.totalIntercepts]);

  // 晋升轻动效
  useEffect(() => {
    const prev = prevLevelRef.current;
    if (prev !== null && rank.level > prev) {
      setPromoting(true);
      const timer = setTimeout(() => setPromoting(false), 1200);
      return () => clearTimeout(timer);
    }
    prevLevelRef.current = rank.level;
  }, [rank.level]);

  if (!best && !nextRank) {
    // 最高段位终局态
    return (
      <div
        className={`rounded-xl border border-emerald-300/20 bg-white/5 p-3.5 ${promoting ? 'guard-rank-promo-anim' : ''}`}
        data-testid="guard-rank-progress-section"
      >
        <style>{PROMO_STYLE}</style>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1" aria-hidden="true">
            {GUARD_RANKS.map((r) => (
              <span key={r.id} className="text-xs leading-none">{r.emoji}</span>
            ))}
          </div>
          <span className="text-[13px] font-semibold text-[#f0faf2]">{t(rank.nameKey)}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-emerald-200/90">{t('profile.guardRankProgress.highestRankTribute', { defaultValue: 'Highest guardian rank achieved — honor, not shame.' })}</p>
      </div>
    );
  }

  const remainingCount = nextRank?.remainingCount;
  const anchorHours = avgHours && remainingCount ? Math.round(avgHours * remainingCount * 100) / 100 : null;
  const showAnchor = avgHours !== null && remainingCount !== undefined && remainingCount > 0;

  const ringChannels: { channel: RankChannelProgress['channel']; pct: number }[] = [
    { channel: 'intercepts', pct: 0 },
    { channel: 'streakDays', pct: 0 },
    { channel: 'badges', pct: 0 },
  ];

  if (best) {
    const base = (() => {
      if (best.channel === 'intercepts') return rank.minIntercepts;
      if (best.channel === 'streakDays') return rank.altStreakDays;
      return rank.altBadges;
    })();
    const target = (() => {
      if (!nextRank) return base;
      if (best.channel === 'intercepts') return nextRank.next.minIntercepts;
      if (best.channel === 'streakDays') return nextRank.next.altStreakDays;
      return nextRank.next.altBadges;
    })();
    const current = (() => {
      if (best.channel === 'intercepts') return totalIntercepts;
      if (best.channel === 'streakDays') return streakDays;
      return badgesUnlocked;
    })();
    const pct = target <= base ? 0 : Math.max(0, Math.min(1, (base + current) / (base + target)));
    const idx = best.channel === 'intercepts' ? 0 : best.channel === 'streakDays' ? 1 : 2;
    ringChannels[idx] = { channel: best.channel, pct };
  }

  return (
    <div
      className={`rounded-xl border border-emerald-300/20 bg-white/5 p-3.5 ${promoting ? 'guard-rank-promo-anim' : ''}`}
      data-testid="guard-rank-progress-section"
    >
      <style>{PROMO_STYLE}</style>
      <div className="flex flex-col items-center gap-1">
        <GuardRankRing rank={rank} channels={ringChannels} bestChannel={best?.channel} />
      </div>

      {showAnchor && anchorHours !== null && (
        <p className="mt-2 text-[10px] text-emerald-200/90" data-testid="guard-rank-progress-anchor">
          {t('profile.guardRankProgress.anchorLine', {
            avgHours: moneyToFreedomLabel(avgHours, locale, hourlyRate),
            remainingGuards: remainingCount!,
            totalHours: moneyToFreedomLabel(anchorHours, locale, hourlyRate),
            defaultValue: 'Each guard ≈ {avgHours} · {remainingGuards} more ≈ {totalHours}',
          })}
        </p>
      )}
    </div>
  );
}

