'use client';

/**
 * GuardTotalsCard — 绿色守护战绩总览卡 (profile 域, batch5-c)
 *
 * 累计视角的绿色荣誉: 加入 Symy 以来的累计拦截 / 连续守护 / 最长连续 /
 * 解锁勋章 / 小象阶段。数据全部来自既有管道, 零新 API 零 DDL:
 * - GET /api/challenge/stats → totalPassed: active_challenges 全时段 passed
 *   计数 (拦截记录管道, 不受 health_events Clear 影响)
 * - GET /api/buddy/state → streak / badges / growthStage / totalSaved
 *
 * 数据口径 (注释即口径文档):
 * - 里子金额 (仅 app 内可见): buddy_state.total_saved — apply_buddy_state_delta
 *   随守护行为累加的全时计数器 (挑战拦截 savedAmount + 退款找回, 见
 *   migration 008/010)。周结算 (/api/buddy/weekly-review) 的 totalSaved 是同一
 *   守护管道在近 7 天窗口的子集 (challenge_completed.savedAmount 求和);
 *   早期时段无逐日结算落库, 全时口径以 total_saved 计数器为准。
 * - 最长连续守护: 全量逐日活动未落库 (零 DDL), 取「当前 streak」与已解锁
 *   streak 里程碑勋章 (streak_7→7 / streak_guardian_30→30) 的最大值; 有拦截
 *   记录时下界为 1 (每次拦截都发生在某一天)。只保守不夸大, 不虚构数据。
 *
 * 面子/里子分离 (owner 09-06 铁律): 分享走 share-modal 既有模板 (streak /
 * milestone), 传参中唯一的金额是 medal.savedCents — share-modal 的既有机制
 * 在渲染前把它换算成自由小时, 分享图永无钱数。里子金额行只存在于本卡 app
 * 内的次级区, 不进任何导出/分享管道。
 *
 * 荣誉非羞耻: 无任何数据时不出 0/0/0 空表, 展示「第一次守护会在这里开始」
 * 的正面引导; streak 为 0 时守护格显示重新起数陪伴文案, 不出 0。
 */

