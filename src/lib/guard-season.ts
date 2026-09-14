/**
 * Guard Season — 大促守护季 (购物节专属挑战, 纯日期数学, 零 DDL)
 *
 * 面子: 季专属身份 + 季挑战卡 (经 home 卡可晒可积累)。
 * 里子: 大促期间每一笔守住的钱都是全年最大单笔 (挑战管道真实金额 + 官方自由时间换算)。
 *
 * 红线:
 *  - 纯月日比较, 与年份无关; 窗口判定本地时区 (禁 UTC 隐式偏移)。
 *  - locale 亲和: zh 用户在非中文季窗口、en 用户在非英文季窗口 → 返回 null (诚实降级)。
 *  - rewardBadgeId 仅复用 constants.tsx ALL_BADGES 已有 id (不新增)。
 */

import type { GuardianChallenge } from '@/lib/guardian-challenge';
import { ALL_BADGES } from '@/components/buddy/constants';

/** 月日对 (本地时区) */
type MonthDay = { month: number; day: number };

/** 季定义 */
export interface GuardSeasonDef {
  id: 'double11' | 'black_friday' | 'm618';
  /** 季命名的 locale 亲和: 对不上时不出场 */
  localeAffinity: 'zh' | 'en';
  start: MonthDay;
  end: MonthDay;
  challenge: GuardianChallenge;
}

/**
 * 本地时区月日比较 (年份无关)。
 * 包含首尾日; 窗口年年同日。
 */
function isWithinWindow(now: Date, start: MonthDay, end: MonthDay): boolean {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const current = m * 100 + d; // e.g. 1024 = Oct 24
  const s = start.month * 100 + start.day;
  const e = end.month * 100 + end.day;

  if (s <= e) {
    return current >= s && current <= e;
  }
  // 跨年窗口 (如 1120~1201: s > e, 但本仓库三季都在同一年内, 保留逻辑以防未来扩展)
  return current >= s || current <= e;
}

/** 季挑战库 — 全部复用 ALL_BADGES 已有 id */
const GUARD_SEASON_DEFS: GuardSeasonDef[] = [
  {
    id: 'double11',
    localeAffinity: 'zh',
    start: { month: 10, day: 20 },
    end: { month: 11, day: 11 },
    challenge: {
      id: 'season_double11',
      period: 'weekly',
      titleKey: 'buddy.guardSeason.challenges.double11.title',
      descKey: 'buddy.guardSeason.challenges.double11.desc',
      doneTitleKey: 'buddy.guardSeason.challenges.double11.done',
      progressSource: 'week_money_left',
      target: 100,
      rewardBadgeId: 'money_meadow_100',
    },
  },
  {
    id: 'black_friday',
    localeAffinity: 'en',
    start: { month: 11, day: 20 },
    end: { month: 12, day: 1 },
    challenge: {
      id: 'season_black_friday',
      period: 'weekly',
      titleKey: 'buddy.guardSeason.challenges.black_friday.title',
      descKey: 'buddy.guardSeason.challenges.black_friday.desc',
      doneTitleKey: 'buddy.guardSeason.challenges.black_friday.done',
      progressSource: 'week_money_left',
      target: 100,
      rewardBadgeId: 'money_meadow_100',
    },
  },
  {
    id: 'm618',
    localeAffinity: 'zh',
    start: { month: 6, day: 1 },
    end: { month: 6, day: 18 },
    challenge: {
      id: 'season_m618',
      period: 'weekly',
      titleKey: 'buddy.guardSeason.challenges.m618.title',
      descKey: 'buddy.guardSeason.challenges.m618.desc',
      doneTitleKey: 'buddy.guardSeason.challenges.m618.done',
      progressSource: 'week_money_left',
      target: 100,
      rewardBadgeId: 'money_meadow_100',
    },
  },
];

/** 编译期断言: 每条 challenge 的 rewardBadgeId ∈ ALL_BADGES */
const _badgeIdCheck: Record<string, boolean> = {};
for (const b of ALL_BADGES) _badgeIdCheck[b.id] = true;
for (const season of GUARD_SEASON_DEFS) {
  if (!_badgeIdCheck[season.challenge.rewardBadgeId]) {
    throw new Error(`guard-season: invalid rewardBadgeId "${season.challenge.rewardBadgeId}" in season "${season.id}"`);
  }
}

/** 运行时断言: progressSource 合法 + period === 'weekly' */
const VALID_PROGRESS_SOURCES = new Set([
  'today_see_it', 'today_chat', 'week_see_it', 'week_streak_days',
  'week_money_left', 'total_see_it', 'total_money_left', 'dream_funds_funded',
]);
for (const season of GUARD_SEASON_DEFS) {
  if (season.challenge.period !== 'weekly') {
    throw new Error(`guard-season: period must be weekly for season "${season.id}"`);
  }
  if (!VALID_PROGRESS_SOURCES.has(season.challenge.progressSource)) {
    throw new Error(`guard-season: invalid progressSource "${season.challenge.progressSource}" for season "${season.id}"`);
  }
}

/**
 * 获取当前活跃守护季 (本地时区)。
 * @param now - 可选注入日期 (测试用), 默认 new Date()
 * @param locale - 可选 locale (测试用), 默认 'zh'
 */
export function getActiveGuardSeason(
  now: Date = new Date(),
  locale: string = 'zh',
): GuardSeasonDef | null {
  for (const season of GUARD_SEASON_DEFS) {
    if (season.localeAffinity !== locale) continue;
    if (isWithinWindow(now, season.start, season.end)) {
      return season;
    }
  }
  return null;
}

/** 导出定义数组 (组件用于 banner 文案, 测试用于合法性断言) */
export { GUARD_SEASON_DEFS };
