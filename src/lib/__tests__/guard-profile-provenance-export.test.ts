import { describe, expect, it } from 'vitest';
import { buildGuardProfileExport } from '../guard-profile-export';
import type { GuardStyleEventInput } from '../guard-style-profile';

const d = (day: number) => new Date(2026, 8, day, 10).toISOString();
const events: GuardStyleEventInput[] = [
  { eventType: 'challenge_completed', triggerId: 'a', metadata: { savedAmount: 40 }, createdAt: d(1) },
  { eventType: 'challenge_completed', triggerId: 'b', metadata: { savedAmount: 60 }, createdAt: d(2) },
  { eventType: 'challenge_completed', triggerId: 'c', metadata: { savedAmount: 20 }, createdAt: d(3) },
  { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', estSaved: 20 }, createdAt: d(4) },
  { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', estSaved: 30 }, createdAt: d(5) },
];

const baseline = buildGuardProfileExport({ locale: 'zh', hourlyRate: 25, events });
const integrated = buildGuardProfileExport({
  locale: 'zh',
  hourlyRate: 25,
  events,
  evidenceEvents: [
    ...events,
    { eventType: 'manual_adjustment', metadata: { source: 'data_reset' }, createdAt: d(6) },
  ],
});

describe('guard profile provenance export', () => {
  it('keeps totals numerically identical before and after provenance integration', () => {
    expect(integrated.status).toBe(baseline.status);
    expect(integrated.privateStats.totalSavedEstimate).toBe(baseline.privateStats.totalSavedEstimate);
    expect(integrated.stats?.freedomHours).toBe(baseline.stats?.freedomHours);
    expect(integrated.evidence.excludedRows).toBe(1);
  });

  it('adds evidence only to the private full text and keeps share amount-free', () => {
    expect(integrated.fullText).toContain('证据（仅自己可见）');
    expect(integrated.fullText).toContain('重置审计：1 条 / 1 天（不进入战绩计算）');
    expect(integrated.fullText).toContain('全时段有效守护金额 ÷ 私人时薪');
    expect(integrated.shareText).not.toContain('证据');
    expect(integrated.shareText).not.toMatch(/[$¥€£]/);
  });
});
