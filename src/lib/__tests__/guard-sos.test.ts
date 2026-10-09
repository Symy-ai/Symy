import { describe, expect, it } from 'vitest';

import { buildGuardSosMetadata, buildGuardSosTurn } from '../guard-sos';

/**
 * guard-sos.ts (51行) — SOS 降温对话派生 (batch59-a)。
 *
 * 红线: SOS 是求助不是认罪 — 三档选项 key 无羞辱词。
 *
 * 锁定:
 * - leadKey 跟随 guard-intensity 三档
 * - 三选项顺序固定 (hold/alt/release)
 * - hoursLeft: ceil 归一; ≤0/NaN/∞ → 1 兜底
 * - metadata 四键 (source=guard_sos)
 */
describe('buildGuardSosTurn', () => {
  it('leadKey 跟随三档 intensity', () => {
    expect(buildGuardSosTurn('gentle', 5).leadKey).toBe('chat.activeGuards.sos.lead.gentle');
    expect(buildGuardSosTurn('balanced', 5).leadKey).toBe('chat.activeGuards.sos.lead.balanced');
    expect(buildGuardSosTurn('strict', 5).leadKey).toBe('chat.activeGuards.sos.lead.strict');
  });

  it('三选项顺序固定 hold/alt/release + key 律', () => {
    const turn = buildGuardSosTurn('balanced', 3);
    expect(turn.options.map((o) => o.id)).toEqual(['hold', 'alt', 'release']);
    expect(turn.options[0].labelKey).toBe('chat.activeGuards.sos.option.hold');
    expect(turn.options[2].noteKey).toBe('chat.activeGuards.sos.optionNote.release');
  });

  it('hoursLeft: ceil 归一; 非法值 → 1 兜底', () => {
    expect(buildGuardSosTurn('gentle', 2.1).hoursLeft).toBe(3); // ceil
    expect(buildGuardSosTurn('gentle', 0).hoursLeft).toBe(1);
    expect(buildGuardSosTurn('gentle', -5).hoursLeft).toBe(1);
    expect(buildGuardSosTurn('gentle', Number.NaN).hoursLeft).toBe(1);
    expect(buildGuardSosTurn('gentle', Number.POSITIVE_INFINITY).hoursLeft).toBe(1);
  });
});

describe('buildGuardSosMetadata', () => {
  it('四键: source=guard_sos + ref 三件 + choice', () => {
    const meta = buildGuardSosMetadata('challenge', 'ch_123', 'hold');
    expect(meta).toEqual({
      source: 'guard_sos',
      ref_kind: 'challenge',
      ref_key: 'ch_123',
      choice: 'hold',
    });
  });
});