import { useEffect, useState } from 'react';
import { CalendarDays, EyeOff, Flame, Medal, Share2, ShieldCheck, Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { getGuardRank, getNextGuardRankProgress } from '@/lib/guard-rank';
import { GuardRankProgressSection } from './guard-rank-progress-section';
import { GuardEvidenceSection } from './guard-evidence-section';
import type { GuardEvidenceEventInput } from '@/lib/guard-ledger-provenance';
// 只读引用 (batch5-c 红线: buddy/ 禁改) — 勋章总数来自绿色荣誉库注册表
import { ALL_BADGES } from '@/components/buddy/constants';
import type { GrowthStage } from '@/types/buddy-state';
import { ShareModal } from '@/components/share/share-modal';

/** /api/buddy/state 返回中本卡用到的字段 (其余忽略) */
interface BuddyStateLite {
  streak: number;
  badges: string[] | null;
  growthStage: string;
  totalSaved: number;
}

/** /api/challenge/stats 返回中本卡用到的字段 */
interface ChallengeStatsLite {
  totalPassed: number;
}

export interface GuardTotalsData {
  /** 全时段累计拦截 (active_challenges passed) */
  totalIntercepts: number;
  /** 当前连续守护天数 (buddy_state.streak) */
  streakDays: number;
  /** 最长连续守护 (数据可证下界, 见文件头口径注释) */
  longestStreak: number;
  /** 已解锁勋章数 / 勋章总数 */
  badgesUnlocked: number;
  badgesTotal: number;
  growthStage: GrowthStage;
  /** 里子: 全时段留下的钱 (total_saved 计数器, 仅 app 内展示) */
  totalSaved: number;
}

/** streak 里程碑勋章 → 已证明的连续天数下界 (与 ALL_BADGES progressTarget 一致) */
const STREAK_BADGE_FLOORS: Record<string, number> = {
  streak_7: 7,
  streak_guardian_30: 30,
};

const GROWTH_STAGES: GrowthStage[] = ['baby', 'young', 'adult', 'elder'];

/** 小象阶段 emoji — 与 buddy/growth-stage-badge.tsx 同一套意象 (只读对齐) */
const STAGE_EMOJI: Record<GrowthStage, string> = {
  baby: '🌱',
  young: '⭐',
  adult: '✨',
  elder: '🪷',
};

/**
 * 最长连续守护 = max(当前 streak, 里程碑勋章下界) — 纯函数, 导出供测试。
 * 有拦截记录但两者皆无数据时下界为 1 (拦截发生在某一天, 至少连续 1 天)。
 */
export function longestKnownStreak(streakDays: number, badges: string[] | null, totalIntercepts = 0): number {
  let longest = Math.max(0, Math.floor(streakDays) || 0);
  for (const b of badges || []) {
    const floor = STREAK_BADGE_FLOORS[b];
    if (floor && floor > longest) longest = floor;
  }
  if (totalIntercepts > 0 && longest === 0) longest = 1;
  return longest;
}

/** 空态判定: 无拦截、无 streak、无勋章 → 正面引导而非 0/0/0 空表 */
export function isGuardTotalsEmpty(d: Pick<GuardTotalsData, 'totalIntercepts' | 'streakDays' | 'badgesUnlocked'>): boolean {
  return d.totalIntercepts === 0 && d.streakDays === 0 && d.badgesUnlocked === 0;
}

function toTotals(state: BuddyStateLite, stats: ChallengeStatsLite | null): GuardTotalsData {
  const totalIntercepts = stats ? Math.max(0, Math.floor(stats.totalPassed) || 0) : 0;
  const badges = state.badges || [];
  return {
    totalIntercepts,
    streakDays: Math.max(0, Math.floor(state.streak) || 0),
    longestStreak: longestKnownStreak(state.streak, badges, totalIntercepts),
    badgesUnlocked: badges.length,
    badgesTotal: ALL_BADGES.length,
    growthStage: GROWTH_STAGES.includes(state.growthStage as GrowthStage) ? (state.growthStage as GrowthStage) : 'baby',
    totalSaved: Math.max(0, Number(state.totalSaved) || 0),
  };
}

function TotalsCell({ icon, value, suffix, label, testId }: {
  icon: React.ReactNode;
  value: number | string;
  suffix?: string;
  label: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-300/15 bg-white/5 p-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-emerald-300/80">{icon}</div>
      <p className="mt-1.5 text-2xl font-black leading-none text-[#f0faf2]">
        {value}
        {suffix && <span className="ml-1 text-sm font-bold">{suffix}</span>}
      </p>
      <p className="mt-1 text-[11px] text-[#88a292]">{label}</p>
    </div>
  );
}

export function GuardTotalsCard({ isActive = true, onOpenInsights }: { isActive?: boolean; onOpenInsights?: () => void }) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const [stateData, setStateData] = useState<BuddyStateLite | null>(null);
  const [statsData, setStatsData] = useState<ChallengeStatsLite | null>(null);
  const [evidenceEvents, setEvidenceEvents] = useState<GuardEvidenceEventInput[] | null>(null);
  const [isLoading, setIsLoading] = useState(isActive);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    setIsLoading(true);
    setFetchError(null);

    (async () => {
      try {
        const [state, stats] = await Promise.all([
          // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 挂载时按需拉取既有管道, AbortController 已防悬挂
          apiFetch<BuddyStateLite>('/api/buddy/state', { signal: controller.signal }),
          // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 同上
          apiFetch<ChallengeStatsLite>('/api/challenge/stats', { signal: controller.signal }),
        ]);
        const evidence = await apiFetch<{ events: GuardEvidenceEventInput[] }>(
          '/api/buddy/health-events?limit=100',
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setStateData(state);
        setStatsData(stats);
        setEvidenceEvents(evidence.events);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.warn('[GuardTotalsCard] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!controller.signal.aborted) {
          setFetchError(err instanceof Error ? err.message : 'Failed to load guard totals');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [isActive, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  if (isLoading) {
    return (
      <section
        data-testid="guard-totals-card"
        className="relative overflow-hidden rounded-2xl p-5"
        onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; onOpenInsights?.(); }}
        role='button'
        tabIndex={0}
        style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
      >
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-36 rounded bg-white/10" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-20 rounded-xl bg-white/10" />
            <div className="h-20 rounded-xl bg-white/10" />
            <div className="h-20 rounded-xl bg-white/10" />
            <div className="h-20 rounded-xl bg-white/10" />
          </div>
        </div>
      </section>
    );
  }

  if (fetchError || !stateData) {
    return (
      <section
        data-testid="guard-totals-card"
        className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5"
        onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; onOpenInsights?.(); }}
        role='button'
        tabIndex={0}
      >
        <h3 className="text-sm font-semibold text-red-400">{t('profile.guardTotals.loadError', { defaultValue: 'Could not load your guardian record' })}</h3>
        <button
          onClick={retry}
          className="mt-3 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/30 cursor-pointer"
        >
          {t('common.retry', { defaultValue: 'Retry' })}
        </button>
      </section>
    );
  }

  const totals = toTotals(stateData, statsData);
  const rank = getGuardRank(totals);
  const nextRank = getNextGuardRankProgress(rank, totals);
  const rankNames: Record<string, string> = {
    sprout: t('profile.guardRank.sprout', { defaultValue: 'Sprout' }),
    trainee: t('profile.guardRank.trainee', { defaultValue: 'Trainee Guardian' }),
    companion: t('profile.guardRank.companion', { defaultValue: 'Companion Guardian' }),
    partner: t('profile.guardRank.partner', { defaultValue: 'Guardian Partner' }),
    ambassador: t('profile.guardRank.ambassador', { defaultValue: 'Guardian Ambassador' }),
    honoree: t('profile.guardRank.honoree', { defaultValue: 'Honored Guardian Officer' }),
  };
  const rankName = rankNames[rank.id];
  const nextRankName = nextRank ? rankNames[nextRank.next.id] : '';

  // 荣誉非羞耻: 全新用户不出 0/0/0 空表 — 正面引导第一次守护
  if (isGuardTotalsEmpty(totals)) {
    return (
      <section
        data-testid="guard-totals-card"
        className="relative overflow-hidden rounded-2xl p-5"
        onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; onOpenInsights?.(); }}
        role='button'
        tabIndex={0}
        style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
      >
        <div
          className="absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-[70px]"
          style={{ background: 'rgba(74, 222, 128, 0.14)' }}
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col items-center py-4 text-center">
          <Sprout className="h-8 w-8 text-emerald-300" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-bold text-[#f0faf2]">
            {t('profile.guardTotals.emptyTitle', { defaultValue: 'Your first guard will begin here' })}
          </h3>
          <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-[#88a292]">
            {t('profile.guardTotals.emptyBody', { defaultValue: 'Every impulse Symy helps you pause grows into this green record.' })}
          </p>
        </div>
      </section>
    );
  }

  const stageName = t(`buddy.growthStage.${totals.growthStage}`, { defaultValue: totals.growthStage });
  const moneyLineVisible = totals.totalSaved > 0;

  return (
    <>
      <section
        data-testid="guard-totals-card"
        className="relative overflow-hidden rounded-2xl p-5"
        onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; onOpenInsights?.(); }}
        role='button'
        tabIndex={0}
        style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
      >
        {/* 顶部柔光 — 延续日报/周报的松绿视觉 */}
        <div
          className="absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-[70px]"
          style={{ background: 'rgba(74, 222, 128, 0.14)' }}
          aria-hidden="true"
        />

        {/* 称号区 + 晒入口 (面子分享; 导出图无金额 — 见文件头面子/里子注释) */}
        <div className="relative z-10 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#f0faf2]">{t('profile.guardTotals.title', { defaultValue: 'Guardian record' })}</h3>
              <p className="text-[10px] text-[#88a292]">{t('profile.guardTotals.subtitle', { defaultValue: 'Since day one' })}</p>
            </div>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            data-testid="guard-totals-share"
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20 cursor-pointer"
          >
            <Share2 className="h-3 w-3" aria-hidden="true" />
            {t('profile.guardTotals.shareBtn', { defaultValue: 'Share' })}
          </button>
        </div>

        {/* 守护者段位 — 三因子任一达标即晋段; 纯荣誉字段永不携带金额 */}
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5">
          <span className="text-base leading-none" aria-hidden="true">{rank.emoji}</span>
          <span className="text-[13px] font-semibold text-[#f0faf2]">
            {rankName}
            <span className="ml-1.5 text-[10px] font-semibold text-emerald-300/80">
              {t('profile.guardRank.levelPrefix', { defaultValue: 'Rank' })} L{rank.level}
            </span>
          </span>
          <span className="text-[10px] text-[#88a292]">
            {t('profile.guardRank.rankLine', { count: totals.totalIntercepts, defaultValue: '{count}+ intercepts stopped' })}
          </span>
          {nextRank && (
            <span className="text-[10px] text-emerald-200/80">
              {nextRank.remainingLabelKey === 'profile.guardRank.nextHintIntercepts'
                ? t('profile.guardRank.nextHintIntercepts', { count: nextRank.remainingCount, title: nextRankName, defaultValue: 'Only {count} more intercepts to become {title}' })
                : nextRank.remainingLabelKey === 'profile.guardRank.nextHintDays'
                  ? t('profile.guardRank.nextHintDays', { count: nextRank.remainingCount, title: nextRankName, defaultValue: 'Only {count} more guard days to become {title}' })
                  : t('profile.guardRank.nextHintBadges', { count: nextRank.remainingCount, title: nextRankName, defaultValue: 'Only {count} more badges to become {title}' })}
            </span>
          )}
        </div>

        {/* 段位进度区 — 纯面子可视化, 三通道晋升引力 (batch33-a 交付物) */}
        {totals && (
          <GuardRankProgressSection
            totalIntercepts={totals.totalIntercepts}
            streakDays={totals.streakDays}
            badgesUnlocked={totals.badgesUnlocked}
            rank={rank}
          />
        )}

        {/* 面子区 — 2x2 荣誉数字; streak 为 0 时守护格出陪伴文案, 不出 0 */}
        <div className="relative z-10 mt-4 grid grid-cols-2 gap-2.5">
          <TotalsCell
            testId="guard-totals-intercepts"
            icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            value={totals.totalIntercepts}
            label={t('profile.guardTotals.interceptsTotal', { defaultValue: 'Total intercepts' })}
          />
          {totals.streakDays > 0 ? (
            <TotalsCell
              testId="guard-totals-streak"
              icon={<Flame className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />}
              value={totals.streakDays}
              suffix={t('common.days', { defaultValue: 'days' })}
              label={t('profile.guardTotals.streakDays', { defaultValue: 'Guard streak' })}
            />
          ) : (
            <div className="flex flex-col justify-center rounded-xl border border-emerald-300/15 bg-white/5 p-3">
              <Flame className="h-3.5 w-3.5 text-emerald-300/80" aria-hidden="true" />
              <p className="mt-1.5 text-[13px] font-semibold leading-snug text-[#a7f3d0]">
                {t('profile.guardTotals.streakFresh', { defaultValue: 'Your next guard starts a fresh count' })}
              </p>
            </div>
          )}
          <TotalsCell
            testId="guard-totals-longest"
            icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
            value={totals.longestStreak}
            suffix={t('common.days', { defaultValue: 'days' })}
            label={t('profile.guardTotals.longestStreak', { defaultValue: 'Longest streak' })}
          />
          <TotalsCell
            testId="guard-totals-badges"
            icon={<Medal className="h-3.5 w-3.5" aria-hidden="true" />}
            value={`${totals.badgesUnlocked}/${totals.badgesTotal}`}
            label={t('profile.guardTotals.badges', { defaultValue: 'Green badges' })}
          />
        </div>

        {/* 小象当前阶段 — 全宽阶段条 (成长感) */}
        <div className="relative z-10 mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-white/5 px-3 py-2.5">
          <span className="text-base leading-none" aria-hidden="true">{STAGE_EMOJI[totals.growthStage]}</span>
          <span className="text-[13px] font-semibold text-[#f0faf2]" data-testid="guard-totals-stage">{stageName}</span>
          <span className="ml-auto text-[10px] text-[#88a292]">{t('profile.guardTotals.stageLabel', { defaultValue: "Symy's stage" })}</span>
        </div>

        <GuardEvidenceSection events={evidenceEvents} />

        {/* 里子区 — 金额只在 app 内这个次级区可见; 永不进分享/导出管道 */}
        <div className="relative z-10 mt-4 border-t border-white/10 pt-3">
          {moneyLineVisible ? (
            <p className="text-xs text-[#b6cbbe]" data-testid="guard-totals-money-line">
              {t('profile.guardTotals.moneyLine', { amount: moneyToFreedomLabel(totals.totalSaved, locale, hourlyRate), defaultValue: `Every guard has won you back ${moneyToFreedomLabel(totals.totalSaved, locale, hourlyRate)}` })}
            </p>
          ) : null}
          <p className="mt-1 flex items-center gap-1 text-[10px] text-[#88a292]">
            <EyeOff className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {t('profile.guardTotals.moneyNote', { defaultValue: 'The money stays in your pocket — it is never sent anywhere.' })}
          </p>
        </div>
      </section>

      {/* 晒入口 — 复用 share-modal 既有模板 (streak 默认 + milestone 可切)。
          传参中唯一金额是 medal.savedCents, share-modal 渲染前换算成自由小时,
          导出图永无钱数 (面子/里子铁律, 见文件头)。 */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        medal={{ itemTitle: '', savedCents: Math.round(totals.totalSaved * 100) }}
        streakDays={totals.streakDays}
        interceptCount={totals.totalIntercepts}
        initialTemplate="streak"
      />
    </>
  );
}
