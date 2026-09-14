import { describe, expect, it } from 'vitest';

import { ALGORITHMS, getTodayAlgorithmIndex } from '../push-daily-algorithm/route';
import { getMilestonePayload } from '../push-dream-fund/route';
import { MISS_YOU_PUSH_PAYLOAD } from '../push-miss-you/route';

type PushPayload = { title: string; body: string; url: string };

const retiredNarrative = /resist (one more )?(the )?algorithm/i;

function expectPushPayload(payload: PushPayload, url: string): void {
  expect(Object.keys(payload)).toEqual(expect.arrayContaining(['title', 'body', 'url']));
  expect(payload.title).toBeTruthy();
  expect(payload.body).toBeTruthy();
  expect(payload.url).toBe(url);
  expect(payload.body).not.toMatch(retiredNarrative);
}

describe('web push green guardian narrative', () => {
  it('keeps the miss-you push warm and guardian-led', () => {
    expectPushPayload(MISS_YOU_PUSH_PAYLOAD, '/');
    expect(MISS_YOU_PUSH_PAYLOAD.title).toBe('Symy');
    expect(MISS_YOU_PUSH_PAYLOAD.body).toContain('guardian elephant');
    expect(MISS_YOU_PUSH_PAYLOAD.body).toContain('kept your hours safe');
  });

  it('keeps all five daily algorithm reminders educational and green-leaning', () => {
    expect(ALGORITHMS).toHaveLength(5);
    expect(ALGORITHMS.map(({ title }) => title)).toEqual([
      'Symy 🎯',
      'Symy 👥',
      'Symy ⚓',
      'Symy ⏰',
      'Symy 🐘',
    ]);

    for (const payload of ALGORITHMS) {
      expectPushPayload(payload, '/?tab=chat');
    }

    expect(ALGORITHMS[0].body).toContain('Scarcity');
    expect(ALGORITHMS[1].body).toContain('Social Proof');
    expect(ALGORITHMS[2].body).toContain('Anchoring');
    expect(ALGORITHMS[3].body).toContain('FOMO Timer');
    expect(ALGORITHMS[4].body).toContain('picked by your data');
  });

  it('keeps dream-fund milestones focused on guarded hours and completed care', () => {
    const milestones = [50, 80, 100].map((milestone) => getMilestonePayload('en', milestone, '🚴 New bike'));

    for (const payload of milestones) {
      expectPushPayload(payload, '/');
    }

    expect(milestones[0].body).toContain('halfway to your');
    expect(milestones[1].body).toContain('80%');
    expect(milestones[2].body).toContain('fully funded');
    expect(milestones[2].body).toContain('The hours you guarded became this');
    expect(milestones[2].body).toContain('Your elephant is proud');
  });

  it('keeps the daily algorithm rotation deterministic and complete', () => {
    const index = getTodayAlgorithmIndex();

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(ALGORITHMS.length);
  });

  it('uses guardian vocabulary across at least one push channel', () => {
    const allBodies = [
      MISS_YOU_PUSH_PAYLOAD.body,
      ...ALGORITHMS.map(({ body }) => body),
      ...[50, 80, 100].map((milestone) => getMilestonePayload('en', milestone, '🚴 New bike').body),
    ];

    expect(allBodies.some((body) => /guard|guardian|guardian elephant|elephant/i.test(body))).toBe(true);
  });
});
