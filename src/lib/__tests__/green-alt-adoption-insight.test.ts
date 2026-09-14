import { describe, expect, it } from 'vitest';
import { aggregateGreenAltAdoptionInsight } from '../green-alt-adoption-insight';

const now = new Date('2026-03-10T12:00:00.000Z');
const REPAIR = 'shoe_repair_first';
const WEAR = 'ivory_bone_carving';

function adoption(entryId: string, at: string, category: string) {
  return {
    eventType: 'mindful_recovery',
    triggerId: `green-alt-adoption:${entryId}:${at}`,
    metadata: { kind: 'green_alt_adoption', entryId, category },
    createdAt: at,
  };
}

function rejection(entryId: string, reason: string, at: string) {
  return {
    eventType: 'manual_adjustment',
    metadata: { source: 'green_alt_rejection', entryId, reason },
    createdAt: at,
  };
}

function failed(category: string, at: string) {
  return { eventType: 'challenge_failed', metadata: { category }, createdAt: at };
}

describe('aggregateGreenAltAdoptionInsight', () => {
  it('returns stable insufficient for no data', () => {
    expect(aggregateGreenAltAdoptionInsight([], now)).toMatchObject({
      status: 'insufficient',
      totalSuggestions: 0,
      adoptions: 0,
      rejections: 0,
    });
  });

  it('returns stable insufficient for few samples', () => {
    const result = aggregateGreenAltAdoptionInsight([
      adoption(REPAIR, '2026-03-01T00:00:00Z', 'repair-care'),
    ], now);
    expect(result).toMatchObject({ status: 'insufficient', totalSuggestions: 1 });
  });

  it('aggregates rates, active days, categories, reasons and non-repurchase', () => {
    const result = aggregateGreenAltAdoptionInsight([
      adoption(REPAIR, '2026-02-01T00:00:00Z', 'repair-care'),
      adoption(WEAR, '2026-02-02T00:00:00Z', 'wear'),
      rejection(REPAIR, 'already_have', '2026-02-03T00:00:00Z'),
      rejection(WEAR, 'not_now', '2026-02-04T00:00:00Z'),
      rejection(REPAIR, 'already_have', '2026-02-05T00:00:00Z'),
      failed('repair-care', '2026-02-05T00:00:00Z'),
    ], now);

    expect(result).toMatchObject({
      status: 'ok',
      totalSuggestions: 5,
      adoptions: 2,
      rejections: 3,
      adoptionRate: 40,
      activeDays: 5,
      nonRepurchasesWithin7Days: 1,
      observedAdoptions: 2,
    });
    expect(result.topAdoptionCategories).toEqual([
      { category: 'repair-care', count: 1 },
      { category: 'wear', count: 1 },
    ]);
    expect(result.topRejectionReasons).toEqual([{ reason: 'already_have', count: 2 }]);
  });

  it('breaks category ties by stable category id', () => {
    const result = aggregateGreenAltAdoptionInsight([
      adoption(WEAR, '2026-02-01T00:00:00Z', 'wear'),
      adoption(REPAIR, '2026-02-01T01:00:00Z', 'repair-care'),
      rejection(WEAR, 'not_now', '2026-02-02T00:00:00Z'),
      rejection(REPAIR, 'already_have', '2026-02-03T00:00:00Z'),
      rejection(WEAR, 'prefer_buy', '2026-02-04T00:00:00Z'),
    ], now);
    expect(result.topAdoptionCategories.map((row) => row.category)).toEqual(['repair-care', 'wear']);
  });

  it('sorts rejection reasons by count then stable reason id', () => {
    const result = aggregateGreenAltAdoptionInsight([
      adoption(REPAIR, '2026-02-01T00:00:00Z', 'repair-care'),
      rejection(REPAIR, 'prefer_buy', '2026-02-02T00:00:00Z'),
      rejection(REPAIR, 'not_now', '2026-02-03T00:00:00Z'),
      rejection(REPAIR, 'not_now', '2026-02-04T00:00:00Z'),
      rejection(REPAIR, 'already_have', '2026-02-05T00:00:00Z'),
    ], now);
    expect(result.topRejectionReasons).toEqual([{ reason: 'not_now', count: 2 }]);
  });

  it('treats exactly 7 days as repurchase and 7 days + 1ms as not', () => {
    const base = [
      adoption(WEAR, '2026-02-01T00:00:00.000Z', 'wear'),
      adoption(REPAIR, '2026-02-02T00:00:00Z', 'repair-care'),
      rejection(WEAR, 'not_now', '2026-02-03T00:00:00Z'),
      rejection(REPAIR, 'not_now', '2026-02-04T00:00:00Z'),
      rejection(REPAIR, 'prefer_buy', '2026-02-05T00:00:00Z'),
    ];
    expect(aggregateGreenAltAdoptionInsight([...base, failed('wear', '2026-02-08T00:00:00.000Z')], now)
      .nonRepurchasesWithin7Days).toBe(1);
    expect(aggregateGreenAltAdoptionInsight([...base, failed('wear', '2026-02-08T00:00:00.001Z')], now)
      .nonRepurchasesWithin7Days).toBe(2);
  });
});
