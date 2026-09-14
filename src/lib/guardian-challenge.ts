/**
 * Guardian Challenge — pure types, no React/browser imports.
 *
 * Owned by src/lib so architecture guard is happy;
 * components/buddy/challenge-definitions.ts re-exports / builds on top of these.
 */

export type ChallengePeriod = 'daily' | 'weekly' | 'all_time';

export type ChallengeTier = 'starter' | 'regular' | 'hard';

export type ChallengeProgressSource =
  | 'today_see_it'
  | 'today_chat'
  | 'week_see_it'
  | 'week_streak_days'
  | 'week_money_left'
  | 'total_see_it'
  | 'total_money_left'
  | 'dream_funds_funded';

export interface GuardianChallenge {
  id: string;
  period: ChallengePeriod;
  /** i18n key 段: buddy.challengeLib.challenges.<id>.* (title/desc/done) */
  titleKey: string;
  descKey: string;
  /** 完成态守护称号 key */
  doneTitleKey: string;
  progressSource: ChallengeProgressSource;
  /** 进度目标 (行为计数或美元, 与 progressSource 同单位) */
  target: number;
  /** 难度分层 — modal 分组展示, 新手默认折叠 hard 区。 */
  tier?: ChallengeTier;
  /** 完成荣誉 — 必须是 constants.tsx ALL_BADGES 已注册 id (展示用, 不发放) */
  rewardBadgeId: string;
}
