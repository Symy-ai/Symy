import { describe, expect, it } from 'vitest';
import { analyzeGreenRuleCoverage, type GreenRuleCoverageEvent } from '../green-rule-coverage';
import { GREEN_ALTERNATIVES } from '../green-alternatives';
import type { GreenAlternativeEntry } from '../green-alt-types';

const now = new Date('2026-09-09T00:00:00Z');
const entry = (id: string, triggers: string[]): GreenAlternativeEntry => ({
  id,
  triggers: { zh: triggers, en: [] },
  why: { zh: 'why', en: 'why' },
  options: { zh: [], en: [] },
  reuseChannel: { zh: '', en: '' },
  alternative: { zh: '', en: '' },
  reuse: { zh: '', en: '' },
  savingsHint: { zh: '', en: '' },
});
const event = (item: string, category: string, daysAgo = 1): GreenRuleCoverageEvent => ({
  eventType: 'challenge_completed',
  createdAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  metadata: { itemTitle: item, category },
});

describe('analyzeGreenRuleCoverage', () => {
  it('returns stable noData for empty events', () => {
    const result = analyzeGreenRuleCoverage([entry('new_clothes', ['新衣服'])], [], now);
    expect(result.status).toBe('noData');
    expect(result.totalEvents).toBe(0);
  });

  it('returns stable noEntries without entries', () => {
    expect(analyzeGreenRuleCoverage([], [event('新衣服', 'clothing')], now).status).toBe('noEntries');
  });

  it('reports healthy when all events hit entries', () => {
    const result = analyzeGreenRuleCoverage([entry('new_clothes', ['新衣服'])], [event('新衣服', 'clothing')], now);
    expect(result.status).toBe('healthy');
    expect(result.coverageRate).toBe(1);
    expect(result.topTriggeredEntryIds[0]).toEqual({ key: 'new_clothes', count: 1 });
  });

  it('creates category and trigger gaps for unmatched categories', () => {
    const result = analyzeGreenRuleCoverage([entry('new_clothes', ['新衣服'])], [
      event('演唱会门票', 'celebration'),
      event('演唱会门票', 'celebration'),
      event('展览门票', 'celebration'),
    ], now);
    expect(result.status).toBe('partial');
    expect(result.categoryGaps[0]).toEqual({ key: 'celebration', count: 3 });
    expect(result.triggerGaps[0]).toEqual({ key: '演唱会门票', count: 2 });
  });

  it('sorts top gaps by count and ignores events older than 180 days', () => {
    const result = analyzeGreenRuleCoverage([entry('unrelated', ['zzz'])], [
      event('a', 'x', 1), event('a', 'x', 2), event('b', 'y', 3), event('old', 'z', 181),
    ], now);
    expect(result.triggerGaps.map((gap) => gap.key)).toEqual(['a', 'b']);
  });

  it('sorts recently added entries from newest to oldest', () => {
    const entries = ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => entry(id, [id]));
    expect(analyzeGreenRuleCoverage(entries, [], now).recentEntryIds).toEqual(['six', 'five', 'four', 'three', 'two']);
  });

  it('garden domain has coverage after expansion', () => {
    const events = [event('买盆栽', 'gardening'), event('户外桌椅', 'garden')];
    const result = analyzeGreenRuleCoverage(GREEN_ALTERNATIVES, events, now);
    expect(result.status).toBe('healthy');
    expect(result.coverageRate).toBe(1);
  });
});
