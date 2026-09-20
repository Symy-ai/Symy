/**
 * Guardian Challenge Definitions — 绿色守护挑战内容库 SSOT (batch4-b)
 *
 * buddy-tab 挑战改版: 从省钱/自律口径 → 绿色守护口径。
 * 面子: 完成挑战积累守护者荣誉, 完成态展示守护徽记/称号。
 * 里子: 每条挑战的进度都绑定真实行为数据管道, 详情底部展示周期内真实留下的钱。
 *
 * 数据管道 (全部已有, 零 DDL):
 *  - today_see_it  ← GET /api/challenge/limit {count}   服务端当日窗口 (getLimitWindow, UTC 4AM)
 *  - today_chat    ← useDailyTasks().chatted            localStorage 当日 key (symy_daily_tasks_*)
 *  - week_*        ← GET /api/buddy/weekly-review       过去 7 天 health_events 聚合 (真实事件)
 *  - total_*       ← buddyState.challengesCompleted / totalSaved / streak   现有持久化
 *  - dream_funds_funded ← dreamFunds.filter(current > 0)  同 calcBadgeProgress 口径
 *
 * 红线:
 *  - 禁造假进度: 数据源未知时进度为 null (UI 显示 "—"), 不显示假的 0 或示例数。
 *  - 周期只有 daily / weekly / all_time: weekly 计数器有真实管道 (weekly-review),
 *    没有"自然周重置"的持久化, 不伪装; 累计荣誉如实标 all_time。
 *  - 完成奖励只指向 constants.tsx ALL_BADGES 已注册 id 做展示 (batch3-c 战场, 只读),
 *    不新增发放逻辑 — 进度达标勋章自然点亮 (badges-section earned = progressMet)。
 *  - 文案荣誉非羞耻; 禁碳足迹数值 (与 badge 文案同一红线)。
 *
 * 话术基准: src/lib/elephant-tone.ts (熊二式温度 — 夸守护, 不审判; 具体文案走 i18n)。
 *
 * batch6-a 扩充:
 *  - 条目 9 → 17; 新条目只复用上表既有管道, 不发明新 progressSource (没有真实管道的
 *    线下行为不进库 — 禁假进度)。
 *  - tier 难度分层 (starter/regular/hard): 纯展示分组; modal 对 hard 区在新手
 *    (challengesCompleted === 0) 默认折叠 — 荣誉非羞辱。
 *  - 每周轮换位 (guardianWeekNumber / pickWeeklyFeatureChallenge): 纯函数确定性轮换,
 *    weekNumber = floor(msSinceUnixEpoch / 7天), UTC 刻度全端一致, 零服务端状态零 DDL。
 */

import type { BuddyState } from '@/types/buddy-state';
import type { ChallengePeriod, ChallengeTier, GuardianChallenge } from '@/lib/guardian-challenge';

export type { ChallengePeriod, ChallengeProgressSource, ChallengeTier, GuardianChallenge } from '@/lib/guardian-challenge';

/** /api/buddy/weekly-review 响应的挑战相关子集 (与 profile/weekly-review-card.tsx 同形状) */
export interface WeeklyGuardianSummary {
  challengesCompleted: number;
  totalSaved: number;
  streakDays: number;
  dailyBreakdown: Array<{ date: string; count: number; savedAmount: number }>;
  todayDateStr?: string;
}

/** 进度计算输入 — 全部可选; 缺哪个管道, 对应挑战进度就是 null (诚实降级) */
export interface ChallengeProgressInputs {
  /** 今日 see-it 次数 (/api/challenge/limit count); 降级/demo/未加载时 undefined */
  todaySeeItCount?: number | null;
  /** 今日已和小象对话 (dailyTasks.chatted) */
  chattedToday?: boolean;
  /** 周度回顾 (demo/未加载 = null) */
  week?: WeeklyGuardianSummary | null;
  /** 累计管道 — BuddyState 的挑战相关子集 */
  buddyState?: Pick<BuddyState, 'challengesCompleted' | 'streak' | 'totalSaved' | 'dreamFunds'> | null;
}

