'use client';

/**
 * InviteCard — 邀请好友卡片 (batch7-b 绿色守护叙事)
 *
 * 🐘 batch7-b: 邀请叙事从"送 Premium"改为"邀请朋友当绿色守护者"。
 *    奖励模型一字不动 (SSOT: src/lib/invitation-reward.ts):
 *    - 每邀 1 人完成首个挑战, 双方各 +30 天 Premium
 *    - 每满 5 人, referrer 额外 +30 天
 *    - 满 10 人, 当次共 +60 天 + referral_master 徽章 (发放逻辑不动)
 *    本组件只做叙事层: 守护称号梯度是纯展示映射 (不发 DB 记录、零 DDL),
 *    阈值 (5/10) 对齐 invitation-reward.ts 的 MILESTONE_EVERY / MILESTONE_BADGE_AT。
 *    - 显示专属邀请链接 symy.ai/?ref=USER_CODE
 *    - 复制链接按钮
 *    - 邀请统计 (总邀请数 + 已开始共同守护数) + 守护称号梯度
 *    - loading / error 态保留 (75f75a2)
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, Sprout, Copy, Check, Users, PawPrint, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { getGuardRank } from '@/lib/guard-rank';
import { ShareModal } from '@/components/share/share-modal';
import type { InterceptMedalData } from '@/types/intercept-medal';

/**
 * 守护称号梯度 — 纯展示层映射 (batch7-b)。
 * 0 人=见习守护者, 1 人=同行守护者, 5 人=守护搭档, 10 人=守护大使。
 * 阈值对齐 invitation-reward.ts (每 5 人里程碑 / 10 人徽章), 不发新 DB 记录。
 */
export interface GuardianTier {
  key: string;
  defaultValue: string;
  /** 下一称号: 还差多少人与称号 key */
  next?: { at: number; key: string; defaultValue: string };
}

export function resolveGuardianTier(completed: number): GuardianTier {
  if (completed >= 10) {
    return { key: 'profile.inviteTier10', defaultValue: 'Guardian Ambassador' };
  }
  if (completed >= 5) {
    return {
      key: 'profile.inviteTier5',
      defaultValue: 'Guardian Partner',
      next: { at: 10, key: 'profile.inviteTier10', defaultValue: 'Guardian Ambassador' },
    };
  }
  if (completed >= 1) {
    return {
      key: 'profile.inviteTier1',
      defaultValue: 'Fellow Guardian',
      next: { at: 5, key: 'profile.inviteTier5', defaultValue: 'Guardian Partner' },
    };
  }
  return {
    key: 'profile.inviteTierTrainee',
    defaultValue: 'Trainee Guardian',
    next: { at: 1, key: 'profile.inviteTier1', defaultValue: 'Fellow Guardian' },
  };
}

/** /api/buddy/state 返回中晒战绩用到的字段 (其余忽略, 映射同 guard-totals-card)。
 *  ⚠️ wire shape 是 { buddyState: {...} } 包裹 (同 use-buddy-state-rq / token-row 的读法) */
interface BuddyStateLite {
  streak: number;
  badges: string[] | null;
  totalSaved: number;
}

/** /api/challenge/stats 返回中晒战绩用到的字段 */
interface ChallengeStatsLite {
  totalPassed: number;
}

/** 晒战绩快照 — 纯荣誉字段 (rank/次数/天数) + 金额只换算成 cents 供 modal 转小时, 不上图 */
export interface GuardianShareData {
  guardRank: { name: string; level: number; emoji: string };
  streakDays: number;
  interceptCount: number;
  totalSavedCents: number;
}

