import { describe, expect, it } from 'vitest';

import {
  ALL_BADGES,
  BADGE_GROUP_ORDER,
  DREAM_GARDENER_COMPLETED_FUNDS,
  EVERGREEN_STREAK_DAYS,
  GREEN_GUARDIAN_WINS,
  MONEY_FOREST_WON_BACK_HOURS,
} from '../badge-constants';

/**
 * badge-constants.ts (180行) — 徽章注册表 (纯数据件)。
 *
 * 锁定:
 * - 15 枚徽章无重复 id
 * - 三组分布 guardian 6 / growth 6 / milestone 3
 * - group 全在 BADGE_GROUP_ORDER 内
 * - batch106-b 四门槛常量
 * - 每枚 emoji/color/unlockConditionKey/progressTarget 完整
 */
describe('badge-constants 徽章注册表', () => {
  it('15 枚徽章且 id 唯一', () => {
    expect(ALL_BADGES).toHaveLength(15);
    const ids = ALL_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(15);
  });

  it('三组分布: guardian 6 / growth 6 / milestone 3', () => {
    const by = (g: string) => ALL_BADGES.filter((b) => b.group === g).length;
    expect(by('guardian')).toBe(6);
    expect(by('growth')).toBe(6);
    expect(by('milestone')).toBe(3);
    expect(BADGE_GROUP_ORDER).toEqual(['guardian', 'growth', 'milestone']);
  });

  it('每枚字段完整 (emoji/color/unlockConditionKey/progressTarget>0)', () => {
    for (const b of ALL_BADGES) {
      expect(b.emoji.length, `${b.id} emoji`).toBeGreaterThan(0);
      expect(b.color.length, `${b.id} color`).toBeGreaterThan(0);
      expect(b.unlockConditionKey.startsWith('buddy.badgeUnlock.'), `${b.id} key`).toBe(true);
      expect(b.progressTarget, `${b.id} target`).toBeGreaterThan(0);
    }
  });

  it('batch106-b 荣誉徽章门槛四常量 (BP p19)', () => {
    expect(GREEN_GUARDIAN_WINS).toBe(10);
    expect(EVERGREEN_STREAK_DAYS).toBe(30);
    expect(MONEY_FOREST_WON_BACK_HOURS).toBe(100); // 面子只认时间不认金额
    expect(DREAM_GARDENER_COMPLETED_FUNDS).toBe(3); // 完成才算, 建了不算
  });

  it('荣誉徽章注册与门槛常量对齐 (green_guardian_10=10/streak_guardian_30=30/money_forest_500/dream_gardener_3)', () => {
    const find = (id: string) => ALL_BADGES.find((b) => b.id === id)!;
    expect(find('green_guardian_10').progressTarget).toBe(GREEN_GUARDIAN_WINS);
    expect(find('green_guardian_10').progressType).toBe('challenge_wins');
    expect(find('streak_guardian_30').progressTarget).toBe(EVERGREEN_STREAK_DAYS);
    expect(find('streak_guardian_30').progressType).toBe('streak_days');
    expect(find('money_forest_500').progressType).toBe('won_back_hours');
    expect(find('money_forest_500').progressTarget).toBe(MONEY_FOREST_WON_BACK_HOURS); // id 历史名 500, 门槛实为 100 小时
    expect(find('dream_gardener_3').progressType).toBe('dream_fund_completed');
    expect(find('dream_gardener_3').progressTarget).toBe(DREAM_GARDENER_COMPLETED_FUNDS);
  });

  it('progressType 十类分布锚定 (challenge_wins 3 / streak_days 2 / ...)', () => {
    const count = (t: string) => ALL_BADGES.filter((b) => b.progressType === t).length;
    expect(count('challenge_wins')).toBe(2);
    expect(count('streak_days')).toBe(2);
    expect(count('clear_mind_streak')).toBe(2);
    expect(count('total_saves')).toBe(2);
    expect(count('big_truth')).toBe(2);
    expect(count('invited_count')).toBe(1);
    expect(count('won_back_hours')).toBe(1);
    expect(count('dream_fund_funded')).toBe(1);
    expect(count('dream_fund_count')).toBe(1);
    expect(count('dream_fund_completed')).toBe(1);
  });

  it('emoji 唯一性现状锚定: 🌳 双挂 (referral_master + money_forest_500), 其余 13 枚唯一', () => {
    const emojis = ALL_BADGES.map((b) => b.emoji);
    expect(new Set(emojis).size).toBe(14); // 15 枚中 1 对重复
    const treeHolders = ALL_BADGES.filter((b) => b.emoji === '🌳').map((b) => b.id);
    expect(treeHolders).toEqual(['referral_master', 'money_forest_500']);
  });

  it('referral_master 在 guardian 组 (邀请属守护)', () => {
    const rm = ALL_BADGES.find((b) => b.id === 'referral_master')!;
    expect(rm.group).toBe('guardian');
    expect(rm.progressType).toBe('invited_count');
  });
});
