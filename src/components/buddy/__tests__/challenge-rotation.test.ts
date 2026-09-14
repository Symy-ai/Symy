/**
 * batch6-a tests — 挑战库扩充不变量 + 每周轮换纯函数
 *
 * 覆盖矩阵:
 *  - 旧 9 条冻结: id/period/progressSource/target/rewardBadgeId 与 batch4-b 逐一相等
 *    (diff 里旧条目只允许加 tier 字段 — 语义零漂移)
 *  - 新条目只复用既有管道枚举 (禁发明新 progressSource)
 *  - guardianWeekNumber: 整数; 同周 (任意时刻/任意天) 同值; 跨周恰好 +1
 *  - pickWeeklyFeatureChallenge: 只从 weekly 池选; 同周同值且跨周变化; 一个周期覆盖全池
 *  - i18n 结构 key (weeklyFeature/tiers/periodChip/hardGroup) 双语齐全
 * (tier 分层渲染 / hard 折叠 / 主推位单实例 → challenge-modal.test.tsx)
 */
import { describe, it, expect } from 'vitest';
import {
  GUARDIAN_CHALLENGES,
  guardianWeekNumber,
  pickWeeklyFeatureChallenge,
} from '../challenge-definitions';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

const DAY_MS = 24 * 60 * 60 * 1000;

/** batch4-b 首发的 9 条 — 语义冻结, 防扩充时被顺手改动 */
const FROZEN_ORIGINALS: Array<{
  id: string;
  period: string;
  progressSource: string;
  target: number;
  rewardBadgeId: string;
}> = [
  { id: 'daily_green_gate', period: 'daily', progressSource: 'today_see_it', target: 1, rewardBadgeId: 'impulse_shield' },
  { id: 'daily_elephant_chat', period: 'daily', progressSource: 'today_chat', target: 1, rewardBadgeId: 'streak_7' },
  { id: 'weekly_three_guards', period: 'weekly', progressSource: 'week_see_it', target: 3, rewardBadgeId: 'green_guardian_10' },
  { id: 'weekly_streak_keeper', period: 'weekly', progressSource: 'week_streak_days', target: 7, rewardBadgeId: 'streak_7' },
  { id: 'weekly_fifty_left', period: 'weekly', progressSource: 'week_money_left', target: 50, rewardBadgeId: 'money_meadow_100' },
  { id: 'milestone_first_guard', period: 'all_time', progressSource: 'total_see_it', target: 1, rewardBadgeId: 'impulse_shield' },
  { id: 'milestone_green_guardian', period: 'all_time', progressSource: 'total_see_it', target: 10, rewardBadgeId: 'green_guardian_10' },
  { id: 'milestone_money_meadow', period: 'all_time', progressSource: 'total_money_left', target: 100, rewardBadgeId: 'money_meadow_100' },
  { id: 'milestone_first_seed', period: 'all_time', progressSource: 'dream_funds_funded', target: 1, rewardBadgeId: 'first_dream_funded' },
];

const defFor = (id: string) => GUARDIAN_CHALLENGES.find((c) => c.id === id)!;

