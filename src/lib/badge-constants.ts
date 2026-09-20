/**
 * Badge constants — pure data, no React hooks or browser APIs.
 *
 * Owned by src/lib so architecture guard is happy;
 * components/buddy/constants.tsx re-exports / builds on top of these.
 */

export type BadgeGroup = 'guardian' | 'growth' | 'milestone';

export interface BadgeDef {
  id: string;
  name?: string;
  emoji: string;
  color: string;
  /** Unlock condition description (displayed to users) */
  unlockConditionKey: string;
  /** Target value for progress bars */
  progressTarget: number;
  /** How progress is calculated from buddyState */
  progressType: 'challenge_wins' | 'total_saves' | 'streak_days' | 'big_truth' | 'clear_mind_streak' | 'dream_fund_count' | 'dream_fund_funded' | 'invited_count';
  /** Collection panel group */
  group: BadgeGroup;
}

export const BADGE_GROUP_ORDER: BadgeGroup[] = ['guardian', 'growth', 'milestone'];

export const ALL_BADGES: BadgeDef[] = [
  {
    id: 'referral_master',
    emoji: '🌳',
    color: 'bg-emerald-500/10 border-emerald-500/20',
    unlockConditionKey: 'buddy.badgeUnlock.referral_master',
    progressTarget: 10,
    progressType: 'invited_count',
    group: 'guardian',
  },
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
