import { describe, expect, it } from 'vitest';
import { diffGuardPolicy, type GuardPolicySnapshot } from '../guard-policy-diff';
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/preferences';

const snapshot: GuardPolicySnapshot = {
  intensity: 'balanced',
  scope: { electronics: 'guard', clothing: 'guard', beauty: 'guard', home: 'guard', food: 'guard' },
  nightWindow: 'standard',
  push: { ...DEFAULT_PUSH_PREFERENCES },
  hourlyRate: 50,
};

describe('diffGuardPolicy', () => {
  it('returns only changed fields with bilingual values and behavior', () => {
    const changes = diffGuardPolicy(snapshot, {
      ...snapshot,
      intensity: 'gentle',
      scope: { ...snapshot.scope, beauty: 'exempt' },
      nightWindow: 'early',
      push: { ...snapshot.push, frequency: 'weekly', missYou: false },
      hourlyRate: 60,
    });
    expect(changes.map((change) => change.field)).toEqual([
      'intensity', 'scope.beauty', 'nightWindow', 'push.frequency', 'push.missYou', 'hourlyRate',
    ]);
    expect(changes[1].after.en).toBe('exempt');
    expect(changes[1].effect.en).toBe('Symy will stop interrupting this category.');
  });

  it('returns no rows for identical snapshots', () => {
    expect(diffGuardPolicy(snapshot, { ...snapshot, scope: { ...snapshot.scope } })).toEqual([]);
  });
});
