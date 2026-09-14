/**
 * guard-season 单测 — 纯逻辑 (getActiveGuardSeason + 定义合法性)
 */

import { describe, expect, it } from 'vitest';
import { getActiveGuardSeason, GUARD_SEASON_DEFS } from '../guard-season';

describe('getActiveGuardSeason', () => {
  /** 本地时区注入: 2026-10-19 (双11 窗口前一日) */
  const beforeWindow = new Date(2026, 9, 19); // month is 0-indexed
  /** 本地时区注入: 2026-10-20 (双11 首日) */
  const firstDay = new Date(2026, 9, 20);
  /** 本地时区注入: 2026-11-11 (双11 尾日) */
  const lastDay = new Date(2026, 10, 11);
  /** 本地时区注入: 2026-11-12 (双11 窗口后一日) */
  const afterWindow = new Date(2026, 10, 12);
  /** 本地时区注入: 2026-06-01 (618 首日) */
  const m618First = new Date(2026, 5, 1);
  /** 本地时区注入: 2026-06-18 (618 尾日) */
  const m618Last = new Date(2026, 5, 18);
  /** 本地时区注入: 2026-11-20 (黑五首日) */
  const blackFridayFirst = new Date(2026, 10, 20);
  /** 本地时区注入: 2026-12-01 (黑五尾日) */
  const blackFridayLast = new Date(2026, 11, 1);

  describe('window boundaries', () => {
    it('returns null before window start (本地时区)', () => {
      expect(getActiveGuardSeason(beforeWindow, 'zh')).toBeNull();
    });

    it('returns season on first day', () => {
      const result = getActiveGuardSeason(firstDay, 'zh');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('double11');
    });

    it('returns season on last day', () => {
      const result = getActiveGuardSeason(lastDay, 'zh');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('double11');
    });

    it('returns null after window end', () => {
      expect(getActiveGuardSeason(afterWindow, 'zh')).toBeNull();
    });

    it('returns m618 on first day (zh)', () => {
      const result = getActiveGuardSeason(m618First, 'zh');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('m618');
    });

    it('returns m618 on last day (zh)', () => {
      const result = getActiveGuardSeason(m618Last, 'zh');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('m618');
    });

    it('returns black_friday on first day (en)', () => {
      const result = getActiveGuardSeason(blackFridayFirst, 'en');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('black_friday');
    });

    it('returns black_friday on last day (en)', () => {
      const result = getActiveGuardSeason(blackFridayLast, 'en');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('black_friday');
    });
  });

  describe('locale affinity', () => {
    it('zh user in black_friday window → null (locale mismatch)', () => {
      expect(getActiveGuardSeason(blackFridayFirst, 'zh')).toBeNull();
    });

    it('en user in double11 window → null (locale mismatch)', () => {
      expect(getActiveGuardSeason(firstDay, 'en')).toBeNull();
    });

    it('zh user in m618 window → m618', () => {
      const result = getActiveGuardSeason(m618First, 'zh');
      expect(result!.id).toBe('m618');
    });

    it('zh user in double11 window → double11', () => {
      const result = getActiveGuardSeason(firstDay, 'zh');
      expect(result!.id).toBe('double11');
    });

    it('en user in black_friday window → black_friday', () => {
      const result = getActiveGuardSeason(blackFridayFirst, 'en');
      expect(result!.id).toBe('black_friday');
    });
  });

  describe('year independence', () => {
    it('same month/day in 2026 and 2027 give same result', () => {
      const d2026 = new Date(2026, 9, 20);
      const d2027 = new Date(2027, 9, 20);
      expect(getActiveGuardSeason(d2026, 'zh')).toEqual(getActiveGuardSeason(d2027, 'zh'));
    });
  });

  describe('definition validity', () => {
    it('every challenge has rewardBadgeId ∈ ALL_BADGES', () => {
      const validIds = new Set(['impulse_shield', 'green_guardian_10', 'streak_7', 'streak_guardian_30', 'quiet_night_master', 'first_save', 'money_meadow_100', 'money_forest_500', 'first_dream_funded', 'dream_builder', 'dream_gardener_3', 'boss_slayer', 'rational_lawyer', 'light_bearer']);
      for (const season of GUARD_SEASON_DEFS) {
        expect(validIds.has(season.challenge.rewardBadgeId)).toBe(true);
      }
    });

    it('every challenge has progressSource in valid union', () => {
      const validSources = new Set(['today_see_it', 'today_chat', 'week_see_it', 'week_streak_days', 'week_money_left', 'total_see_it', 'total_money_left', 'dream_funds_funded']);
      for (const season of GUARD_SEASON_DEFS) {
        expect(validSources.has(season.challenge.progressSource)).toBe(true);
      }
    });

    it('every challenge period is weekly', () => {
      for (const season of GUARD_SEASON_DEFS) {
        expect(season.challenge.period).toBe('weekly');
      }
    });
  });
});