/**
 * 绿色守护挑战库 — batch6-a 起 17 条, 每条可指出真实数据源。
 * 里程碑条与勋章阈值重合 (见 ALL_BADGES): 完成挑战 ⇔ 勋章点亮, 展示承诺 100% 兑现。
 * 旧 9 条 (batch4-b) 的 id/progressSource/target/rewardBadgeId 冻结不变, 只补了 tier 字段。
 */
export const GUARDIAN_CHALLENGES: GuardianChallenge[] = [
  // ── 今日 (计数器: 服务端当日窗口 / localStorage 当日 key) ──
  {
    id: 'daily_green_gate',
    period: 'daily',
    titleKey: 'buddy.challengeLib.challenges.daily_green_gate.title',
    descKey: 'buddy.challengeLib.challenges.daily_green_gate.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.daily_green_gate.done',
    progressSource: 'today_see_it',
    target: 1,
    tier: 'starter',
    rewardBadgeId: 'impulse_shield',
  },
  {
    id: 'daily_elephant_chat',
    period: 'daily',
    titleKey: 'buddy.challengeLib.challenges.daily_elephant_chat.title',
    descKey: 'buddy.challengeLib.challenges.daily_elephant_chat.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.daily_elephant_chat.done',
    progressSource: 'today_chat',
    target: 1,
    tier: 'starter',
    // 对话维持守护连击 (streak 规则: 每日 ≥1 次挑战或对话) — 走向 streak 勋章, 真实
    rewardBadgeId: 'streak_7',
  },
  {
    // batch6-a: 3 次仍在免费当日上限 (5) 之内 — 可达成, 不造假
    id: 'daily_triple_gate',
    period: 'daily',
    titleKey: 'buddy.challengeLib.challenges.daily_triple_gate.title',
    descKey: 'buddy.challengeLib.challenges.daily_triple_gate.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.daily_triple_gate.done',
    progressSource: 'today_see_it',
    target: 3,
    tier: 'regular',
    rewardBadgeId: 'impulse_shield',
  },
  // ── 本周 (计数器: /api/buddy/weekly-review 过去 7 天真实事件聚合) ──
  {
    id: 'weekly_three_guards',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_three_guards.title',
    descKey: 'buddy.challengeLib.challenges.weekly_three_guards.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_three_guards.done',
    progressSource: 'week_see_it',
    target: 3,
    tier: 'regular',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    // batch6-a: 3/7 天即达成 — 比连续 7 天低门槛的起步链
    id: 'weekly_three_day_chain',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_three_day_chain.title',
    descKey: 'buddy.challengeLib.challenges.weekly_three_day_chain.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_three_day_chain.done',
    progressSource: 'week_streak_days',
    target: 3,
    tier: 'starter',
    rewardBadgeId: 'streak_7',
  },
  {
    // batch6-a: 一周 5 次真实守护 — 3 与 10 之间的常规档
    id: 'weekly_five_guards',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_five_guards.title',
    descKey: 'buddy.challengeLib.challenges.weekly_five_guards.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_five_guards.done',
    progressSource: 'week_see_it',
    target: 5,
    tier: 'regular',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    id: 'weekly_streak_keeper',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_streak_keeper.title',
    descKey: 'buddy.challengeLib.challenges.weekly_streak_keeper.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_streak_keeper.done',
    progressSource: 'week_streak_days',
    target: 7,
    tier: 'hard',
    // 周内连续 7 天 ⇔ streak_7 勋章点亮 (buddyState.streak ≥ 7)
    rewardBadgeId: 'streak_7',
  },
  {
    // batch6-a: $20 起步档 — 比 $50 低门槛的第一笔守护钱
    id: 'weekly_twenty_left',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_twenty_left.title',
    descKey: 'buddy.challengeLib.challenges.weekly_twenty_left.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_twenty_left.done',
    progressSource: 'week_money_left',
    target: 20,
    tier: 'starter',
    rewardBadgeId: 'money_meadow_100',
  },
  {
    id: 'weekly_fifty_left',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_fifty_left.title',
    descKey: 'buddy.challengeLib.challenges.weekly_fifty_left.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_fifty_left.done',
    progressSource: 'week_money_left',
    target: 50,
    tier: 'regular',
    rewardBadgeId: 'money_meadow_100',
  },
  {
    // batch6-a: $100 进阶档 — 走向 money_forest_500 的里程碑
    id: 'weekly_hundred_left',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.weekly_hundred_left.title',
    descKey: 'buddy.challengeLib.challenges.weekly_hundred_left.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.weekly_hundred_left.done',
    progressSource: 'week_money_left',
    target: 100,
    tier: 'hard',
    rewardBadgeId: 'money_forest_500',
  },
  // ── 守护之旅 (累计荣誉, 与勋章阈值重合) ──
  {
    id: 'milestone_first_guard',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_first_guard.title',
    descKey: 'buddy.challengeLib.challenges.milestone_first_guard.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_first_guard.done',
    progressSource: 'total_see_it',
    target: 1,
    tier: 'starter',
    rewardBadgeId: 'impulse_shield',
  },
  {
    // batch6-a: 旅程中点 — 1 次与 10 次之间的常规档
    id: 'milestone_five_guards',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_five_guards.title',
    descKey: 'buddy.challengeLib.challenges.milestone_five_guards.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_five_guards.done',
    progressSource: 'total_see_it',
    target: 5,
    tier: 'regular',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    id: 'milestone_green_guardian',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_green_guardian.title',
    descKey: 'buddy.challengeLib.challenges.milestone_green_guardian.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_green_guardian.done',
    progressSource: 'total_see_it',
    target: 10,
    tier: 'regular',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    id: 'milestone_money_meadow',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_money_meadow.title',
    descKey: 'buddy.challengeLib.challenges.milestone_money_meadow.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_money_meadow.done',
    progressSource: 'total_money_left',
    target: 100,
    tier: 'regular',
    rewardBadgeId: 'money_meadow_100',
  },
  {
    // batch6-a: $500 ⇔ money_forest_500 勋章阈值 — 完成即点亮, 承诺兑现
    id: 'milestone_five_hundred_left',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_five_hundred_left.title',
    descKey: 'buddy.challengeLib.challenges.milestone_five_hundred_left.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_five_hundred_left.done',
    progressSource: 'total_money_left',
    target: 500,
    tier: 'hard',
    rewardBadgeId: 'money_forest_500',
  },
  {
    // batch6-a: 3 个有真实存入的基金 — 完成即 ⊆ 已建 3 基金 ⇒ dream_gardener_3 必已点亮
    id: 'milestone_three_seeds',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_three_seeds.title',
    descKey: 'buddy.challengeLib.challenges.milestone_three_seeds.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_three_seeds.done',
    progressSource: 'dream_funds_funded',
    target: 3,
    tier: 'regular',
    rewardBadgeId: 'dream_gardener_3',
  },
  {
    id: 'milestone_first_seed',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.milestone_first_seed.title',
    descKey: 'buddy.challengeLib.challenges.milestone_first_seed.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.milestone_first_seed.done',
    progressSource: 'dream_funds_funded',
    target: 1,
    tier: 'starter',
    // 口径同 calcBadgeProgress('dream_fund_funded'): 钱真进了基金才算
    rewardBadgeId: 'first_dream_funded',
  },
  // ── batch16-b 第三期: 聪明地买 / 复用 / 长线荣誉 — 只绑定既有真实管道 ──
  {
    id: 'secondhand_first',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.secondhand_first.title',
    descKey: 'buddy.challengeLib.challenges.secondhand_first.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.secondhand_first.done',
    progressSource: 'week_see_it',
    target: 6,
    tier: 'starter',
    rewardBadgeId: 'impulse_shield',
  },
  {
    id: 'stockpile_audit',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.stockpile_audit.title',
    descKey: 'buddy.challengeLib.challenges.stockpile_audit.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.stockpile_audit.done',
    progressSource: 'week_see_it',
    target: 8,
    tier: 'starter',
    rewardBadgeId: 'money_meadow_100',
  },
  {
    id: 'repair_not_replace',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.repair_not_replace.title',
    descKey: 'buddy.challengeLib.challenges.repair_not_replace.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.repair_not_replace.done',
    progressSource: 'total_see_it',
    target: 15,
    tier: 'regular',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    id: 'thirty_day_no_dup',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.thirty_day_no_dup.title',
    descKey: 'buddy.challengeLib.challenges.thirty_day_no_dup.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.thirty_day_no_dup.done',
    progressSource: 'week_streak_days',
    target: 30,
    tier: 'hard',
    rewardBadgeId: 'streak_guardian_30',
  },
  {
    id: 'borrow_instead_buy',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.borrow_instead_buy.title',
    descKey: 'buddy.challengeLib.challenges.borrow_instead_buy.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.borrow_instead_buy.done',
    progressSource: 'week_see_it',
    target: 9,
    tier: 'regular',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    id: 'one_in_one_out',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.one_in_one_out.title',
    descKey: 'buddy.challengeLib.challenges.one_in_one_out.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.one_in_one_out.done',
    progressSource: 'week_see_it',
    target: 7,
    tier: 'regular',
    rewardBadgeId: 'impulse_shield',
  },
  {
    id: 'green_alt_master',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.green_alt_master.title',
    descKey: 'buddy.challengeLib.challenges.green_alt_master.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.green_alt_master.done',
    progressSource: 'total_see_it',
    target: 20,
    tier: 'hard',
    rewardBadgeId: 'green_guardian_10',
  },
  {
    id: 'freedom_hours_100',
    period: 'all_time',
    titleKey: 'buddy.challengeLib.challenges.freedom_hours_100.title',
    descKey: 'buddy.challengeLib.challenges.freedom_hours_100.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.freedom_hours_100.done',
    progressSource: 'week_money_left',
    target: 200,
    tier: 'hard',
    rewardBadgeId: 'money_forest_500',
  },
];

