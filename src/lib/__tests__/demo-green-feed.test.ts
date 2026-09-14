import { describe, expect, it } from 'vitest';
import {
  DEMO_GREEN_ITEMS,
  DEMO_IMPULSE_ITEMS,
  GUARDIAN_STORY_INTERVAL,
  generateGuardianStoryNotification,
} from '@/lib/demo-data';
import { evaluateGreenSignal } from '@/lib/green-rules';
import { moneyToHours } from '@/lib/freedom-time';

describe('demo green feed', () => {
  it('contains green and impulse demo items', () => {
    expect(DEMO_GREEN_ITEMS.length).toBeGreaterThan(5);
    expect(DEMO_IMPULSE_ITEMS.length).toBeGreaterThan(3);
    expect(DEMO_GREEN_ITEMS.every((item) => item.isGreenPick)).toBe(true);
    expect(DEMO_IMPULSE_ITEMS.every((item) => !item.isGreenPick)).toBe(true);
  });

  it('green item text passes the real green signal threshold', () => {
    for (const item of DEMO_GREEN_ITEMS) {
      const greenCategory = `${item.category} sustainable`;
      const signal = evaluateGreenSignal(`${item.item} ${greenCategory}`, [{ title: item.item, category: greenCategory }])[0];
      expect(signal.green_score).toBeGreaterThanOrEqual(60);
    }
  });

  it('returns a complete guardian story', () => {
    const story = generateGuardianStoryNotification();
    expect(story.type).toBe('guardian-story');
    expect(story.amount).toBeGreaterThan(0);
    expect(story.altSuggestion).toBeTruthy();
    expect(story.savedHours).toBeCloseTo(moneyToHours(story.amount, story.hourlyRate));
    expect(GUARDIAN_STORY_INTERVAL).toBeGreaterThanOrEqual(3);
  });
});
