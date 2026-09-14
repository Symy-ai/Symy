/**
 * Buddy Tab Constants & Helper Components
 *
 * 提取自 src/components/buddy-tab.tsx (Round 82 拆分)
 * 包含: HealthEvent type, HEALTH_EVENT_ICONS, HEALTH_CONFIG, BatteryIcon,
 *       BADGE_INFO, ALL_BADGES, BadgeChip, formatTimeAgo
 */

'use client';

import { memo } from 'react';
import {
  Zap, Heart, Shield, Trophy, Sparkles, Battery, BatteryCharging,
  BatteryLow, BatteryWarning, Skull, TrendingDown, TrendingUp, RotateCcw, Activity,
} from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { BuddyHealth } from '@/types/buddy-state';

// ====== Health Event Types ======
// eslint-disable-next-line no-duplicate-imports
import type { HealthEvent } from '@/types/buddy-state';
export type { HealthEvent };

// HealthEvent type moved to @/types/buddy-state

export const HEALTH_EVENT_ICONS: Record<string, { icon: React.ReactNode; color: string; labelKey: string }> = {
  // batch3-b: impulse_damage 红脸→琥珀警示 — 荣誉非羞耻, 提示代价但不羞辱
  impulse_damage: { icon: <TrendingDown className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-500/15', labelKey: 'buddy.healthEventTypes.impulse_damage' },
  impulse_confessed: { icon: <Heart className="w-3.5 h-3.5" />, color: 'text-orange-400 bg-orange-500/15', labelKey: 'buddy.healthEventTypes.impulse_confessed' },
  mindful_recovery: { icon: <Shield className="w-3.5 h-3.5" />, color: 'text-green-400 bg-green-500/15', labelKey: 'buddy.healthEventTypes.mindful_recovery' },
  // batch3-b: 正向事件统一绿色系 (green/emerald/teal), 与小象松绿语言一致
  refund_boost: { icon: <RotateCcw className="w-3.5 h-3.5" />, color: 'text-emerald-400 bg-emerald-500/15', labelKey: 'buddy.healthEventTypes.refund_boost' },
  challenge_reward: { icon: <Trophy className="w-3.5 h-3.5" />, color: 'text-teal-400 bg-teal-500/15', labelKey: 'buddy.healthEventTypes.challenge_won' },
  // 🔧 PM-NEW-51 fix: challenge_completed 用 🛡️ (与 Recent Activity 一致), 而非 🏆
  challenge_completed: { icon: <Shield className="w-3.5 h-3.5" />, color: 'text-cyan-400 bg-cyan-500/15', labelKey: 'buddy.healthEventTypes.challenge_completed' },
  passive_recovery: { icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'text-emerald-400 bg-emerald-500/15', labelKey: 'buddy.healthEventTypes.daily_recovery' },
  drain: { icon: <Zap className="w-3.5 h-3.5" />, color: 'text-gray-400 bg-gray-500/15', labelKey: 'buddy.healthEventTypes.natural_drain' },
  revive: { icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-purple-400 bg-purple-500/15', labelKey: 'buddy.healthEventTypes.revived' },
  manual_adjustment: { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-blue-400 bg-blue-500/15', labelKey: 'buddy.healthEventTypes.adjustment' },
};

export const HEALTH_CONFIG: Record<BuddyHealth, {
  color: string;
  glowColor: string;
  bgGradient: string;
  statusTextKey: string;
  statusEmoji: string;
  ringColor: string;
  particleColor: string;
  eyeColor: string;
  bodyColor: string;
  neonGradient: string;
}> = {
  thriving: {
    color: 'text-green-400',
    glowColor: 'shadow-green-400/50',
    bgGradient: 'from-green-500/20 via-emerald-500/10 to-teal-500/5',
    statusTextKey: 'buddy.healthStatus.thriving',
    statusEmoji: '✨',
    ringColor: 'stroke-green-400',
    particleColor: 'bg-green-400',
    eyeColor: 'fill-green-300',
    bodyColor: 'fill-green-500',
    neonGradient: 'from-green-400 to-cyan-400',
  },
  healthy: {
    color: 'text-emerald-400',
    glowColor: 'shadow-emerald-400/40',
    bgGradient: 'from-emerald-500/15 via-green-500/10 to-teal-500/5',
    statusTextKey: 'buddy.healthStatus.healthy',
    statusEmoji: '😊',
    ringColor: 'stroke-emerald-400',
    particleColor: 'bg-emerald-400',
    eyeColor: 'fill-emerald-300',
    bodyColor: 'fill-emerald-500',
    neonGradient: 'from-emerald-400 to-cyan-400',
  },
  weak: {
    color: 'text-yellow-400',
    glowColor: 'shadow-yellow-400/30',
    bgGradient: 'from-yellow-500/15 via-amber-500/10 to-orange-500/5',
    statusTextKey: 'buddy.healthStatus.weak',
    statusEmoji: '😰',
    ringColor: 'stroke-yellow-400',
    particleColor: 'bg-yellow-400',
    eyeColor: 'fill-yellow-300',
    bodyColor: 'fill-yellow-600',
    neonGradient: 'from-yellow-400 to-amber-400',
  },
  critical: {
    color: 'text-red-400',
    glowColor: 'shadow-red-400/30',
    bgGradient: 'from-red-500/15 via-rose-500/10 to-orange-500/5',
    statusTextKey: 'buddy.healthStatus.critical',
    statusEmoji: '😱',
    ringColor: 'stroke-red-400',
    particleColor: 'bg-red-400',
    eyeColor: 'fill-red-300',
    bodyColor: 'fill-red-600',
    neonGradient: 'from-red-400 to-rose-400',
  },
  dormant: {
    color: 'text-gray-500',
    glowColor: 'shadow-gray-500/20',
    bgGradient: 'from-gray-600/15 via-gray-700/10 to-gray-800/5',
    statusTextKey: 'buddy.healthStatus.dormant',
    statusEmoji: '💀',
    ringColor: 'stroke-gray-600',
    particleColor: 'bg-gray-600',
    eyeColor: 'fill-gray-600',
    bodyColor: 'fill-gray-700',
    neonGradient: 'from-gray-500 to-gray-600',
  },
};

// 🔧 TECH-DEBT-C: React.memo — 纯展示，health 是稳定 enum 值
export const BatteryIcon = memo(function BatteryIcon({ health }: { health: BuddyHealth }) {
  switch (health) {
    case 'thriving': return <BatteryCharging className="w-4 h-4 text-green-400" />;
    case 'healthy': return <Battery className="w-4 h-4 text-emerald-400" />;
    case 'weak': return <BatteryWarning className="w-4 h-4 text-yellow-400" />;
    case 'critical': return <BatteryLow className="w-4 h-4 text-red-400" />;
    case 'dormant': return <Skull className="w-4 h-4 text-gray-500" />;
  }
});

// ====== Badge Chip ======
// batch3-c: 绿色荣誉库 — 旧章 emoji 从旧省钱口径 (💰🔥⚔️🏗️) 换成绿色意象, id 不变保持已解锁用户兼容
export const BADGE_INFO: Record<string, { labelKey: string; emoji: string; color: string }> = {
  impulse_shield: { labelKey: 'buddy.badgeNames.impulse_shield', emoji: '🛡️', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
  first_save: { labelKey: 'buddy.badgeNames.first_save', emoji: '🌾', color: 'bg-green-500/10 border-green-500/20 text-green-400' },
  streak_7: { labelKey: 'buddy.badgeNames.streak_7', emoji: '🍃', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  boss_slayer: { labelKey: 'buddy.badgeNames.boss_slayer', emoji: '🦉', color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
  rational_lawyer: { labelKey: 'buddy.badgeNames.rational_lawyer', emoji: '⚖️', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
  dream_builder: { labelKey: 'buddy.badgeNames.dream_builder', emoji: '🪴', color: 'bg-pink-500/10 border-pink-500/20 text-pink-400' },
  // batch3-c: light_bearer 此前只有 i18n 文案、未进注册表 — AI 授予后会显示成灰色 🏆, 补注册
  light_bearer: { labelKey: 'buddy.badgeNames.light_bearer', emoji: '🕯️', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  green_guardian_10: { labelKey: 'buddy.badgeNames.green_guardian_10', emoji: '🌿', color: 'bg-green-500/10 border-green-500/20 text-green-400' },
  streak_guardian_30: { labelKey: 'buddy.badgeNames.streak_guardian_30', emoji: '🍀', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  quiet_night_master: { labelKey: 'buddy.badgeNames.quiet_night_master', emoji: '🌙', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' },
  money_meadow_100: { labelKey: 'buddy.badgeNames.money_meadow_100', emoji: '🌱', color: 'bg-lime-500/10 border-lime-500/20 text-lime-400' },
  money_forest_500: { labelKey: 'buddy.badgeNames.money_forest_500', emoji: '🌳', color: 'bg-green-500/10 border-green-500/20 text-green-400' },
  first_dream_funded: { labelKey: 'buddy.badgeNames.first_dream_funded', emoji: '🎁', color: 'bg-teal-500/10 border-teal-500/20 text-teal-400' },
  dream_gardener_3: { labelKey: 'buddy.badgeNames.dream_gardener_3', emoji: '🌷', color: 'bg-pink-500/10 border-pink-500/20 text-pink-400' },
};

export interface BadgeDef {
  id: string;
  emoji: string;
  color: string;
  /** 🔧 P1-11 fix: 解锁条件描述 (显示给用户) */
  unlockConditionKey: string;
  /** 🔧 P1-11 fix: 进度目标值 (用于 progress bar) */
  progressTarget: number;
  /** 🔧 P1-11 fix: 进度计算类型 — 决定如何从 buddyState 计算当前进度 */
  progressType: 'challenge_wins' | 'total_saves' | 'streak_days' | 'big_truth' | 'clear_mind_streak' | 'dream_fund_count' | 'dream_fund_funded';
  /** batch3-c: 收藏面板分组 — 守护 / 成长 / 里程碑 (纯前端分组, 不影响数据) */
  group: BadgeGroup;
}

/** batch3-c: 勋章分组 — 标题文案在 i18n buddy.badgeGroups.* */
export type BadgeGroup = 'guardian' | 'growth' | 'milestone';

/** batch3-c: 分组渲染顺序 — 收藏面板按此排序 (与 ALL_BADGES 内顺序解耦) */
export const BADGE_GROUP_ORDER: BadgeGroup[] = ['guardian', 'growth', 'milestone'];

/**
 * batch3-c: 绿色荣誉库 — 14 枚, 每枚绑定真实行为数据 (拦截次数/省钱/连续天数/基金),
 * AI 授予型 (big_truth / clear_mind_streak) 由 Symy 识别真实行为后经 add_badge 发放。
 * 旧 6 枚 id/progressTarget/progressType 不变, 只绿色化视觉与文案, 已解锁用户数据兼容。
 */
export const ALL_BADGES: BadgeDef[] = [
  // ===== 守护勋章 — 看见并守住选择 =====
  {
    id: 'impulse_shield',
    emoji: '🛡️',
    color: 'bg-cyan-500/10 border-cyan-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.impulse_shield',
    progressTarget: 1,
    progressType: 'challenge_wins',
    group: 'guardian',
  },
  {
    id: 'green_guardian_10',
    emoji: '🌿',
    color: 'bg-green-500/10 border-green-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.green_guardian_10',
    progressTarget: 10,
    progressType: 'challenge_wins',
    group: 'guardian',
  },
  {
    id: 'streak_7',
    emoji: '🍃',
    color: 'bg-emerald-500/10 border-emerald-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.streak_7',
    progressTarget: 7,
    progressType: 'streak_days',
    group: 'guardian',
  },
  {
    id: 'streak_guardian_30',
    emoji: '🍀',
    color: 'bg-emerald-500/10 border-emerald-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.streak_guardian_30',
    progressTarget: 30,
    progressType: 'streak_days',
    group: 'guardian',
  },
  {
    id: 'quiet_night_master',
    emoji: '🌙',
    color: 'bg-indigo-500/10 border-indigo-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.quiet_night_master',
    progressTarget: 7,
    progressType: 'clear_mind_streak',
    group: 'guardian',
  },
  // ===== 成长勋章 — 留下的钱与长出的基金 =====
  {
    id: 'first_save',
    emoji: '🌾',
    color: 'bg-green-500/10 border-green-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.first_save',
    progressTarget: 1,
    progressType: 'total_saves',
    group: 'growth',
  },
  {
    id: 'money_meadow_100',
    emoji: '🌱',
    color: 'bg-lime-500/10 border-lime-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.money_meadow_100',
    progressTarget: 100,
    progressType: 'total_saves',
    group: 'growth',
  },
  {
    id: 'money_forest_500',
    emoji: '🌳',
    color: 'bg-green-500/10 border-green-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.money_forest_500',
    progressTarget: 500,
    progressType: 'total_saves',
    group: 'growth',
  },
  {
    id: 'first_dream_funded',
    emoji: '🎁',
    color: 'bg-teal-500/10 border-teal-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.first_dream_funded',
    progressTarget: 1,
    progressType: 'dream_fund_funded',
    group: 'growth',
  },
  {
    id: 'dream_builder',
    emoji: '🪴',
    color: 'bg-pink-500/10 border-pink-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.dream_builder',
    progressTarget: 1,
    progressType: 'dream_fund_count',
    group: 'growth',
  },
  {
    id: 'dream_gardener_3',
    emoji: '🌷',
    color: 'bg-pink-500/10 border-pink-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.dream_gardener_3',
    progressTarget: 3,
    progressType: 'dream_fund_count',
    group: 'growth',
  },
  // ===== 里程碑勋章 — 被看见的关键时刻 =====
  {
    id: 'boss_slayer',
    emoji: '🦉',
    color: 'bg-purple-500/10 border-purple-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.boss_slayer',
    progressTarget: 1,
    progressType: 'big_truth',
    group: 'milestone',
  },
  {
    id: 'rational_lawyer',
    emoji: '⚖️',
    color: 'bg-cyan-500/10 border-cyan-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.rational_lawyer',
    progressTarget: 3,
    progressType: 'clear_mind_streak',
    group: 'milestone',
  },
  {
    id: 'light_bearer',
    emoji: '🕯️',
    color: 'bg-amber-500/10 border-amber-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.light_bearer',
    progressTarget: 1,
    progressType: 'big_truth',
    group: 'milestone',
  },
];

// 🔧 TECH-DEBT-C: React.memo — 纯展示，badge 是稳定 string
export const BadgeChip = memo(function BadgeChip({ badge }: { badge: string }) {
  const { t } = useI18n();
  const info = BADGE_INFO[badge] || { labelKey: `buddy.badgeNames.${badge}`, emoji: '🏆', color: 'bg-gray-500/10 border-gray-500/20 text-text-secondary' };
  // 🔧 Bug C fix: 对未知 badge 显示友好名称，而不是 i18n key
  const label = t(info.labelKey);
  const displayLabel = label === info.labelKey
    ? badge.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) // fallback: 人类可读名称
    : label;
  return (
    <div className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${info.color} backdrop-blur-sm`}>
      <span className="text-xs">{info.emoji}</span>
      <span className="text-[10px] font-medium">{displayLabel}</span>
    </div>
  );
});

// ====== Time Ago Helper ======
export function formatTimeAgo(date: Date, t: (key: string, values?: Record<string, string | number>) => string): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return t('common.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('common.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('common.daysAgo', { n: days });
  return date.toLocaleDateString();
}
