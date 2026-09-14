import type { GuardPolicyChange, GuardPolicySnapshot } from '@/lib/guard-policy-diff';
import { GUARD_SCOPE_CATEGORIES, type GuardScopeCategory, type GuardScopeMode } from '@/lib/guard-scope';
import type { NormalizedPushPreferences } from '@/lib/push/preferences';

export interface GuardPolicyRestoreSetters {
  setGuardIntensity: (intensity: GuardPolicySnapshot['intensity']) => void;
  setGuardScopeMode: (category: GuardScopeCategory, mode: GuardScopeMode) => void;
  setNightWindow: (nightWindow: GuardPolicySnapshot['nightWindow']) => void;
  savePushPreferences: (patch: Partial<NormalizedPushPreferences>) => Promise<boolean>;
  setHourlyRate: (rate: number) => Promise<void>;
}

export async function restoreGuardPolicySnapshot(
  before: GuardPolicySnapshot,
  changes: readonly GuardPolicyChange[],
  setters: GuardPolicyRestoreSetters,
): Promise<boolean> {
  const fields = new Set(changes.map((change) => change.field));
  const pushPatch: Partial<NormalizedPushPreferences> = {};
  let hasPushPatch = false;
  let hourlyRestore: Promise<void> | null = null;

  if (fields.has('intensity')) setters.setGuardIntensity(before.intensity);
  if (fields.has('nightWindow')) setters.setNightWindow(before.nightWindow);
  for (const category of GUARD_SCOPE_CATEGORIES) {
    if (fields.has(`scope.${category}`)) setters.setGuardScopeMode(category, before.scope[category]);
  }
  if (fields.has('push.frequency')) {
    pushPatch.frequency = before.push.frequency;
    hasPushPatch = true;
  }
  for (const key of ['missYou', 'dreamFund', 'challenge', 'weeklyGuardian', 'dailyAlgorithm'] as const) {
    if (!fields.has(`push.${key}`)) continue;
    pushPatch[key] = before.push[key];
    hasPushPatch = true;
  }
  if (fields.has('hourlyRate')) hourlyRestore = setters.setHourlyRate(before.hourlyRate);

  try {
    if (hasPushPatch && !(await setters.savePushPreferences(pushPatch))) return false;
    if (hourlyRestore) await hourlyRestore;
    return true;
  } catch {
    // safe to ignore: restore returns false so the UI keeps the snapshot and never claims partial success
    return false;
  }
}
