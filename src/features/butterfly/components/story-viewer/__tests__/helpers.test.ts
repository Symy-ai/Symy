import { describe, expect, it } from 'vitest';

import { TONE_COLORS, splitScenes, groupIntoScenes } from '../helpers';

/**
 * helpers.ts (93行) — TONE_COLORS 色板 + 场景分割 (Round 80 F4 拆分)。
 *
 * 锁定:
 * - TONE_COLORS 四基调八字段全键
 * - splitScenes: ||| 分割 + trim + 空段过滤
 * - 旧格式兼容: 无 ||| 且 >80 字 → 按句分组
 * - 短文本单场景兜底
 */
describe('TONE_COLORS 四基调色板', () => {
  it('四基调八字段全键', () => {
    const tones = ['hopeful', 'neutral', 'dark', 'twist'] as const;
    const fields = ['text', 'glowCSS', 'gradientCSS', 'accentColor', 'accentBg', 'borderColor', 'dotColor', 'particleColor'];
    for (const t of tones) {
      for (const f of fields) {
        expect(TONE_COLORS[t][f as keyof typeof TONE_COLORS['hopeful']]).toBeTruthy();
      }
    }
  });

  it('锚: hopeful emerald / dark red / twist purple', () => {
    expect(TONE_COLORS.hopeful.text).toContain('emerald');
    expect(TONE_COLORS.dark.text).toContain('red');
    expect(TONE_COLORS.twist.text).toContain('purple');
  });
});

describe('splitScenes 场景分割', () => {
  it('||| 分割 + trim + 空段过滤', () => {
    expect(splitScenes('场景一 |||  场景二 ||| ||| 场景三')).toEqual(['场景一', '场景二', '场景三']);
  });

  it('旧格式兼容: 无 ||| 且 >80 字 → 按句分组', () => {
    const long = '这是一段很长的旧格式内容。'.repeat(20); // >80 字
    const scenes = splitScenes(long);
    expect(scenes.length).toBeGreaterThan(1);
  });

  it('短文本 (<80 字无 |||) → 单场景直返', () => {
    expect(splitScenes('短内容')).toEqual(['短内容']);
  });

  it('空串 → [content] 兜底 (非空数组)', () => {
    const r = splitScenes('');
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

describe('groupIntoScenes 按句分组', () => {
  it('>50 字句段切分 + 尾句收尾', () => {
    const text = '第一句话。' + '很长的句子'.repeat(15) + '。结尾。';
    const scenes = groupIntoScenes(text);
    expect(scenes.length).toBeGreaterThanOrEqual(2);
    for (const s of scenes) {
      expect(s.length).toBeGreaterThan(0);
      expect(s.endsWith('。')).toBe(true);
    }
  });
});
