/**
 * Buddy Tab Constants & Helper Components
 *
 * 提取自 src/components/buddy-tab.tsx (Round 82 拆分)
 * 包含: HealthEvent type, HEALTH_EVENT_ICONS, HEALTH_CONFIG, BatteryIcon,
 *       BADGE_INFO, BadgeChip, formatTimeAgo (ALL_BADGES 等注册表 re-export 自 lib/badge-constants)
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
  referral_master: { labelKey: 'buddy.badgeNames.referral_master', emoji: '🌳', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
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

// ====== Badge registry ======
// batch106-b: 注册表单一来源收敛到 lib/badge-constants (纯数据归 lib, 本文件只留 UI 层)。
// 此前两份 ALL_BADGES 手工同步, lib 头注释声称的 re-export 从未成立 — 现在补上, 判定口径改一处即全局生效。
export { ALL_BADGES, BADGE_GROUP_ORDER } from '@/lib/badge-constants';
export type { BadgeDef, BadgeGroup } from '@/lib/badge-constants';

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
