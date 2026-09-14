import { describe, expect, it } from 'vitest';
import {
  buildGuardLedgerEvidence,
  classifyGuardEvidenceSource,
  explainGuardedHours,
  type GuardEvidenceEventInput,
} from '../guard-ledger-provenance';

const d = (day: number) => new Date(2026, 8, day, 9).toISOString();

const cases: Array<[GuardEvidenceEventInput, string]> = [
  [{ eventType: 'challenge_completed', metadata: { savedAmount: 20 } }, 'auto_challenge'],
  [{ eventType: 'challenge_failed', metadata: {} }, 'auto_challenge'],
  [{ eventType: 'challenge_reward', triggerSource: 'deposit_api' }, 'auto_challenge'],
  [{ eventType: 'manual_adjustment', metadata: { source: 'prepurchase', decision: 'buy' } }, 'chat_decision'],
  [{ eventType: 'manual_adjustment', metadata: { source: 'compare_decision' } }, 'chat_decision'],
  [{ eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption' } }, 'green_alt'],
  [{ eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption' } }, 'green_alt'],
  [{ eventType: 'manual_adjustment', metadata: { source: 'green_commitment' } }, 'commitment'],
  [{ eventType: 'manual_adjustment', metadata: { source: 'green_commitment_settlement' } }, 'commitment'],
  [{ eventType: 'manual_adjustment', metadata: { source: 'user_note' } }, 'manual'],
  [{ eventType: 'manual_adjustment', triggerSource: 'manual', metadata: {} }, 'manual'],
  [{ eventType: 'manual_adjustment', metadata: { source: 'data_reset', lane: 'all' } }, 'reset_audit'],
];

describe('guard ledger provenance', () => {
  it('classifies existing metadata and event-type combinations', () => {
    for (const [event, expected] of cases) {
      expect(classifyGuardEvidenceSource(event)).toBe(expected);
    }
    expect(classifyGuardEvidenceSource({ eventType: 'invitation_reward_failed' })).toBeNull();
    expect(classifyGuardEvidenceSource({ eventType: 'mindful_recovery', metadata: null })).toBeNull();
  });

  it('summarizes counts and local days, deduplicates trigger ids, and excludes audit/non-win rows', () => {
    const result = buildGuardLedgerEvidence([
      { eventType: 'challenge_completed', triggerId: 'a', metadata: { savedAmount: 20 }, createdAt: d(1) },
      { eventType: 'challenge_completed', triggerId: 'a', metadata: { savedAmount: 20 }, createdAt: d(1) },
      { eventType: 'challenge_completed', triggerId: 'b', metadata: { itemTitle: 'Blue shoes' }, createdAt: d(2) },
      { eventType: 'challenge_failed', triggerId: 'c', createdAt: d(2) },
      { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', category: 'home' }, createdAt: d(3) },
      { eventType: 'manual_adjustment', metadata: { source: 'data_reset' }, createdAt: d(4) },
    ]);

    expect(result.status).toBe('ok');
    const bySource = Object.fromEntries(result.summary.map((item) => [item.source, item]));
    expect(bySource.auto_challenge).toMatchObject({ count: 3, days: 2, includedInWinCalculations: true });
    expect(bySource.green_alt).toMatchObject({ count: 1, days: 1, includedInWinCalculations: true });
    expect(bySource.reset_audit).toMatchObject({ count: 1, days: 1, includedInWinCalculations: false });
    expect(result.excludedRows).toBe(2);
    expect(result.latestRows[0]).toMatchObject({ source: 'reset_audit', includedInWinCalculations: false });
    expect(result.latestRows).toHaveLength(3);
  });

  it('has a stable insufficient state and a private amount-free guarded-hours explanation', () => {
    expect(buildGuardLedgerEvidence(null)).toEqual({
      status: 'insufficient',
      summary: expect.any(Array),
      latestRows: [],
      excludedRows: 0,
    });
    const explanation = explainGuardedHours('Asia/Shanghai');
    expect(explanation).toEqual({
      formula: 'guarded_amount_divided_by_private_hourly_rate',
      timeWindow: 'all_time',
      includedSources: ['auto_challenge', 'chat_decision', 'green_alt'],
      deduplicationRule: 'trigger_id_else_id_else_source_event_created_at',
      timezone: 'Asia/Shanghai',
    });
    expect(JSON.stringify(explanation)).not.toMatch(/saved total|money|\$[0-9]/i);
  });
});
