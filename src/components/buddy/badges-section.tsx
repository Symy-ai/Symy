/**
 * Badges Section — Display earned badges + detail panel
 *
 * 提取自 src/components/buddy-tab.tsx (Round 82 拆分)
 * 包含: 徽章横向滚动列表 + "View All" 详情面板 (全屏 overlay)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Share2, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { BadgeChip, ALL_BADGES, BADGE_GROUP_ORDER, type BadgeDef, type BadgeGroup } from './constants';
import { isDreamFundAchieved } from './dream-achievement';
import { DEFAULT_HOURLY_RATE, moneyToHours } from '@/lib/freedom-time';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import type { BuddyState } from '@/types/buddy-state';
import { ShareModal } from '@/components/share/share-modal';
import { getBadgeGoal, setBadgeGoal } from '@/lib/badge-goal';
import { BadgeGoalBanner } from '@/components/buddy/badge-goal-banner';

interface BadgesSectionProps {
  badges: string[];
  /** 🔧 P1-11 fix: buddyState 用于计算成就进度 */
  buddyState?: BuddyState | null;
}

/** batch3-c: 分组标题 i18n key */
const BADGE_GROUP_TITLE_KEYS: Record<BadgeGroup, string> = {
  guardian: 'buddy.badgeGroups.guardian',
  growth: 'buddy.badgeGroups.growth',
  milestone: 'buddy.badgeGroups.milestone',
};

/**
 * 🔧 P1-11 fix: 计算成就当前进度
 * 根据 badge.progressType 从 buddyState 中提取对应数值
 * 🔧 Round 97 P1-3 fix: 修正字段映射 — challengeWins→challengesCompleted, totalSaves→totalSaved
 * 🔧 2026-07-21 audit fix (agent-1 P2-3): big_truth/clear_mind_streak 无后端追踪字段,
 *   之前返回 0 导致 rational_lawyer (clear_mind_streak, target 3) 永久卡在 0% 进度条。
 *   这些徽章是 "AI 识别授予型" (通过 add_badge 工具由 AI 授予, 非计数指标),
 *   不应显示数字进度条。新增 isProgressTrackable 区分, UI 据此隐藏进度条。
 * batch3-c: 导出供单测使用; 新增 dream_fund_funded 分支 — 读现有 dreamFunds[].current,
 *   零 DDL, 区分"建了空基金"与"真把钱存进去"。
 * batch106-b (BP p19): 新增 won_back_hours — totalSaved 按用户时薪换算赢回小时
 *   (向下取整, 进度显示与达标判定同口径); dream_fund_completed — 复用
 *   isDreamFundAchieved 权威完成语义 (current ≥ target 且 target > 0, 排除默认储蓄池),
 *   "建了基金"不算完成。hourlyRate 缺省回落默认时薪 — 无数据诚实归 0, 徽章不亮。
 */
const UNTRACKABLE_PROGRESS_TYPES = new Set(['big_truth', 'clear_mind_streak']);

export function isProgressTrackable(progressType: BadgeDef['progressType']): boolean {
  return !UNTRACKABLE_PROGRESS_TYPES.has(progressType);
}

export function calcBadgeProgress(
  badge: BadgeDef,
  buddyState?: BuddyState | null,
  hourlyRate: number = DEFAULT_HOURLY_RATE
): number {
  if (!buddyState) return 0;
  switch (badge.progressType) {
    case 'challenge_wins':
      return buddyState.challengesCompleted || 0;
    case 'total_saves':
      return buddyState.totalSaved || 0;
    case 'streak_days':
      return buddyState.streak || 0;
    case 'big_truth':
    case 'clear_mind_streak':
      // 无后端追踪字段 — 徽章由 AI add_badge 授予, 非计数进度 (isProgressTrackable=false → UI 不渲染进度条)
      return 0;
    case 'dream_fund_count':
      // dreamFundCount 可从 dreamFunds 数组长度计算
      return buddyState.dreamFunds?.length || 0;
    case 'dream_fund_funded':
      // batch3-c: 有实际存入金额的基金数 (current > 0) — 第一笔钱进基金才算数
      return buddyState.dreamFunds?.filter((f) => (f.current || 0) > 0).length || 0;
    case 'won_back_hours':
      // batch106-b: 面子只认时间 — totalSaved → 赢回小时 (向下取整, 99.6h 显示 99/100 不虚标)
      return Math.floor(moneyToHours(buddyState.totalSaved || 0, hourlyRate));
    case 'dream_fund_completed':
      // batch106-b: 走到 target 才算完成 — isDreamFundAchieved 是全站权威完成语义
      return buddyState.dreamFunds?.filter(isDreamFundAchieved).length || 0;
    default:
      return 0;
  }
}

