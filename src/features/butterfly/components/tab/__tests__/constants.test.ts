import { describe, expect, it } from 'vitest';

import {
  EXAMPLE_DECISION_KEYS,
  TONE_ACCENT_COLORS,
  TONE_ACCENT_COLORS_LIGHT,
  TONE_ACCENT_DARK,
  TONE_ACCENT_LIGHT,
  TONE_BORDER_COLORS,
  TONE_BORDER_DARK,
  TONE_EMOJI,
  TONE_GLOW_DARK,
  TONE_GLOW_LIGHT,
} from '../constants';

/**
 * tab/constants.ts (119行) — TONE 常量单一事实源 (Round 73 F5.1, C5 拆分)。
 *
 * 锁定:
 * - EXAMPLE_DECISION_KEYS: 9 样本三类型分布 (P1-8: considering 三条)
 * - 四基调色: 每映射四键齐全
 * - 别名兼容: *_DARK/*_LIGHT 指向同一对象 (零漂移)
 * - TONE_EMOJI 四基调
 */
describe('tab/constants 单一事实源', () => {
  it('EXAMPLE_DECISION_KEYS: 9 样本, bought 4 / resisted 2 / considering 3 (P1-8)', () => {
    expect(EXAMPLE_DECISION_KEYS).toHaveLength(9);
    const by = (t: string) => EXAMPLE_DECISION_KEYS.filter((e) => e.type === t).length;
    expect(by('bought')).toBe(4);
    expect(by('resisted')).toBe(2);
    expect(by('considering')).toBe(3); // P1-8 fix 补齐
  });

  it('样本字段完整 (type/descKey/amount/platform)', () => {
    for (const e of EXAMPLE_DECISION_KEYS) {
      expect(e.descKey.startsWith('butterfly.examples.')).toBe(true);
      expect(e.amount).toBeGreaterThan(0);
      expect(e.platform.length).toBeGreaterThan(0);
    }
  });

  it('四基调色映射: accent/border/emoji 每表四键', () => {
    const tones = ['hopeful', 'neutral', 'dark', 'twist'];
    for (const t of tones) {
      expect(TONE_ACCENT_COLORS[t]).toBeTruthy();
      expect(TONE_ACCENT_COLORS_LIGHT[t]).toBeTruthy();
      expect(TONE_BORDER_COLORS[t]).toBeTruthy();
      expect(TONE_EMOJI[t]).toBeTruthy();
      expect(TONE_GLOW_DARK[t]).toBeTruthy();
      expect(TONE_GLOW_LIGHT[t]).toBeTruthy();
    }
  });

  it('别名兼容: DARK/LIGHT 别名指向同一对象 (零漂移)', () => {
    expect(TONE_ACCENT_DARK).toBe(TONE_ACCENT_COLORS);
    expect(TONE_ACCENT_LIGHT).toBe(TONE_ACCENT_COLORS_LIGHT);
    expect(TONE_BORDER_DARK).toBe(TONE_BORDER_COLORS);
  });

  it('emoji 锚: hopeful 🌱 / neutral ⚖️ / dark 🌑 / twist 🌀', () => {
    expect(TONE_EMOJI.hopeful).toBe('🌱');
    expect(TONE_EMOJI.neutral).toBe('⚖️');
    expect(TONE_EMOJI.dark).toBe('🌑');
    expect(TONE_EMOJI.twist).toBe('🌀');
  });
});
