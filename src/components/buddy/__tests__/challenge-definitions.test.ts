import { describe, expect, it } from 'vitest';
import {
  GUARDIAN_CHALLENGES,
  calcChallengeProgress,
  challengeMoneyLeft,
  guardianWeekNumber,
  pickWeeklyFeatureChallenge,
  CHALLENGE_PERIOD_ORDER,
  CHALLENGE_TIER_ORDER,
} from '../challenge-definitions';

const byId = (id: string) => GUARDIAN_CHALLENGES.find(c => c.id === id)!;

describe('GUARDIAN_CHALLENGES 库完整性 (batch6-a 起, 后续扩充)', () => {
  it('id 全局唯一 (库已扩至 25 条)', () => {
    expect(GUARDIAN_CHALLENGES.length).toBeGreaterThanOrEqual(17);
    expect(new Set(GUARDIAN_CHALLENGES.map(c => c.id)).size).toBe(GUARDIAN_CHALLENGES.length);
  });

  it('每条: titleKey/descKey/doneTitleKey 三 i18n key + target>0 + tier 合法', () => {
    for (const c of GUARDIAN_CHALLENGES) {
      expect(c.titleKey).toMatch(/^buddy\.challengeLib\.challenges\./);
      expect(c.descKey).toMatch(/^buddy\.challengeLib\.challenges\./);
      expect(c.doneTitleKey).toMatch(/^buddy\.challengeLib\.challenges\./);
      expect(c.target).toBeGreaterThan(0);
      expect(CHALLENGE_TIER_ORDER).toContain(c.tier);
      expect(CHALLENGE_PERIOD_ORDER).toContain(c.period);
    }
  });

  it('三周期均有条目; 三 tier 均有条目', () => {
    for (const p of CHALLENGE_PERIOD_ORDER) {
      expect(GUARDIAN_CHALLENGES.some(c => c.period === p)).toBe(true);
    }
    for (const t of CHALLENGE_TIER_ORDER) {
      expect(GUARDIAN_CHALLENGES.some(c => c.tier === t)).toBe(true);
    }
  });
});

const fund = (current: number) => ({ id: `f-${current}`, name: 'n', target: 100, emoji: '🌍', current });

describe('calcChallengeProgress (诚实降级红线: 未知=null 禁假 0)', () => {
  it('today_see_it: number 直读, undefined→null', () => {
    const def = byId('daily_green_gate');
    expect(calcChallengeProgress(def, { todaySeeItCount: 3 })).toBe(3);
    expect(calcChallengeProgress(def, { todaySeeItCount: null })).toBeNull();
    expect(calcChallengeProgress(def, {})).toBeNull();
  });

  it('today_chat: boolean→1/0, undefined→null', () => {
    const def = GUARDIAN_CHALLENGES.find(c => c.progressSource === 'today_chat')!;
    expect(calcChallengeProgress(def, { chattedToday: true })).toBe(1);
    expect(calcChallengeProgress(def, { chattedToday: false })).toBe(0);
    expect(calcChallengeProgress(def, {})).toBeNull();
  });

  it('week_* 三源: week 在→真值, null→null', () => {
    const seeIt = byId('weekly_three_guards');
    const week = { challengesCompleted: 4, totalSaved: 88, streakDays: 3, dailyBreakdown: [] };
    expect(calcChallengeProgress(seeIt, { week })).toBe(4);
    expect(calcChallengeProgress(seeIt, { week: null })).toBeNull();
    const money = byId('freedom_hours_100');
    expect(calcChallengeProgress(money, { week })).toBe(88);
    const streakDef = GUARDIAN_CHALLENGES.find(c => c.progressSource === 'week_streak_days')!;
    expect(calcChallengeProgress(streakDef, { week })).toBe(3);
  });

  it('total_* : buddyState 管道', () => {
    const total = byId('green_alt_master');
    expect(calcChallengeProgress(total, { buddyState: { challengesCompleted: 25, streak: 5, totalSaved: 100, dreamFunds: [] } })).toBe(25);
    expect(calcChallengeProgress(total, { buddyState: null })).toBeNull();
    const money = GUARDIAN_CHALLENGES.find(c => c.progressSource === 'total_money_left')!;
    expect(calcChallengeProgress(money, { buddyState: { challengesCompleted: 0, streak: 0, totalSaved: 320, dreamFunds: [] } })).toBe(320);
  });

  it('dream_funds_funded: 只数 current>0 的 (与 calcBadgeProgress 同口径)', () => {
    const def = GUARDIAN_CHALLENGES.find(c => c.progressSource === 'dream_funds_funded')!;
    expect(calcChallengeProgress(def, {
      buddyState: { challengesCompleted: 0, streak: 0, totalSaved: 0, dreamFunds: [fund(50), fund(0), fund(1)] },
    })).toBe(2);
    expect(calcChallengeProgress(def, { buddyState: { challengesCompleted: 0, streak: 0, totalSaved: 0, dreamFunds: [] } })).toBe(0);
    expect(calcChallengeProgress(def, {})).toBeNull();
  });
});

