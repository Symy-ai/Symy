import { describe, expect, it } from 'vitest';

import { CHOICE_CHAPTER_INDICES, DEFAULT_CHAPTER_COUNT } from '../constants';

/**
 * engine/constants.ts (18行) — story-engine 常量 (C6 拆分)。
 *
 * 锁定:
 * - DEFAULT_CHAPTER_COUNT=3 (5→3 缩短体验)
 * - CHOICE_CHAPTER_INDICES=[2] (3 章制唯一 crossroads; 第 3 章是结局)
 * - 不变量: 选择章 < 章节数 (结构合法性)
 */
describe('engine 常量', () => {
  it('三章制锚 (5→3 缩短)', () => {
    expect(DEFAULT_CHAPTER_COUNT).toBe(3);
  });

  it('选择章唯一 crossroads [2]', () => {
    expect(CHOICE_CHAPTER_INDICES).toEqual([2]);
  });

  it('结构不变量: 选择章均在结局章之前', () => {
    for (const idx of CHOICE_CHAPTER_INDICES) {
      expect(idx).toBeLessThan(DEFAULT_CHAPTER_COUNT); // 第 3 章 (结局) 无选择
    }
  });
});