/**
 * 计算挑战当前进度。返回 null = 数据源未知 (demo/未加载/降级) — UI 显示 "—", 禁止当 0 用。
 * 字段映射与 badges-section.tsx calcBadgeProgress 同一套 buddyState 管道。
 */
export function calcChallengeProgress(
  def: GuardianChallenge,
  inputs: ChallengeProgressInputs,
): number | null {
  switch (def.progressSource) {
    case 'today_see_it':
      return typeof inputs.todaySeeItCount === 'number' ? inputs.todaySeeItCount : null;
    case 'today_chat':
      return typeof inputs.chattedToday === 'boolean' ? (inputs.chattedToday ? 1 : 0) : null;
    case 'week_see_it':
      return inputs.week ? inputs.week.challengesCompleted : null;
    case 'week_streak_days':
      return inputs.week ? inputs.week.streakDays : null;
    case 'week_money_left':
      return inputs.week ? inputs.week.totalSaved : null;
    case 'total_see_it':
      return typeof inputs.buddyState?.challengesCompleted === 'number' ? inputs.buddyState.challengesCompleted : null;
    case 'total_money_left':
      return typeof inputs.buddyState?.totalSaved === 'number' ? inputs.buddyState.totalSaved : null;
    case 'dream_funds_funded':
      // 与 calcBadgeProgress 口径一致: 有真实存入 (current > 0) 的基金才计数
      return Array.isArray(inputs.buddyState?.dreamFunds)
        ? inputs.buddyState.dreamFunds.filter((f) => (f.current || 0) > 0).length
        : null;
  }
}

