import { describe, expect, it } from 'vitest';

import { BUDDY_GRADIENT } from '../chat-accents';

/**
 * chat-accents.ts — 健康态配色 (Wave 1 纯常量)。
 *
 * 🔧 R1041 收编: BUDDY_ACCENT 已删 — 09-06 minimal 化删头像/健康徽章后
 *   accent 表全库生产零消费 (仅本测试引用), 与 ChatHeader 死 props 同族收编.
 *
 * 锁定:
 * - 五健康态全覆盖 (thriving/healthy/weak/critical/dormant)
 * - gradient 双色渐变全配
 */
describe('chat-accents 五态配色', () => {
  const states = ['thriving', 'healthy', 'weak', 'critical', 'dormant'] as const;

  it('五态 gradient 全覆盖', () => {
    for (const s of states) {
      expect(BUDDY_GRADIENT[s]).toBeTruthy();
    }
    expect(Object.keys(BUDDY_GRADIENT)).toHaveLength(5);
  });

  it('gradient from-to 结构', () => {
    for (const s of states) {
      expect(BUDDY_GRADIENT[s]).toMatch(/^from-\S+ to-\S+$/);
    }
  });
});
