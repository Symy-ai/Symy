import { describe, expect, it } from 'vitest';

import {
  ALL_REFLECTION_QUESTIONS,
  REFLECTION_QUESTIONS_EN,
  REFLECTION_QUESTIONS_ZH,
} from '../reflection-questions';
import { isReflectionQuestion } from '@/app/api/chat/parts/reflection-detector';

describe('reflection questions tone guard', () => {
  it('keeps both locale pools at twelve unique questions', () => {
    expect(REFLECTION_QUESTIONS_EN).toHaveLength(12);
    expect(REFLECTION_QUESTIONS_ZH).toHaveLength(12);
    expect(new Set(REFLECTION_QUESTIONS_EN).size).toBe(12);
    expect(new Set(REFLECTION_QUESTIONS_ZH).size).toBe(12);
    expect(new Set(ALL_REFLECTION_QUESTIONS).size).toBe(24);
  });

  it('removes the old judgmental anchors', () => {
    expect(REFLECTION_QUESTIONS_EN.join(' ')).not.toContain('What need were you trying to fill');
    expect(REFLECTION_QUESTIONS_EN.join(' ')).not.toContain('actually hungry');
    expect(REFLECTION_QUESTIONS_ZH.join('')).not.toContain('想满足什么需求');
    expect(REFLECTION_QUESTIONS_ZH.join('')).not.toContain('真正渴望');
  });

  it('keeps guardian and green hooks in Chinese', () => {
    const joined = REFLECTION_QUESTIONS_ZH.join('');
    expect(REFLECTION_QUESTIONS_ZH.filter((question) => /耐用|复用|小金库|自由|地球/.test(question)).length).toBeGreaterThanOrEqual(4);
    expect(REFLECTION_QUESTIONS_ZH.filter((question) => /省下|留下|去向/.test(question)).length).toBeGreaterThanOrEqual(3);
    expect(joined).toBeTruthy();
  });

  it('keeps guardian and green hooks in English', () => {
    const greenWords = /durable|reuse|piggy bank|free|earth/i;
    const moneyWords = /saved|keep|go/i;
    expect(REFLECTION_QUESTIONS_EN.filter((question) => greenWords.test(question)).length).toBeGreaterThanOrEqual(4);
    expect(REFLECTION_QUESTIONS_EN.filter((question) => moneyWords.test(question)).length).toBeGreaterThanOrEqual(3);
  });

  it('preserves the open-question form', () => {
    for (const question of ALL_REFLECTION_QUESTIONS) {
      expect(/[?？]$/.test(question)).toBe(true);
    }
  });

  it('keeps the backend whitelist synchronized with both pools', () => {
    expect(isReflectionQuestion(REFLECTION_QUESTIONS_ZH[0])).toBe(true);
    expect(isReflectionQuestion(REFLECTION_QUESTIONS_EN[0])).toBe(true);
  });
});
