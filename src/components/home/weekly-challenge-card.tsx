'use client';

/**
 * batch21-b: Home 主屏「本周守护挑战」卡 — 挑战管道第一次接上主屏。
 *
 * 面子: pickWeeklyFeatureChallenge 确定性周轮换 (guardianWeekNumber 纯函数, 同一周全端同一条)
 *       — 荣誉框架, 禁羞耻/禁焦虑文案。难度 chip 复用 buddy.challengeLib.tiers.* 现成键。
 * 里子: /api/challenge/active 直读挑战管道 — 进行中展示正在守护的金额 (active.amount,
 *       挑战管道自带字段, 不发明新记账口径) + moneyToFreedomLabel 官方自由时间换算行。
 *
 * 三态:
 *   active === null       → 无进行中挑战: 挑战名 + 守护叙事 + 「开始守护」CTA
 *   active 有值           → 守护进行中: item_name + 正在守护金额 + ≈赢回时间 + 「去看看」
 *   active === undefined  → 加载中/拉取失败: 整卡静默隐藏 (挑战入口是锦上添花, 绝不让主屏挂错误角标)
 *
 * 本卡不走 useGreenPref — 挑战入口是产品核心, 非绿色装饰, greenPref off 时仍然显示。
 */

import { Shield } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import {
  CHALLENGE_TIER_LABEL_KEYS,
  type GuardianChallenge,
} from '@/components/buddy/challenge-definitions';

/** /api/challenge/active 返回的挑战子集 (与 buddy-tab 消费形状一致) */
export interface ActiveChallengeSnapshot {
  id: string;
  item_name: string;
  amount: number;
}

interface WeeklyChallengeCardProps {
  /** pickWeeklyFeatureChallenge(new Date()) — 确定性周轮换, 本周全端同一条 */
  weekly: GuardianChallenge;
  /** undefined = 加载中/静默失败 (整卡隐藏); null = 无进行中挑战 (CTA 态) */
  active?: ActiveChallengeSnapshot | null;
  /** 导航到 chat 开挑战 (复用 onNavigateChat({type:'challenge'}) 现有管道, 零新路由) */
  onStart: (challenge: GuardianChallenge) => void;
}

export function WeeklyChallengeCard({ weekly, active, onStart }: WeeklyChallengeCardProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();

  // 三态之三: undefined (加载中/静默失败) — 不是关键路径, 整卡不渲染
  if (active === undefined) return null;

  const tierKey = weekly.tier ? CHALLENGE_TIER_LABEL_KEYS[weekly.tier] : null;

  if (active === null) {
    // 三态之一: 无进行中挑战 — 荣誉框架 CTA
    return (
      <div
        className="glass-card rounded-xl p-4 border border-emerald-500/20"
        data-testid="weekly-challenge-card"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Shield className="w-4 h-4" />
            <span className="text-xs font-medium">{t('home.weeklyChallenge.title')}</span>
          </div>
          {tierKey && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 whitespace-nowrap">
              {t(tierKey)}
            </span>
          )}
        </div>
        <p className="text-sm text-text-primary font-medium mt-2">{t(weekly.titleKey)}</p>
        <p className="text-xs text-text-tertiary leading-relaxed mt-1">{t(weekly.descKey)}</p>
        <button
          type="button"
          onClick={() => onStart(weekly)}
          className="mt-3 w-full py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors cursor-pointer active:opacity-70"
        >
          {t('home.weeklyChallenge.cta')}
        </button>
      </div>
    );
  }

  // 三态之二: 进行中 — 里子行: 正在守护的钱即挑战管道真实金额, 官方 helper 换算自由时间
  const freedom = moneyToFreedomLabel(active.amount, locale, hourlyRate);
  return (
    <div
      className="glass-card rounded-xl p-4 border border-emerald-500/20"
      data-testid="weekly-challenge-card"
    >
      <div className="flex items-center gap-1.5 text-emerald-400">
        <Shield className="w-4 h-4" />
        <span className="text-xs font-medium">{t('home.weeklyChallenge.activeTitle')}</span>
      </div>
      <p className="text-sm text-text-primary font-medium mt-2">{active.item_name}</p>
      <p className="text-xs text-text-secondary mt-1">
        {t('home.weeklyChallenge.activeMoneyLeft')}
        <span className="ml-1" data-testid="weekly-challenge-amount">
          ${active.amount.toFixed(2)}
        </span>
      </p>
      <p className="text-xs text-emerald-400 mt-0.5" data-testid="weekly-challenge-freedom">
        {t('home.weeklyChallenge.freedomHint', { time: freedom })}
      </p>
      <button
        type="button"
        onClick={() => onStart(weekly)}
        className="mt-3 w-full py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors cursor-pointer active:opacity-70"
      >
        {t('home.weeklyChallenge.activeGoTo')}
      </button>
    </div>
  );
}