describe('challengeMoneyLeft (留下的钱: 无数据=null 禁编造)', () => {
  const week = {
    challengesCompleted: 1, totalSaved: 77, streakDays: 2,
    dailyBreakdown: [
      { date: '2026-10-09', count: 1, savedAmount: 12 },
      { date: '2026-10-08', count: 2, savedAmount: 65 },
    ],
    todayDateStr: '2026-10-09',
  };

  it('daily: 今日 dailyBreakdown 行', () => {
    expect(challengeMoneyLeft(byId('daily_green_gate'), { week })).toBe(12);
  });

  it('daily 缺 todayDateStr/空 breakdown: null', () => {
    expect(challengeMoneyLeft(byId('daily_green_gate'), { week: { ...week, todayDateStr: undefined } })).toBeNull();
    expect(challengeMoneyLeft(byId('daily_green_gate'), { week: null })).toBeNull();
  });

  it('weekly: totalSaved', () => {
    const weeklyDef = GUARDIAN_CHALLENGES.find(c => c.period === 'weekly')!;
    expect(challengeMoneyLeft(weeklyDef, { week })).toBe(77);
    expect(challengeMoneyLeft(weeklyDef, { week: null })).toBeNull();
  });

  it('all_time: buddyState.totalSaved (0 也如实)', () => {
    expect(challengeMoneyLeft(byId('green_alt_master'), { buddyState: { challengesCompleted: 0, streak: 0, totalSaved: 500, dreamFunds: [] } })).toBe(500);
    expect(challengeMoneyLeft(byId('green_alt_master'), { buddyState: { challengesCompleted: 0, streak: 0, totalSaved: 0, dreamFunds: [] } })).toBe(0);
    expect(challengeMoneyLeft(byId('green_alt_master'), { buddyState: null })).toBeNull();
  });
});

describe('每周轮换 (batch6-a 确定性)', () => {
  it('guardianWeekNumber: 7 天一刻度, UTC epoch floor', () => {
    expect(guardianWeekNumber(new Date(0))).toBe(0);
    expect(guardianWeekNumber(new Date(6 * 24 * 3600 * 1000))).toBe(0);
    expect(guardianWeekNumber(new Date(7 * 24 * 3600 * 1000))).toBe(1);
  });

  it('pickWeeklyFeatureChallenge: 同周同条, 跨周轮换, 池=weekly 周期', () => {
    const pool = GUARDIAN_CHALLENGES.filter(c => c.period === 'weekly');
    expect(pool.length).toBeGreaterThanOrEqual(2);
    const weekA = new Date(0);
    const nextWeek = new Date(7 * 24 * 3600 * 1000);
    const pickA = pickWeeklyFeatureChallenge(weekA);
    expect(pickWeeklyFeatureChallenge(new Date(3 * 24 * 3600 * 1000))).toBe(pickA); // 同周一致
    expect(pickWeeklyFeatureChallenge(nextWeek).id).not.toBe(pickA.id); // 轮换 (池>=2)
    expect(pickA.period).toBe('weekly');
  });
});
