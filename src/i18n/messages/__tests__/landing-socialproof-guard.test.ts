import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

const SOCIAL_PROOF_KEYS = [
  'socialProofTitle',
  'socialProofStat1',
  'socialProofStat1Label',
  'socialProofStat1Source',
  'socialProofStat2',
  'socialProofStat2Label',
  'socialProofStat2Source',
  'socialProofStat3',
  'socialProofStat3Label',
  'socialProofStat3Source',
] as const;

const RETIRED_ANXIETY_COPY = new RegExp(
  [['3', ',381'].join(''), ['月光', '族'].join(''), ['paycheck', ' to ', 'paycheck'].join(''), 'Invesp', 'LendingClub', 'Capital One'].join('|'),
  'i',
);

describe('landing social proof guardian narrative', () => {
  it('defines the complete mirrored social proof key set', () => {
    for (const dict of [en, zh]) {
      const keys = Object.keys(dict.landing)
        .filter((key) => key.startsWith('socialProof'))
        .sort();
      expect(keys).toEqual([...SOCIAL_PROOF_KEYS].sort());

      for (const key of SOCIAL_PROOF_KEYS) {
        expect(dict.landing[key], key).toBeTruthy();
      }
    }
  });

  it('keeps external anxiety statistics and shame labels out', () => {
    for (const dict of [en, zh]) {
      for (const key of SOCIAL_PROOF_KEYS) {
        expect(dict.landing[key], key).not.toMatch(RETIRED_ANXIETY_COPY);
      }
    }
  });

  it('anchors the green guardian story in Chinese', () => {
    const labels = [
      zh.landing.socialProofTitle,
      zh.landing.socialProofStat1Label,
      zh.landing.socialProofStat2Label,
      zh.landing.socialProofStat3Label,
    ].join(' ');
    const greenAnchors = labels.match(/绿色|环保|地球|梦想基金/g)?.length ?? 0;

    expect(greenAnchors).toBeGreaterThanOrEqual(2);
  });
});