describe('batch6-a registry — expansion without rewriting history', () => {
  it('keeps the original 9 challenges frozen (id/period/progressSource/target/rewardBadgeId)', () => {
    for (const frozen of FROZEN_ORIGINALS) {
      const c = defFor(frozen.id);
      expect(c, `${frozen.id} still exists`).toBeTruthy();
      expect(c.period, `${frozen.id}.period`).toBe(frozen.period);
      expect(c.progressSource, `${frozen.id}.progressSource`).toBe(frozen.progressSource);
      expect(c.target, `${frozen.id}.target`).toBe(frozen.target);
      expect(c.rewardBadgeId, `${frozen.id}.rewardBadgeId`).toBe(frozen.rewardBadgeId);
    }
  });

  it('binds every (old and new) challenge to a real existing pipeline — no invented sources', () => {
    const allowed = [
      'today_see_it', 'today_chat', 'week_see_it', 'week_streak_days',
      'week_money_left', 'total_see_it', 'total_money_left', 'dream_funds_funded',
    ];
    for (const c of GUARDIAN_CHALLENGES) {
      expect(allowed, `${c.id} source must be a real pipeline`).toContain(c.progressSource);
    }
  });

  it('gives new challenges distinct targets inside their source so entries are not clones', () => {
    // 同一 progressSource + period 组合内 target 不得重复 (同源同目标 = 假扩充)
    const seen = new Set<string>();
    for (const c of GUARDIAN_CHALLENGES) {
      const key = `${c.period}:${c.progressSource}:${c.target}`;
      expect(seen.has(key), `duplicate challenge shape: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('guardianWeekNumber — deterministic UTC weeks (same week, every client)', () => {
  // 锚点取周四 00:00 UTC (epoch 起始即周四, 翻周边界) — 边界后 7 天内任意时刻同值
  const T0 = new Date('2026-09-10T00:00:00Z');

  it('returns an integer', () => {
    expect(Number.isInteger(guardianWeekNumber(T0))).toBe(true);
  });

  it('stays constant across all 7 days and all hours of one week', () => {
    const base = guardianWeekNumber(T0);
    for (let d = 0; d < 7; d++) {
      for (const h of [0, 6, 13, 23]) {
        const t = new Date(T0.getTime() + d * DAY_MS);
        t.setUTCHours(h);
        expect(guardianWeekNumber(t), `day ${d}, hour ${h}`).toBe(base);
      }
    }
  });

  it('advances exactly one step across the week boundary', () => {
    const base = guardianWeekNumber(T0);
    expect(guardianWeekNumber(new Date(T0.getTime() + 7 * DAY_MS))).toBe(base + 1);
    expect(guardianWeekNumber(new Date(T0.getTime() + 14 * DAY_MS))).toBe(base + 2);
    expect(guardianWeekNumber(new Date(T0.getTime() - DAY_MS))).toBe(base - 1);
  });
});

describe('pickWeeklyFeatureChallenge — same week same pick, next week next pick', () => {
  // 同样锚定周四 00:00 UTC 翻周边界
  const T0 = new Date('2026-09-10T00:00:00Z');

  it('picks from the weekly pool only', () => {
    for (let w = 0; w < 12; w++) {
      const picked = pickWeeklyFeatureChallenge(new Date(T0.getTime() + w * 7 * DAY_MS));
      expect(picked.period, `${picked.id} must be weekly`).toBe('weekly');
    }
  });

  it('returns the same challenge all week long (deterministic, no randomness)', () => {
    const featured = pickWeeklyFeatureChallenge(T0);
    for (let d = 0; d < 7; d++) {
      expect(pickWeeklyFeatureChallenge(new Date(T0.getTime() + d * DAY_MS)).id, `day ${d}`)
        .toBe(featured.id);
    }
  });

  it('rotates: the next week picks a different challenge', () => {
    for (let w = 0; w < 8; w++) {
      const thisWeek = pickWeeklyFeatureChallenge(new Date(T0.getTime() + w * 7 * DAY_MS));
      const nextWeek = pickWeeklyFeatureChallenge(new Date(T0.getTime() + (w + 1) * 7 * DAY_MS));
      expect(nextWeek.id, `week ${w} → ${w + 1}`).not.toBe(thisWeek.id);
    }
  });

  it('covers the whole weekly pool over one full cycle', () => {
    const pool = GUARDIAN_CHALLENGES.filter((c) => c.period === 'weekly');
    expect(pool.length).toBeGreaterThanOrEqual(6);
    const picks = new Set(
      pool.map((_, w) => pickWeeklyFeatureChallenge(new Date(T0.getTime() + w * 7 * DAY_MS)).id),
    );
    expect(picks.size).toBe(pool.length);
  });

  it('works with no argument (defaults to now)', () => {
    const featured = pickWeeklyFeatureChallenge();
    expect(GUARDIAN_CHALLENGES.some((c) => c.id === featured.id)).toBe(true);
  });
});

describe('batch6-a i18n — structural keys bilingual', () => {
  const libOf = (lang: 'en' | 'zh') =>
    ((lang === 'en' ? en : zh).buddy as unknown as Record<string, never>).challengeLib as unknown as
    Record<string, never> & Record<'weeklyFeature' | 'tiers' | 'periodChip' | 'hardGroup', Record<string, string>>;

  it.each(['en', 'zh'] as const)('defines weeklyFeature / tiers / periodChip / hardGroup in %s', (lang) => {
    const lib = libOf(lang);
    expect(lib.weeklyFeature.label).toBeTruthy();
    expect(lib.tiers.starter).toBeTruthy();
    expect(lib.tiers.regular).toBeTruthy();
    expect(lib.tiers.hard).toBeTruthy();
    expect(lib.periodChip.daily).toBeTruthy();
    expect(lib.periodChip.weekly).toBeTruthy();
    expect(lib.periodChip.allTime).toBeTruthy();
    // 折叠态文案 — 邀请语气, 无羞辱
    expect(lib.hardGroup.hint).toBeTruthy();
    expect(lib.hardGroup.hint).not.toMatch(/失败|落后|you failed|behind/i);
  });
});
