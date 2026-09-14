/**
 * badge-goal lib tests
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBadgeGoal, setBadgeGoal, isBadgeGoalCelebrated, markBadgeGoalCelebrated } from '@/lib/badge-goal';

const FIXED_DATE = '2026-09-08';
vi.mock('@/lib/limit-window', () => ({ getLimitWindow: () => FIXED_DATE }));

describe('badge-goal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('setBadgeGoal/getBadgeGoal', () => {
    it('sets and reads a badge id', () => {
      setBadgeGoal('streak_7');
      expect(getBadgeGoal()).toBe('streak_7');
    });

    it('returns null when unset', () => {
      expect(getBadgeGoal()).toBeNull();
    });

    it('clears with null', () => {
      setBadgeGoal('green_guardian_10');
      expect(getBadgeGoal()).toBe('green_guardian_10');
      setBadgeGoal(null);
      expect(getBadgeGoal()).toBeNull();
    });

    it('ignores unknown badge id', () => {
      setBadgeGoal('totally_fake_badge');
      expect(getBadgeGoal()).toBeNull();
    });

    it('ignores non-string-ish values', () => {
      setBadgeGoal('');
      expect(getBadgeGoal()).toBeNull();

      setBadgeGoal('   ' as unknown as string);
      expect(getBadgeGoal()).toBeNull();
    });
  });

  describe('celebrated', () => {
    it('marks and reads celebrated', () => {
      markBadgeGoalCelebrated('streak_7');
      expect(isBadgeGoalCelebrated('streak_7')).toBe(true);
    });

    it('is false for unmarked badge', () => {
      expect(isBadgeGoalCelebrated('streak_7')).toBe(false);
    });

    it('supports multiple entries', () => {
      markBadgeGoalCelebrated('streak_7');
      markBadgeGoalCelebrated('green_guardian_10');
      expect(isBadgeGoalCelebrated('streak_7')).toBe(true);
      expect(isBadgeGoalCelebrated('green_guardian_10')).toBe(true);
      expect(isBadgeGoalCelebrated('impulse_shield')).toBe(false);
    });
  });

  describe('localStorage unavailable', () => {
    it('does not throw when localStorage throws', () => {
      const originalSetItem = Storage.prototype.setItem;
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.setItem = () => { throw new Error('no storage'); };
      Storage.prototype.getItem = () => { throw new Error('no storage'); };

      expect(() => setBadgeGoal('streak_7')).not.toThrow();
      expect(() => getBadgeGoal()).not.toThrow();
      expect(() => markBadgeGoalCelebrated('streak_7')).not.toThrow();
      expect(() => isBadgeGoalCelebrated('streak_7')).not.toThrow();

      Storage.prototype.setItem = originalSetItem;
      Storage.prototype.getItem = originalGetItem;
    });
  });
});
