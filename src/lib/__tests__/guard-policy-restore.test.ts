// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/preferences';
import { diffGuardPolicy, type GuardPolicySnapshot } from '../guard-policy-diff';
import { restoreGuardPolicySnapshot } from '../guard-policy-restore';

const before: GuardPolicySnapshot = {
  intensity: 'gentle',
  scope: { electronics: 'exempt', clothing: 'guard', beauty: 'guard', home: 'guard', food: 'guard' },
  nightWindow: 'standard',
  push: { ...DEFAULT_PUSH_PREFERENCES, frequency: 'daily', missYou: false },
  hourlyRate: 40,
};
const after: GuardPolicySnapshot = {
  ...before,
  intensity: 'strict',
  scope: { ...before.scope, electronics: 'strict' },
  nightWindow: 'early',
  push: { ...before.push, frequency: 'weekly', missYou: true },
  hourlyRate: 50,
};

describe('restoreGuardPolicySnapshot', () => {
  it('restores every changed field and leaves unchanged fields alone', async () => {
    const savePushPreferences = vi.fn(() => Promise.resolve(true));
    const setHourlyRate = vi.fn(() => Promise.resolve(undefined));
    const setGuardIntensity = vi.fn();
    const setGuardScopeMode = vi.fn();
    const setNightWindow = vi.fn();
    const changes = diffGuardPolicy(before, after);
    await expect(restoreGuardPolicySnapshot(before, changes, {
      setGuardIntensity,
      setGuardScopeMode,
      setNightWindow,
      savePushPreferences,
      setHourlyRate,
    })).resolves.toBe(true);
    expect(savePushPreferences).toHaveBeenCalledWith({ frequency: 'daily', missYou: false });
    expect(setHourlyRate).toHaveBeenCalledWith(40);
    expect(setGuardIntensity).toHaveBeenCalledWith('gentle');
    expect(setNightWindow).toHaveBeenCalledWith('standard');
    expect(setGuardScopeMode).toHaveBeenCalledWith('electronics', 'exempt');
  });

  it('does not claim success after a setter failure', async () => {
    const savePushPreferences = vi.fn(() => Promise.resolve(false));
    await expect(restoreGuardPolicySnapshot(before, diffGuardPolicy(before, after), {
      setGuardIntensity: vi.fn(),
      setGuardScopeMode: vi.fn(),
      setNightWindow: vi.fn(),
      savePushPreferences,
      setHourlyRate: vi.fn(() => Promise.resolve(undefined)),
    })).resolves.toBe(false);
  });
});
