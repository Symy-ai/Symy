import { describe, expect, it } from 'vitest';
import {
  GUARD_POLICY_PREVIEW_DAYS,
  GUARD_POLICY_INTENSITIES,
  GUARD_POLICY_SCOPE_MODES,
  normalizeGuardPolicyCandidate,
  simulateGuardPolicy,
  simulateGuardPolicyCandidate,
  guardPolicyNightHours,
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


describe('normalizeGuardPolicyCandidate', () => {
  it('合法候选直通; 非法 intensity/scopeMode 返回 null', () => {
    expect(normalizeGuardPolicyCandidate('balanced', 'current')).toEqual({ intensity: 'balanced', scopeMode: 'current' });
    expect(normalizeGuardPolicyCandidate('gentle', 'all')).toEqual({ intensity: 'gentle', scopeMode: 'all' });
    expect(normalizeGuardPolicyCandidate('violent', 'current')).toBeNull(); // 非白名单强度
    expect(normalizeGuardPolicyCandidate('balanced', 'sometimes')).toBeNull(); // 非白名单模式
    expect(normalizeGuardPolicyCandidate(null, 'current')).toBeNull();
  });

  it('白名单常量: 3 强度 × 3 模式', () => {
    expect(GUARD_POLICY_INTENSITIES).toEqual(['gentle', 'balanced', 'strict']);
    expect(GUARD_POLICY_SCOPE_MODES).toEqual(['current', 'all', 'nightStrict']);
  });
});

describe('simulateGuardPolicy — 回落与自由小时', () => {
  const events = Array.from({ length: 5 }, (_, index) => event(index + 1, 23));

  it('非法候选 → 回落 balanced/current (不炸)', () => {
    const result = simulateGuardPolicy({ rawIntensity: 'bogus', rawScopeMode: 'nope', rawScope: defaultGuardScope(), rawNightWindow: 'standard', hourlyRate: 50, events, now });
    expect(result.candidate).toEqual({ intensity: 'balanced', scopeMode: 'current' });
    expect(result.coveredEventCount).toBe(5);
  });

  it('hourlyRate 非法 → 回落 DEFAULT_HOURLY_RATE(25); freedomHours = saved/rate', () => {
    // 5 件 × savedAmount 50 = saved 250
    const result = simulateGuardPolicy({ rawIntensity: 'balanced', rawScopeMode: 'current', rawScope: defaultGuardScope(), rawNightWindow: 'standard', hourlyRate: -1, events, now });
    expect(result.freedomHours).toBeCloseTo(250 / 25, 5); // 回落 DEFAULT_HOURLY_RATE=25
    const custom = simulateGuardPolicy({ rawIntensity: 'balanced', rawScopeMode: 'current', rawScope: defaultGuardScope(), rawNightWindow: 'standard', hourlyRate: 25, events, now });
    expect(custom.freedomHours).toBeCloseTo(10, 5); // 250/25
  });

  it('匿名事件 (无 triggerId) 同时间戳去重 (真 bug #7 已修: 统一 key 路径)', () => {
    const dup = {
      eventType: 'challenge_completed',
      createdAt: new Date('2026-09-08T12:00:00').toISOString(),
      metadata: { category: 'food', savedAmount: 50 },
      triggerId: null,
    };
    const result = simulateGuardPolicy({ rawIntensity: 'balanced', rawScopeMode: 'current', rawScope: defaultGuardScope(), rawNightWindow: 'standard', hourlyRate: 50, events: [dup, { ...dup }], now });
    expect(result.coveredEventCount).toBe(1); // 同毫秒匿名 → 去重
    expect(result.freedomHours).toBeCloseTo(50 / 50, 5); // 只计一次
  });

  it('strict 强度: 每个覆盖事件都算扰动日', () => {
    const days = [event(1, 14), event(2, 15), event(3, 16), event(4, 17), event(5, 18)];
    const result = simulateGuardPolicyCandidate({ intensity: 'strict', scopeMode: 'current' }, { rawScope: defaultGuardScope(), rawNightWindow: 'standard', hourlyRate: 50, events: days, now });
    expect(result.potentialDisturbanceDays).toBe(5); // 全部
  });
});

describe('guardPolicyNightHours', () => {
  it('preset → hours 数组; off → DEFAULT_LATE_NIGHT_HOURS (统计照常语义); 非法回落 standard', () => {
    expect(guardPolicyNightHours('off')).toEqual(guardPolicyNightHours('standard')); // off=DEFAULT_LATE_NIGHT_HOURS=standard 档小时集 (banner 层自判 off)
    const hours = guardPolicyNightHours('standard');
    expect(Array.isArray(hours)).toBe(true);
    expect(hours.length).toBeGreaterThan(0);
    expect(guardPolicyNightHours('bogus')).toEqual(guardPolicyNightHours('standard')); // 非法回落 standard
  });
});