/**
 * 挑战详情底部 "守护为你留下的钱" (美元, 真实管道直读)。
 * 无数据返回 null — UI 不渲染该行, 绝不显示编造的金额。
 *  - daily  → weekly-review dailyBreakdown 里今天 (todayDateStr) 的 savedAmount
 *  - weekly → weekly-review totalSaved (过去 7 天)
 *  - all_time → buddyState.totalSaved (累计)
 */
export function challengeMoneyLeft(
  def: GuardianChallenge,
  inputs: ChallengeProgressInputs,
): number | null {
  const week = inputs.week;
  switch (def.period) {
    case 'daily': {
      if (!week?.dailyBreakdown?.length || !week.todayDateStr) return null;
      const today = week.dailyBreakdown.find((d) => d.date === week.todayDateStr);
      return typeof today?.savedAmount === 'number' ? today.savedAmount : null;
    }
    case 'weekly':
      return week ? week.totalSaved : null;
    case 'all_time':
      return inputs.buddyState ? inputs.buddyState.totalSaved || 0 : null;
  }
}

/** 周期分组渲染顺序 (日 → 周 → 里程碑) */
export const CHALLENGE_PERIOD_ORDER: ChallengePeriod[] = ['daily', 'weekly', 'all_time'];

/** 周期 → 留下的钱文案 key (app 内明示 "上个周期的守护为你留下了多少钱") */
export const CHALLENGE_MONEY_KEYS: Record<ChallengePeriod, string> = {
  daily: 'buddy.challengeLib.moneyToday',
  weekly: 'buddy.challengeLib.moneyWeek',
  all_time: 'buddy.challengeLib.moneyAllTime',
};

