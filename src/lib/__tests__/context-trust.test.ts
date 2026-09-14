import { describe, expect, it } from 'vitest';
import { buildTrustEvidence, type ContextTrustInput } from '../context-trust';

const words = [{ id: 'emotion_reward.treat', zh: '奖励自己', en: 'reward myself' }];
const now = new Date('2026-09-09T00:00:00.000Z');

function build(input: Partial<ContextTrustInput> = {}) {
  return buildTrustEvidence({ signal: 'emotion_reward', words, now, ...input });
}

describe('buildTrustEvidence', () => {
  it('returns no card when there is no evidence', () => {
    expect(buildTrustEvidence({ signal: 'emotion_reward', words: [], now })).toBeNull();
  });

  it('falls back to a minimal current-conversation card with signal only', () => {
    const evidence = build();
    expect(evidence?.minimal).toBe(true);
    expect(evidence?.signals).toEqual(words);
    expect(evidence?.facts).toEqual([]);
    expect(evidence?.history).toEqual([]);
  });

  it('marks facts past the freshness window as stale while preserving current facts', () => {
    const evidence = build({
      facts: [
        { category: 'preference', key: 'material', value: 'cotton', updatedAt: now },
        { category: 'size', key: 'shoes', value: 'EU 42', updatedAt: '2025-01-01T00:00:00.000Z' },
      ],
    });
    expect(evidence?.minimal).toBe(false);
    expect(evidence?.facts.map((fact) => fact.stale)).toEqual([false, true]);
    expect(evidence?.conflicts.some((item) => item.stale)).toBe(true);
  });

  it('labels repeated history as an inference rather than a fact', () => {
    const evidence = build({ history: [
      { description: 'late-night browsing', occurredAt: now },
      { description: 'late-night browsing', occurredAt: now },
    ] });
    const repeated = evidence?.history.find((item) => item.inferred);
    expect(repeated?.source).toBe('inference');
    expect(repeated?.en).toContain('2 times');
    expect(repeated?.en).toContain('Inferred');
  });

  it('applies recent user corrections as current-conversation evidence', () => {
    const evidence = build({ correction: { kind: 'not_me', topic: 'reward shopping', occurredAt: now } });
    expect(evidence?.facts.some((item) => item.source === 'conversation' && item.zh.includes('你刚纠正过'))).toBe(true);
    expect(evidence?.history.some((item) => item.inferred && item.zh.includes('先确认'))).toBe(true);
  });

  it('prioritizes explicit preferences when facts and history conflict', () => {
    const evidence = build({
      facts: [{ category: 'preference', key: 'material', value: 'cotton', updatedAt: now }],
      history: [{ description: 'bought synthetic', occurredAt: now }],
    });
    expect(evidence?.conflicts.some((item) => item.zh.includes('显式偏好'))).toBe(true);
    expect(evidence?.minimal).toBe(false);
  });
});