export function InviteCard() {
  const { t } = useI18n();
  const [inviteLink, setInviteLink] = useState<string>('');
  const [stats, setStats] = useState<{ totalInvited: number; completed: number }>({ totalInvited: 0, completed: 0 });
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // batch24-c: 晒战绩 (守护战绩一图流) — 按需拉三管道数据再开 share-modal
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [guardianData, setGuardianData] = useState<GuardianShareData | null>(null);
  const [guardianLoading, setGuardianLoading] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);
  // rescue-0907-inflight: 邀请分享弹层
  const [shareOpen, setShareOpen] = useState(false);
  const [refCode, setRefCode] = useState('');

  const loadInviteLink = useCallback(async () => {
    try {
      const data = await apiFetch<{
        refCode: string;
        inviteLink: string;
        stats: { totalInvited: number; completed: number };
      }>('/api/invite/link');
      const refCode = data.refCode;
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://symy.ai';
      setRefCode(refCode);
      setInviteLink(`${currentOrigin}/?ref=${refCode}`);
      setStats(data.stats);
    } catch (err) {
      logger.warn('[InviteCard] Failed to fetch invite link:', err);
      setError(t('profile.inviteLoadError', { defaultValue: "Couldn't load invite info — tap to retry." }));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    loadInviteLink();
    return () => {};
  }, [loadInviteLink]);

  // 🔧 batch7-b fix: 手动重试与初始加载走同一套清理 (原先 retry 成功后 error 态不清理, 错误卡不消失)
  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    loadInviteLink();
  }, [loadInviteLink]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      // 🔧 ARCH fix Round 78 P2-13: Button text changes to "Copied!" — clear visual feedback
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback: 用旧 API
      logger.warn('[InviteCard] Clipboard API failed:', err);
      try {
        const textarea = document.createElement('textarea');
        textarea.value = inviteLink;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      // safe to ignore: non-critical background operation, error already logged
      } catch (e) {
                    // safe to ignore: non-critical background operation, error already logged
        logger.error('[InviteCard] Copy failed:', e);
      }
    }
  }, [inviteLink]);

  const shareMedal: InterceptMedalData = { itemTitle: '', savedCents: 0 };

  // 守护称号 (纯展示映射, batch7-b) — 阈值 5/10 对齐 invitation-reward.ts
  const tier = resolveGuardianTier(stats.completed);

  /**
   * batch24-c 晒战绩: 并行拉 /api/buddy/state + /api/challenge/stats →
   * getGuardRank 等阶 (名字用既有 profile.guardRank.* 键) → 打开 share-modal
   * (guardian-stats 模板)。失败出小胶囊 + 重试, 不出半空图。
   */
  const handleShareRecord = useCallback(async () => {
    if (guardianLoading) return;
    setGuardianLoading(true);
    setGuardianError(null);
    try {
      const [stateRes, challengeStats] = await Promise.all([
        apiFetch<{ buddyState: BuddyStateLite | null }>('/api/buddy/state'),
        apiFetch<ChallengeStatsLite>('/api/challenge/stats'),
      ]);
      const buddy = stateRes?.buddyState;
      const totalIntercepts = Math.max(0, Math.floor(challengeStats?.totalPassed) || 0);
      const streakDays = Math.max(0, Math.floor(buddy?.streak ?? 0) || 0);
      const badgesUnlocked = (buddy?.badges || []).length;
      const rank = getGuardRank({ totalIntercepts, streakDays, badgesUnlocked });
      const rankNames: Record<string, string> = {
        sprout: t('profile.guardRank.sprout', { defaultValue: 'Sprout' }),
        trainee: t('profile.guardRank.trainee', { defaultValue: 'Trainee Guardian' }),
        companion: t('profile.guardRank.companion', { defaultValue: 'Companion Guardian' }),
        partner: t('profile.guardRank.partner', { defaultValue: 'Guardian Partner' }),
        ambassador: t('profile.guardRank.ambassador', { defaultValue: 'Guardian Ambassador' }),
        honoree: t('profile.guardRank.honoree', { defaultValue: 'Honored Guardian Officer' }),
      };
      setGuardianData({
        guardRank: { name: rankNames[rank.id] ?? rank.emoji, level: rank.level, emoji: rank.emoji },
        streakDays,
        interceptCount: totalIntercepts,
        totalSavedCents: Math.round((Math.max(0, Number(buddy?.totalSaved) || 0)) * 100),
      });
      setGuardianOpen(true);
    } catch (err) {
      logger.warn('[InviteCard] Failed to load guardian record:', err instanceof Error ? err.message : String(err));
      setGuardianError(t('share.guardianStats.loadError', { defaultValue: "Couldn't load your record — tap to retry." }));
    } finally {
      setGuardianLoading(false);
    }
  }, [guardianLoading, t]);

  if (isLoading) {
    return (
      <div className="w-full bg-gradient-to-br from-emerald-500/8 to-teal-500/5 dark:from-emerald-500/12 dark:to-teal-500/8 border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-glass-fill rounded" />
          <div className="h-4 w-full bg-glass-fill rounded" />
          <div className="h-10 w-full bg-glass-fill rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-gradient-to-br from-emerald-500/8 to-teal-500/5 dark:from-emerald-500/12 dark:to-teal-500/8 border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl p-5">
        <p className="text-xs text-red-400 mb-2">{error}</p>
        <button
          onClick={handleRetry}
          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-500/20"
        >
          {t('common.retry', { defaultValue: 'Retry' })}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="w-full bg-gradient-to-br from-emerald-500/8 to-teal-500/5 dark:from-emerald-500/12 dark:to-teal-500/8 border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl p-5 transition-all">
      {/* 标题 */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-300 leading-tight">
            {t('profile.inviteFriends', { defaultValue: 'Invite a friend to become a green guardian' })}
          </h3>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {t('profile.inviteFriendsDesc', { defaultValue: 'One more guardian, a gentler planet' })}
          </p>
        </div>
      </div>

      {/* 守护奖励说明 — 数字与 invitation-reward.ts 口径一致 (+30 天 / 5 人 / 10 人 / 双向) */}
      <div className="mb-3 p-3 rounded-xl bg-glass-fill/50 dark:bg-glass-fill/30 border border-glass-border/50">
        <div className="flex items-start gap-2">
          <Sprout className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-text-secondary leading-relaxed">
            {t('profile.inviteRewardDesc', { defaultValue: 'You guard together — Symy covers the time. When a friend completes their first challenge, you both get +30 days of Premium. Every 5 friends → an extra +30 days. At 10 friends → +60 days that step + the Guardian Ambassador badge.' })}
          </p>
        </div>
      </div>

      {/* 🔧 PM-P2-3 fix: 阶梯奖励说明 (batch7-b: 守护里程碑叙事, 数字不变) */}
      <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
        {/* 🔧 PM-#23 fix: 移除 uppercase (非警示类用 Sentence case) */}
        <p className="text-[10px] font-bold text-emerald-500 tracking-wider mb-2">
          {t('profile.inviteMilestoneTitle', { defaultValue: '🎯 Guardian milestones' })}
        </p>
        <div className="space-y-1.5 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${stats.totalInvited >= 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-glass-fill text-text-tertiary'}`}>{stats.totalInvited >= 1 ? '✓' : '1'}</span>
            <span>{t('profile.inviteMilestone1', { defaultValue: '1 friend completes their first challenge → +30 days Premium for both' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${stats.totalInvited >= 5 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-glass-fill text-text-tertiary'}`}>{stats.totalInvited >= 5 ? '✓' : '5'}</span>
            <span>{t('profile.inviteMilestone5', { defaultValue: '5 companions along the way → extra +30 days Premium' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${stats.totalInvited >= 10 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-glass-fill text-text-tertiary'}`}>{stats.totalInvited >= 10 ? '✓' : '10'}</span>
            <span>{t('profile.inviteMilestone10', { defaultValue: '10 guardians assembled → +60 days Premium + Guardian Ambassador badge' })}</span>
          </div>
        </div>
      </div>

      {/* 邀请链接 + 复制按钮 */}
      {/* 🔧 P1-1 fix (2026-07-11): Copy 按钮被遮挡 — 加 relative z-10 确保点击区域在最上层 */}
      <div className="flex gap-2 mb-3 relative z-10">
        <div className={`flex-1 px-3 py-2 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-xs font-mono truncate flex items-center ${!inviteLink ? 'text-text-tertiary italic' : ''}`}>
          {inviteLink || t('profile.inviteLinkLoading', { defaultValue: 'Generating…' })}
        </div>
        <button
          onClick={handleCopy}
          disabled={!inviteLink}
          // 🔧 P1-1 fix: relative z-20 确保按钮在最上层, 不被同级或父级元素遮挡
          className={`relative z-20 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${
            copied
              ? 'bg-emerald-500 hover:bg-emerald-400'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied
            ? t('profile.inviteCopied', { defaultValue: 'Copied' })
            : t('profile.inviteCopy', { defaultValue: 'Copy' })}
        </button>
        {/* batch24-c: 晒战绩 — 一键生成守护战绩图 (share-modal guardian-stats 模板) */}
        <button
          onClick={handleShareRecord}
          disabled={guardianLoading}
          data-testid="guardian-share-btn"
          className="relative z-20 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer select-none hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Share2 className="w-3.5 h-3.5" />
          {guardianLoading
            ? t('share.guardianStats.generating', { defaultValue: 'Creating…' })
            : t('share.guardianStats.btn', { defaultValue: 'Share record' })}
        </button>
        {/* rescue-0907-inflight: 邀请分享弹层 — 分享邀请链接 */}
        <button
          onClick={() => setShareOpen(true)}
          disabled={!refCode}
          className="relative z-20 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 transition-all active:scale-[0.98] cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Share2 className="w-3.5 h-3.5" />
          {t('profile.inviteShare', { defaultValue: 'Share invite' })}
        </button>
      </div>

      {/* batch24-c: 晒战绩取数失败 — 小胶囊 + 重试 (约定不用大弹窗, 不出半空图) */}
      {guardianError && (
        <div
          className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5"
          data-testid="guardian-share-error"
        >
          <p className="flex-1 text-[11px] text-red-400">{guardianError}</p>
          <button
            onClick={handleShareRecord}
            className="flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/20 cursor-pointer"
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}

      {/* 🔧 P1-10 fix (2026-07-11): Copy 成功 toast 反馈 — 位置 fixed top, 2s 自动消失 */}
      {copied && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-xl bg-emerald-500/90 text-white text-xs font-medium shadow-lg backdrop-blur-sm animate-in slide-in-from-top fade-in duration-300 pointer-events-none">
          {t('profile.inviteCopySuccess', { defaultValue: '✅ Guardian link copied — go invite your friend!' })}
        </div>
      )}
      {refCode && !guardianError && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          medal={shareMedal}
          inviteCard={{ refCode, completedCount: stats.completed }}
          initialTemplate="invite"
        />
      )}

      {/* 邀请统计 + 守护称号梯度 (batch7-b: 称号纯展示, 阈值对齐 invitation-reward.ts) */}
      {/* 🔧 PM-P2-7 fix: 0 时显示 "Be the first" 引导, 有数据才显示数字 */}
      <div className="flex items-center gap-1.5 mb-2">
        <Shield className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
          {t(tier.key, { defaultValue: tier.defaultValue })}
        </span>
        {tier.next && (
          <span className="text-[10px] text-text-tertiary">
            {t('profile.inviteTierNext', {
              count: tier.next.at - stats.completed,
              title: t(tier.next.key, { defaultValue: tier.next.defaultValue }),
              defaultValue: `Just {count} more to reach {title}`,
            })}
          </span>
        )}
      </div>
      {stats.totalInvited === 0 ? (
        <div className="text-center py-2">
          <p className="text-xs text-text-tertiary italic">
            {t('profile.inviteBeFirst', { defaultValue: '🌱 No companions yet — be the first to bring a friend into the guard!' })}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('profile.inviteStatsTotal', { defaultValue: 'Companions invited' })}: <span className="font-bold text-text-primary">{stats.totalInvited}</span></span>
          </div>
          <div className="flex items-center gap-1.5 text-text-secondary">
            <PawPrint className="w-3.5 h-3.5 text-teal-500" />
            <span>{t('profile.inviteStatsCompleted', { defaultValue: 'Guarding together' })}: <span className="font-bold text-text-primary">{stats.completed}</span></span>
          </div>
        </div>
      )}
      </div>

      {/* batch24-c: 晒战绩弹窗 — guardian-stats 模板直开; 金额只在 medal.savedCents
          通道进 modal 换算成自由小时, 分享图永无钱数 (面子/里子铁律) */}
      {guardianData && (
        <ShareModal
          open={guardianOpen}
          onClose={() => setGuardianOpen(false)}
          medal={{ itemTitle: '', savedCents: guardianData.totalSavedCents }}
          streakDays={guardianData.streakDays}
          interceptCount={guardianData.interceptCount}
          guardRank={guardianData.guardRank}
          initialTemplate="guardian-stats"
        />
      )}
    </>
  );
}
