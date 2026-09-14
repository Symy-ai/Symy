/**
 * CommunityChallengeCard — 单个社区挑战卡片
 *
 * 状态:
 * - 未加入: 显示 [加入挑战] 按钮
 * - 已加入 (active): 显示进度条 + [每日签到] 按钮
 * - 已完成 (completed): 显示 ✓ 完成状态
 */

'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { CommunityChallenge } from '../hooks/use-community-challenges';

interface Props {
  challenge: CommunityChallenge;
  isDemo: boolean;
  onJoin: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCheckin: (id: string) => Promise<{ success: boolean; currentDay?: number; status?: string; error?: string }>;
  actionLoading: boolean;
  t: ReturnType<typeof useI18n>['t'];
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok_shop: '📱',
  livestream: '🎥',
  instagram: '📷',
  amazon: '📦',
  shein: '👗',
};

export function CommunityChallengeCard({ challenge, isDemo, onJoin, onCheckin, actionLoading, t }: Props) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleJoin = async () => {
    if (isDemo) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const result = await onJoin(challenge.id);
    if (!result.success && result.error) {
      setErrorMsg(
        typeof result.error === 'string' && result.error.includes('already')
          ? t('defense.alreadyJoined', { defaultValue: 'Already joined this challenge!' })
          : t('defense.joinFailed', { defaultValue: 'Failed to join. Try again.' })
      );
    } else if (result.success) {
      setSuccessMsg(t('defense.joinedSuccess', { defaultValue: '✓ Joined! Check in daily to maintain your streak.' }));
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleCheckin = async () => {
    if (isDemo) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const result = await onCheckin(challenge.id);
    if (!result.success && result.error) {
      setErrorMsg(t('defense.checkinFailed', { defaultValue: 'Check-in failed. Try again.' }));
    } else if (result.success) {
      setSuccessMsg(t('defense.checkinSuccess', { day: result.currentDay || '?', defaultValue: '✓ Checked in! Day {day} complete.' }));
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const isJoined = challenge.myStatus === 'active' || challenge.myStatus === 'completed';
  const isCompleted = challenge.myStatus === 'completed';
  const today = new Date().toISOString().split('T')[0];
  const checkedInToday = challenge.myLastCheckinDate === today;
  const myProgress = challenge.totalDays > 0 ? Math.round((challenge.myCurrentDay / challenge.totalDays) * 100) : 0;
  const daysLeft = challenge.totalDays - challenge.currentDay;
  const platformIcon = challenge.platform ? (PLATFORM_ICONS[challenge.platform] || '🎯') : '🎯';

  // 🔧 Round 107 fix: 判断挑战是否真的结束
  //   旧代码: daysLeft <= 0 → 显示 "Challenge ended"
  //   问题: Day 7/7 但 end_date 还在明天 → 挑战仍在进行, 不应说 "ended"
  //   修复: 只有 end_date < NOW() 才算真正结束 (challengeActuallyEnded)
  //         daysLeft <= 0 但 end_date >= NOW() → 仍可 join, 显示 "Last day! Join now"
  const now = new Date();
  const endDate = new Date(challenge.endDate);
  const startDate = new Date(challenge.startDate);
  const challengeActuallyEnded = endDate.getTime() < now.getTime();
  const isLastDay = daysLeft <= 0 && !challengeActuallyEnded;
  // 🔧 Round 107: 挑战未开始 (start_date > NOW()) → 显示 "Starts tomorrow!"
  const isUpcoming = startDate.getTime() > now.getTime();

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isCompleted
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : isJoined
        ? 'bg-cyan-500/5 border-cyan-500/20'
        : 'bg-glass-fill/50 border-glass-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{platformIcon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary truncate">
              {challenge.titleKey ? t(challenge.titleKey, { defaultValue: challenge.title }) : challenge.title}
            </p>
            {challenge.description && (
              <p className="text-[10px] text-text-tertiary truncate">
                {challenge.titleKey
                  ? t(challenge.titleKey + 'Desc', { defaultValue: challenge.description || '' })
                  : challenge.description}
              </p>
            )}
          </div>
        </div>
        {isCompleted && (
          <span className="text-xs font-bold text-emerald-400 flex-shrink-0">✓</span>
        )}
      </div>

      {/* 🔧 PM fix (2026-07-17): 删除 Community progress 显示
          原因: 新用户看到社区进度已到 Day 5/7，觉得参加没意义
          修复: 只显示个人进度 (加入后)，社区进度不再显示
          保留 Participants (参与者数量) 作为社交证明 */}

      {/* Participants */}
      <div className="flex items-center gap-3 mb-3 text-[10px] text-text-tertiary">
        <span>👥 {challenge.totalParticipants} {t('defense.joined', { defaultValue: 'joined' })}</span>
        <span>🔥 {challenge.activeParticipants} {t('defense.active', { defaultValue: 'active' })}</span>
        {/* 🔧 v5 PM fix: completed=0 时显示鼓励文案而非 "0 completed" (避免无力感) */}
        {/* 🔧 P4-6 fix (2026-07-20): "Be the first to finish" 暴露冷启动, 改为 "X 人正在挑战" */}
        {challenge.completedParticipants > 0 ? (
          <span>✅ {challenge.completedParticipants} {t('defense.completed', { defaultValue: 'completed' })}</span>
        ) : challenge.activeParticipants > 0 ? (
          <span className="text-cyan-400/70">🔥 {challenge.activeParticipants} {t('defense.peopleChallenging', { defaultValue: 'people challenging now' })}</span>
        ) : (
          <span className="text-cyan-400/70">🏆 {t('defense.beFirst', { defaultValue: 'Be the first to finish!' })}</span>
        )}
      </div>

      {/* My progress (if joined) */}
      {isJoined && !isCompleted && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-cyan-400 font-medium">
              {t('defense.myProgress', { defaultValue: 'My progress' })}
            </span>
            <span className="text-[10px] text-cyan-400 font-medium">
              {t('defense.daySlashTotal', { current: challenge.myCurrentDay, total: challenge.totalDays, defaultValue: `Day ${challenge.myCurrentDay}/${challenge.totalDays}` })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-glass-fill overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${myProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <p className="text-xs text-red-400 mb-2 bg-red-500/10 rounded-lg px-2 py-1.5 text-center">{errorMsg}</p>
      )}

      {/* Success message */}
      {successMsg && (
        <p className="text-xs text-green-400 mb-2 bg-green-500/10 rounded-lg px-2 py-1.5 text-center animate-in fade-in slide-in-from-bottom-1 duration-300">{successMsg}</p>
      )}

      {/* Action button */}
      {/* 🔧 Round 107 fix: Day 7/7 但 end_date 还在明天 → 仍可 join, 显示 "Last day! Join now" */}
      {!isJoined && !challengeActuallyEnded && (
        <button
          onClick={handleJoin}
          disabled={actionLoading || isDemo}
          className="w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDemo
            ? t('defense.signUpToJoin', { defaultValue: 'Sign up to join' })
            : actionLoading ? '...' : (
            isUpcoming
              ? t('defense.joinUpcoming', { defaultValue: '🚀 Join (starts tomorrow)' })
              : isLastDay
                ? t('defense.joinLastDay', { defaultValue: '🔥 Last day! Join now' })
                : t('defense.joinChallenge', { defaultValue: 'Join Challenge' })
          )}
        </button>
      )}
      {!isJoined && challengeActuallyEnded && (
        <div className="text-center py-2">
          <span className="text-xs text-text-tertiary">
            {t('defense.challengeEnded', { defaultValue: 'Challenge ended — new ones coming soon!' })}
          </span>
        </div>
      )}
      {isJoined && !isCompleted && (
        <button
          onClick={handleCheckin}
          disabled={actionLoading || checkedInToday || isUpcoming || challengeActuallyEnded}
          className={`w-full py-2 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] ${
            checkedInToday
              ? 'bg-emerald-500/10 text-emerald-400/60 border-emerald-500/20 cursor-default'
              : isUpcoming
                ? 'bg-glass-fill text-text-tertiary border-glass-border cursor-not-allowed'
                : challengeActuallyEnded
                  ? 'bg-glass-fill text-text-tertiary border-glass-border cursor-not-allowed'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer'
          } disabled:opacity-50`}
        >
          {actionLoading ? '...' : checkedInToday
            ? t('defense.checkedInToday', { defaultValue: '✓ Checked in today' })
            : isUpcoming
              ? t('defense.checkinLocked', { defaultValue: '⏳ Check-in opens when challenge starts' })
              : challengeActuallyEnded
                ? t('defense.challengeEndedShort', { defaultValue: 'Challenge ended' })
                : t('defense.checkin', { defaultValue: '📍 Check in today' })}
        </button>
      )}
      {isCompleted && (
        <div className="text-center py-2 animate-in fade-in zoom-in duration-500">
          <div className="text-2xl mb-1 animate-bounce">🎉</div>
          <span className="text-xs font-bold text-emerald-400">
            {t('defense.challengeCompleted', { defaultValue: '🎉 Challenge completed!' })}
          </span>
        </div>
      )}
    </div>
  );
}