/**
 * batch3-c: 收藏面板单枚勋章卡片 — 从 BadgesSection 内联 map 体抽出, 便于按分组渲染
 * (进度达标也算 earned — Round 97 P1-3 行为保持不变)
 * batch4-a: earned 勋章出现「晒」入口 (onShare) — 唤起 share-modal 的 badge 模板;
 * 未解锁不出入口 (荣誉非羞耻 — 未获得者看到的是解锁条件的正面引导)。
 */
function BadgeCollectionCard({
  badge,
  badges,
  buddyState,
  hourlyRate,
  onShare,
  activeGoalId,
  onSetGoal,
}: {
  badge: BadgeDef;
  badges: string[];
  buddyState?: BuddyState | null;
  /** 用户时薪 — won_back_hours 判定用 (缺省回落默认时薪) */
  hourlyRate: number;
  onShare?: (badge: BadgeDef) => void;
  activeGoalId?: string | null;
  onSetGoal?: (badgeId: string) => void;
}) {
  const { t } = useI18n();
  const currentProgress = calcBadgeProgress(badge, buddyState, hourlyRate);
  const target = badge.progressTarget;
  const progressMet = currentProgress >= target && target > 0;
  const earned = badges.includes(badge.id) || progressMet;
  const progressPct = Math.min(100, Math.round((currentProgress / target) * 100));
  const unlockCondition = t(badge.unlockConditionKey, { defaultValue: '' });
  const isGoal = activeGoalId === badge.id;
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
        earned ? `${badge.color} border-opacity-40` : 'bg-glass-fill border-glass-border opacity-70'
      }`}
    >
      <span className="text-2xl flex-shrink-0 mt-0.5">{badge.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {(() => {
            // 🔧 Bug C fix: 对未知 badge 显示友好名称
            const labelKey = `buddy.badgeNames.${badge.id}`;
            const label = t(labelKey);
            const displayLabel = label === labelKey
              ? badge.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              : label;
            return (
              <span className={`text-sm font-semibold ${earned ? 'text-text-primary' : 'text-text-secondary'}`}>{displayLabel}</span>
            );
          })()}
          {isGoal && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/30">
              {t('buddy.badgeGoal.goalChip', { defaultValue: 'My goal' })}
            </span>
          )}
          {earned && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-medium">{t('buddy.earned')}</span>}
          {/* batch4-a: 「晒」入口 — 只对已获得者出现; 分享图严格面子 (金额只留在 app 内) */}
          {earned && onShare && (
            <button
              type="button"
              onClick={() => onShare(badge)}
              data-testid={`badge-share-${badge.id}`}
              className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/20 cursor-pointer"
            >
              <Share2 className="h-3 w-3" aria-hidden="true" />
              {t('share.badgeCard.shareEntry', { defaultValue: 'Share' })}
            </button>
          )}
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">{t(`buddy.badgeDescriptions.${badge.id}`)}</p>
        {/* 🔧 P1-11 fix: 解锁条件 + 进度条 */}
        {unlockCondition && (
          <p className="text-[10px] text-text-tertiary mt-1 italic">
            {t('buddy.unlockCondition', { defaultValue: 'Unlock:' })} {unlockCondition}
          </p>
        )}
        {!earned && target > 1 && isProgressTrackable(badge.progressType) && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-1">
              <span>{t('buddy.progress', { defaultValue: 'Progress' })}</span>
              <span>{Math.min(currentProgress, target)}/{target}</span>
            </div>
            <div className="h-1.5 bg-glass-fill rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500/60 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
        {!earned && !(target > 1 && isProgressTrackable(badge.progressType)) && (
          <p className="text-[10px] text-text-tertiary mt-1">
            {t('buddy.notUnlockedYet', { defaultValue: 'Not unlocked yet' })}
          </p>
        )}
        {!earned && isProgressTrackable(badge.progressType) && onSetGoal && (
          <button
            type="button"
            onClick={() => onSetGoal(badge.id)}
            data-testid={`set-goal-${badge.id}`}
            className="mt-2 w-full py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-[10px] font-semibold transition-colors hover:bg-emerald-500/20 cursor-pointer"
          >
            {isGoal
              ? t('buddy.badgeGoal.activeGoal', { defaultValue: 'This is your guard goal' })
              : t('buddy.badgeGoal.setGoal', { defaultValue: 'Set as my guard goal' })}
          </button>
        )}
      </div>
    </div>
  );
}

export function BadgesSection({ badges, buddyState }: BadgesSectionProps) {
  const { t } = useI18n();
  // batch106-b: 用户时薪 — Money Forest (won_back_hours) 进度与达标判定按真实时薪换算;
  // 与 share-card-modal 同源 hook, Profile 改时薪后此处即时跟随
  const { hourlyRate } = useHourlyRate(false);
  const [showBadgeDetail, setShowBadgeDetail] = useState(false);
  // batch4-a: 当前晒的勋章 — 非空时渲染 ShareModal (badge 模板, 面子-only)
  const [shareBadge, setShareBadge] = useState<BadgeDef | null>(null);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);

  useEffect(() => {
    setActiveGoalId(getBadgeGoal());
  }, []);

  // 🔧 Bug 20 fix: Escape 关闭 Badge 详情面板 (与 Challenge modal 一致)
  const handleCloseBadgeDetail = useCallback(() => setShowBadgeDetail(false), []);
  useEffect(() => {
    if (!showBadgeDetail) return;
    const handleEsc = (e: KeyboardEvent) => {
      // 晒卡弹层打开时 Escape 归 ShareModal 管 — 不连带关掉收藏面板
      if (shareBadge) return;
      if (e.key === 'Escape') handleCloseBadgeDetail();
    };
    window.addEventListener('keydown', handleEsc);
    // Round 105 P0-1 fix: 不再操作 body overflow — CompanionDetailModal 已锁定 body
    //   旧代码 cleanup 会把 body overflow 恢复为 '', 但 modal 仍打开, 导致背景可滚动
    //   现在由 modal 统一管理 body scroll lock, BadgesSection 只管自己的 ESC
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showBadgeDetail, shareBadge, handleCloseBadgeDetail]);

  return (
    <>
      {/* ====== Badges ====== */}
      <div className="relative z-10 px-4 py-2 pb-24">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-secondary">{t('buddy.badges')}</h3>
          {badges.length > 0 && (
            <button
              onClick={() => setShowBadgeDetail(true)}
              className="text-xs text-text-tertiary flex items-center gap-0.5 hover:text-text-secondary transition-colors"
            >
              {t('common.viewAll')} <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {badges.length > 0 ? (
          <div className="flex gap-2 pb-1 custom-scrollbar-horizontal badge-scroll-container">
            {badges.slice(0, 3).map((badge) => (
              <BadgeChip key={badge} badge={badge} />
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-3 text-center">
            <p className="text-xs text-text-tertiary">{t('buddy.noBadges')}</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {t('buddy.earnBadgesHint')}
            </p>
          </div>
        )}
      </div>

      <BadgeGoalBanner
        buddyState={{ badges }}
        onShare={(b) => setShareBadge(ALL_BADGES.find((x) => x.id === b.badge.id) ?? null)}
      />

      {activeGoalId && (() => {
        const def = ALL_BADGES.find((b) => b.id === activeGoalId);
        if (!def) return null;
        const currentProgress = calcBadgeProgress(def, buddyState, hourlyRate);
        const target = def.progressTarget;
        const progressPct = target > 0 ? Math.min(100, Math.round((currentProgress / target) * 100)) : 0;
        return (
          <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden="true">{def.emoji}</span>
                <span className="text-[11px] font-semibold text-text-primary">
                  {t('buddy.badgeGoal.goalBarTitle', { badge: t(`buddy.badgeNames.${def.id}`, { defaultValue: def.id.replace(/_/g, ' ') }) })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBadgeGoal(null)}
                className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                {t('buddy.badgeGoal.clearGoal', { defaultValue: 'Clear goal' })}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-1">
              <span>{t('buddy.progress', { defaultValue: 'Progress' })}</span>
              <span>{Math.min(currentProgress, target)}/{target}</span>
            </div>
            <div className="h-1.5 bg-glass-fill rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/70 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        );
      })()}

      <BadgeGoalBanner
        buddyState={{ badges }}
        onShare={(b) => setShareBadge(ALL_BADGES.find((x) => x.id === b.badge.id) ?? null)}
      />

      {/* Badge Detail Panel */}
      {/* 🔧 Round 97 P0-1 fix: 用 createPortal 渲染到 document.body + z-[400]
          确保在 CompanionDetailModal (z-300) 之上可见 */}
      {showBadgeDetail && createPortal(
        <div
          className="fixed inset-0 z-[400] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="marks-collection-title"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseBadgeDetail} />
          <div className="relative w-full max-w-[430px] bg-surface-1 border-t border-glass-border rounded-t-2xl px-4 pt-4 pb-8 max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="marks-collection-title" className="text-base font-bold text-text-primary">{t('buddy.badgesCollection')}</h3>
              <button
                onClick={handleCloseBadgeDetail}
                aria-label={t('common.close', { defaultValue: 'Close' })}
                className="p-1 rounded-lg hover:bg-glass-hover text-text-secondary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-text-tertiary mb-4">{t('buddy.earnBadgesDesc')}</p>
            {/* batch3-c: 按 守护 / 成长 / 里程碑 分组渲染 (BADGE_GROUP_ORDER 决定顺序) */}
            <div className="space-y-5">
              {BADGE_GROUP_ORDER.map((group) => {
                const groupBadges = ALL_BADGES.filter((b) => b.group === group);
                if (groupBadges.length === 0) return null;
                return (
                  <section key={group} aria-label={t(BADGE_GROUP_TITLE_KEYS[group])}>
                    <h4 className="text-xs font-semibold text-text-tertiary mb-2">{t(BADGE_GROUP_TITLE_KEYS[group])}</h4>
                    <div className="space-y-3">
                      {groupBadges.map((b) => (
                        <BadgeCollectionCard
                          key={b.id}
                          badge={b}
                          badges={badges}
                          buddyState={buddyState}
                          hourlyRate={hourlyRate}
                          onShare={setShareBadge}
                          activeGoalId={activeGoalId}
                          onSetGoal={(id) => setBadgeGoal(id === activeGoalId ? null : id)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* batch4-a: 勋章晒卡弹层 — badge 模板直接选中; medal 由现有 buddyState 合成
          (savedCents = 累计留下的钱, 只喂 app 内私密提示行与自由小时换算, 永不进分享图)。
          z-[500]: 盖过收藏面板 (z-[400]) 与 CompanionDetailModal (z-[300]) */}
      {shareBadge && (
        <ShareModal
          key={shareBadge.id}
          open
          onClose={() => setShareBadge(null)}
          zIndexClass="z-[500]"
          initialTemplate="badge"
          medal={{
            itemTitle: '',
            savedCents: Math.max(0, Math.round((buddyState?.totalSaved ?? 0) * 100)),
            date: new Date().toISOString(),
          }}
          streakDays={buddyState?.streak ?? 0}
          interceptCount={buddyState?.challengesCompleted}
          badgeCard={{ badge: shareBadge, progressValue: calcBadgeProgress(shareBadge, buddyState, hourlyRate) }}
        />
      )}
    </>
  );
}
