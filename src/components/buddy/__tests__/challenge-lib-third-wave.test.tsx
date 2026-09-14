import { describe, expect, it } from 'vitest';
import {
  GUARDIAN_CHALLENGES,
  challengeMoneyLeft,
  guardianWeekNumber,
  pickWeeklyFeatureChallenge,
  type ChallengeProgressSource,
} from '../challenge-definitions';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

const THIRD_WAVE_IDS = [
  'secondhand_first',
  'stockpile_audit',
  'repair_not_replace',
  'thirty_day_no_dup',
  'borrow_instead_buy',
  'one_in_one_out',
  'green_alt_master',
  'freedom_hours_100',
] as const;

const ALLOWED_SOURCES: readonly ChallengeProgressSource[] = [
  'today_see_it',
  'today_chat',
  'week_see_it',
  'week_streak_days',
  'week_money_left',
  'total_see_it',
  'total_money_left',
  'dream_funds_funded',
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_ANCHOR = new Date('2026-09-10T00:00:00Z');

function challengeCopy(lang: 'en' | 'zh', id: string) {
  const lib = lang === 'en' ? en : zh;
  const challenges = lib.buddy.challengeLib.challenges as Record<
    string,
    Record<'title' | 'desc' | 'done', string>
  >;
  return challenges[id];
}

describe('challenge library third wave', () => {
  it('expands the library to exactly 25 append-only challenges', () => {
    expect(GUARDIAN_CHALLENGES).toHaveLength(25);
    expect(GUARDIAN_CHALLENGES.slice(-THIRD_WAVE_IDS.length).map((challenge) => challenge.id))
      .toEqual([...THIRD_WAVE_IDS]);
  });

  it('keeps every progress source on the real-pipeline allowlist', () => {
    for (const challenge of GUARDIAN_CHALLENGES) {
      expect(ALLOWED_SOURCES, `${challenge.id} must use an existing pipeline`)
        .toContain(challenge.progressSource);
    }
  });

  it('balances tiers and the weekly rotation pool', () => {
    expect(GUARDIAN_CHALLENGES.filter((challenge) => challenge.tier === 'starter').length)
      .toBeGreaterThanOrEqual(6);
    expect(GUARDIAN_CHALLENGES.filter((challenge) => challenge.tier === 'regular').length)
      .toBeGreaterThanOrEqual(7);
    expect(GUARDIAN_CHALLENGES.filter((challenge) => challenge.tier === 'hard').length)
      .toBeGreaterThanOrEqual(6);
    expect(GUARDIAN_CHALLENGES.filter((challenge) => challenge.period === 'weekly').length)
      .toBeGreaterThanOrEqual(6);
  });

  it('keeps ids unique and third-wave ids separate from the first 17', () => {
    const ids = GUARDIAN_CHALLENGES.map((challenge) => challenge.id);
    expect(new Set(ids).size).toBe(ids.length);
    const inheritedIds = ids.slice(0, 17);
    for (const id of THIRD_WAVE_IDS) {
      expect(inheritedIds).not.toContain(id);
    }
  });

  it.each(['en', 'zh'] as const)('defines mirrored copy for every third-wave challenge in %s', (lang) => {
    for (const id of THIRD_WAVE_IDS) {
      const copy = challengeCopy(lang, id);
      expect(copy?.title, `${lang} ${id}.title`).toBeTruthy();
      expect(copy?.desc, `${lang} ${id}.desc`).toBeTruthy();
      expect(copy?.done, `${lang} ${id}.done`).toBeTruthy();
    }
  });

  it('rotates the expanded weekly pool deterministically', () => {
    const pool = GUARDIAN_CHALLENGES.filter((challenge) => challenge.period === 'weekly');
    const first = pickWeeklyFeatureChallenge(WEEK_ANCHOR);

    for (let day = 0; day < 7; day += 1) {
      const now = new Date(WEEK_ANCHOR.getTime() + day * 24 * 60 * 60 * 1000);
      expect(pickWeeklyFeatureChallenge(now).id).toBe(first.id);
    }
    for (let week = 0; week < pool.length; week += 1) {
      const now = new Date(WEEK_ANCHOR.getTime() + week * WEEK_MS);
      const expected = pool[guardianWeekNumber(now) % pool.length];
      expect(pickWeeklyFeatureChallenge(now).id).toBe(expected.id);
    }
  });

  it('renders no money line when the period pipeline is unavailable', () => {
    const secondhand = GUARDIAN_CHALLENGES.find((challenge) => challenge.id === 'secondhand_first')!;
    expect(challengeMoneyLeft(secondhand, { week: null })).toBeNull();
  });
});