/**
 * batch6-a: 每周轮换 — 7 天毫秒数, 刻度取 UTC Unix epoch。
 * weekNumber = floor(自 1970-01-01T00:00:00Z 起的 7 天数): 纯函数确定式, 同一周全端一致,
 * 不读服务端/不持久化/零 DDL。(边界在每周四 00:00 UTC 翻周 — 确定性比贴自然周更重要)
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function guardianWeekNumber(now: Date): number {
  return Math.floor(now.getTime() / WEEK_MS);
}

/**
 * batch6-a: 每周主推挑战 — 从 weekly 挑战池按 weekNumber 取模轮换。
 * 同一周全端返回同一条; 注入 Date 方便测试。池子非空由本库内容保证 (编译期常量)。
 */
export function pickWeeklyFeatureChallenge(now: Date = new Date()): GuardianChallenge {
  const pool = GUARDIAN_CHALLENGES.filter((c) => c.period === 'weekly');
  return pool[guardianWeekNumber(now) % pool.length];
}

/** batch6-a: 分层渲染顺序 (起步 → 常态 → 进阶) */
export const CHALLENGE_TIER_ORDER: ChallengeTier[] = ['starter', 'regular', 'hard'];

/** batch6-a: 分层分组标签 i18n key */
export const CHALLENGE_TIER_LABEL_KEYS: Record<ChallengeTier, string> = {
  starter: 'buddy.challengeLib.tiers.starter',
  regular: 'buddy.challengeLib.tiers.regular',
  hard: 'buddy.challengeLib.tiers.hard',
};

/**
 * batch6-a: 分组轴换 tier 后, 周期信息降级为卡片小徽章 — 文案与 period 分组区分开
 * (Daily/This week/Journey), 避免与 tier 标签混淆。
 */
export const CHALLENGE_PERIOD_CHIP_KEYS: Record<ChallengePeriod, string> = {
  daily: 'buddy.challengeLib.periodChip.daily',
  weekly: 'buddy.challengeLib.periodChip.weekly',
  all_time: 'buddy.challengeLib.periodChip.allTime',
};
