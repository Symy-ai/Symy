/**
 * Guard policy preview — save-free historical simulation.
 *
 * Reuses the existing scope/category/night-window SSOT and the guard-events
 * amount-to-hours conversion. This module never reads or writes IO.
 */

import {
  GUARD_SCOPE_CATEGORIES,
  isCategoryExempt,
  normalizeGuardScope,
  type GuardScope,
  type GuardScopeCategory,
} from '@/lib/guard-scope';
import { normalizeGuardIntensity, type GuardIntensity } from '@/lib/guard-intensity';
import { NIGHT_WINDOW_OPTIONS, normalizeNightWindow, nightWindowToHours } from '@/lib/night-window';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { resolveGuardCategory } from '@/lib/guard-category-insight';

export const GUARD_POLICY_PREVIEW_DAYS = 90;
export const GUARD_POLICY_MIN_SAMPLE_SIZE = 5;

export type GuardPolicyScopeMode = 'current' | 'all' | 'nightStrict';

export const GUARD_POLICY_INTENSITIES: readonly GuardIntensity[] = ['gentle', 'balanced', 'strict'];
export const GUARD_POLICY_SCOPE_MODES: readonly GuardPolicyScopeMode[] = ['current', 'all', 'nightStrict'];

export interface GuardPolicyCandidate {
  intensity: GuardIntensity;
  scopeMode: GuardPolicyScopeMode;
}

export interface GuardPolicyEventInput {
  eventType?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface SimulatedGuardPolicy {
  status: 'empty' | 'insufficient' | 'ok';
  candidate: GuardPolicyCandidate;
  coveredEventCount: number;
  coveredCategoryCount: number;
  freedomHours: number;
  potentialDisturbanceDays: number;
  coveredCategories: GuardScopeCategory[];
  sampleCategories: GuardScopeCategory[];
}

export interface SimulateGuardPolicyInput {
  rawIntensity: unknown;
  rawScopeMode: unknown;
  rawScope: unknown;
  rawNightWindow: unknown;
  hourlyRate?: number;
  events: GuardPolicyEventInput[] | null | undefined;
  now?: Date;
}

export function normalizeGuardPolicyCandidate(
  intensity: unknown,
  scopeMode: unknown,
): GuardPolicyCandidate | null {
  const normalizedIntensity = normalizeGuardIntensity(intensity);
  if (intensity !== normalizedIntensity) return null;
  return GUARD_POLICY_SCOPE_MODES.includes(scopeMode as GuardPolicyScopeMode)
    ? { intensity: normalizedIntensity, scopeMode: scopeMode as GuardPolicyScopeMode }
    : null;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function eventAmount(event: GuardPolicyEventInput): number {
  const amount = Number(event.metadata?.savedAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function candidateScope(mode: GuardPolicyScopeMode, currentScope: GuardScope): GuardScope {
  if (mode === 'all') {
    return normalizeGuardScope(
      Object.fromEntries(GUARD_SCOPE_CATEGORIES.map((category) => [category, 'guard'])),
    );
  }
  return currentScope;
}

function isIntensiveTouch(
  candidate: GuardPolicyCandidate,
  scope: GuardScope,
  category: GuardScopeCategory | null,
  hour: number,
  nightHours: ReadonlySet<number>,
): boolean {
  if (candidate.intensity === 'strict') return true;
  if (category && scope[category] === 'strict') return true;
  return candidate.scopeMode === 'nightStrict' && nightHours.has(hour);
}

export function simulateGuardPolicy(input: SimulateGuardPolicyInput): SimulatedGuardPolicy {
  const intensity = normalizeGuardIntensity(input.rawIntensity);
  const candidate: GuardPolicyCandidate =
    normalizeGuardPolicyCandidate(intensity, input.rawScopeMode) ?? {
      intensity,
      scopeMode: 'current',
    };

  return simulate(candidate, input);
}

function simulate(
  candidate: GuardPolicyCandidate,
  input: SimulateGuardPolicyInput,
): SimulatedGuardPolicy {
  const currentScope = normalizeGuardScope(input.rawScope);
  const scope = candidateScope(candidate.scopeMode, currentScope);
  const nightPreset = normalizeNightWindow(input.rawNightWindow);
  const nightHours = new Set<number>(
    nightPreset === 'off' ? [] : NIGHT_WINDOW_OPTIONS[nightPreset].hours,
  );
  const rate = Number(input.hourlyRate);
  const hourlyRate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_HOURLY_RATE;
  const now = input.now ?? new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - GUARD_POLICY_PREVIEW_DAYS);

  const seen = new Set<string>();
  const categories = new Set<GuardScopeCategory>();
  const categoryCounts = new Map<GuardScopeCategory, number>();
  const disturbDays = new Set<string>();
  let coveredCount = 0;
  let saved = 0;

  for (const event of input.events ?? []) {
    if (!event || event.eventType !== 'challenge_completed') continue;
    const date = event.createdAt instanceof Date ? event.createdAt : new Date(String(event.createdAt ?? ''));
    if (!Number.isFinite(date.getTime()) || date > now || date < cutoff) continue;
    const key = typeof event.triggerId === 'string' && event.triggerId ? event.triggerId : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    else seen.add(`anonymous-${date.getTime()}`);

    const resolved = resolveGuardCategory(event.metadata);
    if (resolved === 'other') continue;
    if (isCategoryExempt(scope, resolved)) continue;
    const category = resolved;
    if (category) {
      categories.add(category);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    coveredCount += 1;
    saved += eventAmount(event);
    if (isIntensiveTouch(candidate, scope, category, date.getHours(), nightHours)) {
      disturbDays.add(dayKey(date));
    }
  }

  const sampleCategories = [...categoryCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category]) => category);

  return {
    status: coveredCount === 0 ? 'empty' : coveredCount < GUARD_POLICY_MIN_SAMPLE_SIZE ? 'insufficient' : 'ok',
    candidate,
    coveredEventCount: coveredCount,
    coveredCategoryCount: categories.size,
    freedomHours: saved / hourlyRate,
    potentialDisturbanceDays: disturbDays.size,
    coveredCategories: [...categories].sort((left, right) => left.localeCompare(right)),
    sampleCategories,
  };
}

export function simulateGuardPolicyCandidate(
  candidate: GuardPolicyCandidate,
  historical: Omit<SimulateGuardPolicyInput, 'rawIntensity' | 'rawScopeMode'>,
): SimulatedGuardPolicy {
  return simulate(candidate, {
    ...historical,
    rawIntensity: candidate.intensity,
    rawScopeMode: candidate.scopeMode,
  });
}

export function guardPolicyNightHours(preset: unknown): readonly number[] {
  return nightWindowToHours(normalizeNightWindow(preset));
}
