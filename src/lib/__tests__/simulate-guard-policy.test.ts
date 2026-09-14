import { describe, expect, it } from 'vitest';
import {
  GUARD_POLICY_PREVIEW_DAYS,
  simulateGuardPolicyCandidate,
} from '@/lib/simulate-guard-policy';
import { defaultGuardScope } from '@/lib/guard-scope';

const now = new Date('2026-09-09T12:00:00');

function event(daysAgo: number, hour: number, overrides: Record<string, unknown> = {}) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return {
    eventType: 'challenge_completed',
    createdAt: date.toISOString(),
    metadata: {
      category: 'food',
      savedAmount: 50,
      ...((overrides.metadata ?? {}) as Record<string, unknown>),
    },
    triggerId: typeof overrides.triggerId === 'string' ? overrides.triggerId : null,
  };
}

describe('simulateGuardPolicyCandidate', () => {
  const history = {
    rawScope: defaultGuardScope(),
    rawNightWindow: 'standard',
    hourlyRate: 50,
    now,
  };

  it('handles empty, insufficient, and normal windows without inventing coverage', () => {
    const empty = simulateGuardPolicyCandidate({ intensity: 'balanced', scopeMode: 'current' }, { ...history, events: [] });
    expect(empty.status).toBe('empty');

    const insufficient = simulateGuardPolicyCandidate(
      { intensity: 'balanced', scopeMode: 'current' },
      { ...history, events: [event(1, 23), event(2, 23)] },
    );
    expect(insufficient).toMatchObject({ status: 'insufficient', coveredEventCount: 2 });

    const events = Array.from({ length: 5 }, (_, index) => event(index + 1, 23));
    const normal = simulateGuardPolicyCandidate({ intensity: 'balanced', scopeMode: 'current' }, { ...history, events });
    expect(normal).toMatchObject({ status: 'ok', coveredEventCount: 5, coveredCategoryCount: 1, freedomHours: 5 });
  });

  it('skips invalid, out-of-window, duplicate, and unknown-category events', () => {
    const old = event(GUARD_POLICY_PREVIEW_DAYS + 1, 23);
    const events = [
      { eventType: 'other', createdAt: now.toISOString() },
      { eventType: 'challenge_completed', createdAt: 'invalid' },
      old,
      event(1, 23, { metadata: { category: 'zzz', savedAmount: 50 } }),
      event(2, 23, { triggerId: 'first', metadata: { category: 'zzz', savedAmount: 50 } }),
      event(2, 23, { triggerId: 'first', metadata: { category: 'zzz', savedAmount: 50 } }),
    ];
    expect(simulateGuardPolicyCandidate({ intensity: 'balanced', scopeMode: 'current' }, { ...history, events }).coveredEventCount).toBe(0);
  });

  it('lets all-scope restore exempted category coverage', () => {
    const scope = { ...defaultGuardScope(), food: 'exempt' as const };
    const events = Array.from({ length: 5 }, (_, index) => event(index + 1, 23));
    const current = simulateGuardPolicyCandidate({ intensity: 'balanced', scopeMode: 'current' }, { ...history, rawScope: scope, events });
    const all = simulateGuardPolicyCandidate({ intensity: 'balanced', scopeMode: 'all' }, { ...history, rawScope: scope, events });
    expect(current.coveredEventCount).toBe(0);
    expect(all.coveredEventCount).toBe(5);
  });

  it('counts interruption only for strict category or the selected night window', () => {
    const events = [event(1, 20), event(2, 23), event(3, 10)];
    const balanced = simulateGuardPolicyCandidate({ intensity: 'balanced', scopeMode: 'nightStrict' }, { ...history, rawNightWindow: 'early', events });
    const strictFood = simulateGuardPolicyCandidate(
      { intensity: 'balanced', scopeMode: 'current' },
      { ...history, rawScope: { ...defaultGuardScope(), food: 'strict' as const }, events },
    );
    expect(balanced.potentialDisturbanceDays).toBe(1);
    expect(strictFood.potentialDisturbanceDays).toBe(3);
  });
});
