/**
 * useMilestoneToasts — Milestone toast notifications
 *
 * 提取自 src/app/page.tsx (Round 101 拆分)
 * 监听 buddyState 变化, 在达到里程碑 ($5k/$10k saved, 7/30-day streak, 50/100 challenges) 时显示 toast.
 *
 * 🔧 架构优化 Round 58: i18n 修复 (Finding 4)
 *    旧代码: 6 个 hardcoded 英文 toast 消息, 中文用户看到英文
 *    修复: 通过 t() 函数本地化, 添加 i18n keys
 */

'use client';

import { useEffect, useRef } from 'react';
import type { BuddyState } from '@/types/buddy-state';
import type { useI18n } from '@/i18n/provider';

interface UseMilestoneToastsOptions {
  isDemo: boolean;
  buddyState: BuddyState | null;
  onToast: (toast: { message: string; type: 'success' | 'info' }) => void;
  t: ReturnType<typeof useI18n>['t'];
}

export function useMilestoneToasts({ isDemo, buddyState, onToast, t }: UseMilestoneToastsOptions) {
  const prevMilestoneRef = useRef<{ totalSaved: number; streak: number; challenges: number; funds?: Record<string, boolean> }>({ totalSaved: 0, streak: 0, challenges: 0 });

  useEffect(() => {
    if (isDemo || !buddyState) return;
    const prev = prevMilestoneRef.current;
    const curr = {
      totalSaved: buddyState.totalSaved || 0,
      streak: buddyState.streak || 0,
      challenges: buddyState.challengesCompleted || 0,
      funds: {} as Record<string, boolean>,
    };

    // $10,000 saved milestone
    if (prev.totalSaved < 10000 && curr.totalSaved >= 10000) {
      onToast({ message: t('milestone.saved10k', { defaultValue: '🎉 $10,000 won back! Keep guarding.' }), type: 'success' });
    }
    // $5,000 saved milestone
    else if (prev.totalSaved < 5000 && curr.totalSaved >= 5000) {
      onToast({ message: t('milestone.saved5k', { defaultValue: '🎉 $5,000 won back! Keep guarding.' }), type: 'success' });
    }
    // 7-day streak
    if (prev.streak < 7 && curr.streak >= 7) {
      onToast({ message: t('milestone.streak7', { defaultValue: "🔥 7-day streak! You're on fire!" }), type: 'success' });
      // 🔧 E1 fix: 7-day streak 时引导邀请好友 (batch7-b: 守护叙事, 数字与 invitation-reward.ts 一致)
      onToast({ message: t('milestone.invitePrompt', { defaultValue: '💡 Invite a friend to become a green guardian — you both get +30 days Premium when they finish their first challenge!' }), type: 'info' });
    }
    // 30-day streak
    else if (prev.streak < 30 && curr.streak >= 30) {
      onToast({ message: t('milestone.streak30', { defaultValue: '🔥 30 days of guarding! Incredible consistency.' }), type: 'success' });
    }
    // 50 challenges completed
    if (prev.challenges < 50 && curr.challenges >= 50) {
      onToast({ message: t('milestone.challenges50', { defaultValue: "🏆 50 challenges completed! You're a pro!" }), type: 'success' });
      // 🔧 E1 fix: 50 challenges 时引导邀请好友 (batch7-b: 守护叙事, 数字与 invitation-reward.ts 一致)
      onToast({ message: t('milestone.invitePrompt50', { defaultValue: '💡 Invite a friend as a green guardian — +30 days Premium each. Every 5 friends → extra +30 days. At 10 → +60 days + Guardian Ambassador badge.' }), type: 'info' });
    }
    // 100 challenges completed
    else if (prev.challenges < 100 && curr.challenges >= 100) {
      onToast({ message: t('milestone.challenges100', { defaultValue: '🏆 100 times you saw it. Legendary clarity.' }), type: 'success' });
    }

    // 🔧 P4-9 fix (2026-07-20): Dream Fund 完成庆祝 toast
    //   当某个基金从未完成变为完成时, 显示庆祝 toast
    const prevFunds = prevMilestoneRef.current.funds || {};
    const currFunds: Record<string, boolean> = {};
    if (buddyState.dreamFunds) {
      for (const fund of buddyState.dreamFunds) {
        const isCompleted = fund.target > 0 && fund.current >= fund.target;
        currFunds[fund.id] = isCompleted;
        if (isCompleted && !prevFunds[fund.id]) {
          // 这个基金刚完成
          onToast({
            message: t('milestone.dreamFundCompleted', {
              name: fund.name,
              emoji: fund.emoji || '🎯',
              defaultValue: '🎉 {emoji} {name} goal reached! You did it.',
            }),
            type: 'success',
          });
        }
      }
    }
    curr.funds = currFunds;

    prevMilestoneRef.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [isDemo, buddyState?.totalSaved, buddyState?.streak, buddyState?.challengesCompleted, buddyState?.dreamFunds, onToast, t]);
}
