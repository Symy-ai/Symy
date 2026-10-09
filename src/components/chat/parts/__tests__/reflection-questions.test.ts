import { describe, expect, it } from 'vitest';

import {
  ALL_REFLECTION_QUESTIONS,
  REFLECTION_QUESTIONS_EN,
  REFLECTION_QUESTIONS_ZH,
} from '../reflection-questions';

/**
 * reflection-questions.ts (39行) — 反思问题 SSOT (P0-1)。
 *
 * 锁定:
 * - 双语各 12 问 (等长对齐)
 * - ALL = EN+ZH 拼接 (24)
 * - 无重复问题; 每问非空
 * - 反 FOMO/非说教语气抽查 (镜子哲学)
 */
describe('reflection-questions SSOT', () => {
  it('双语各 12 问等长', () => {
    expect(REFLECTION_QUESTIONS_EN).toHaveLength(12);
    expect(REFLECTION_QUESTIONS_ZH).toHaveLength(12);
  });

  it('ALL 拼接 24 问; 无重复; 每问非空', () => {
    expect(ALL_REFLECTION_QUESTIONS).toHaveLength(24);
    expect(new Set(ALL_REFLECTION_QUESTIONS).size).toBe(24); // 无重复
    for (const q of ALL_REFLECTION_QUESTIONS) {
      expect(q.length).toBeGreaterThan(4);
      expect(q.endsWith('？') || q.endsWith('?') || q.endsWith('.')).toBe(true); // 完整句
    }
  });

  it('EN 前 4 问+ZH 首问内容锚 (SSOT 防漂移)', () => {
    expect(REFLECTION_QUESTIONS_EN[0]).toBe('What do you truly want right now?');
    expect(REFLECTION_QUESTIONS_EN[3]).toBe('What were you doing ten minutes before it appeared?');
    expect(REFLECTION_QUESTIONS_ZH[0]).toBe('现在真正想要的是什么呢？');
    expect(REFLECTION_QUESTIONS_ZH[7]).toBe('身体现在更紧一点，还是松一点？');
  });

  it('语气抽查: 无命令/羞辱词 (镜子哲学非说教)', () => {
    const all = ALL_REFLECTION_QUESTIONS.join('|');
    for (const bad of ['不要买', '禁止', '必须', '别买', '不许', 'Do not', 'Must not']) {
      expect(all).not.toContain(bad);
    }
  });
});
