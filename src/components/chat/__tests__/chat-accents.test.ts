import { describe, expect, it } from 'vitest';

import { BUDDY_ACCENT, BUDDY_GRADIENT } from '../chat-accents';

/**
 * chat-accents.ts (19行) — 健康态配色双表 (Wave 1 纯常量)。
 *
 * 锁定:
 * - 五健康态全覆盖 (thriving/healthy/weak/critical/dormant)
 * - accent 色语义: 绿系生机→黄弱→红危→灰眠
 * - gradient 双色渐变全配
 */
describe('chat-accents 五态配色', () => {
  const states = ['thriving', 'healthy', 'weak', 'critical', 'dormant'] as const;

  it('五态双表全覆盖', () => {
    for (const s of states) {
      expect(BUDDY_ACCENT[s]).toBeTruthy();
      expect(BUDDY_GRADIENT[s]).toBeTruthy();
    }
    expect(Object.keys(BUDDY_ACCENT)).toHaveLength(5);
    expect(Object.keys(BUDDY_GRADIENT)).toHaveLength(5);
  });

  it('色语义锚: thriving 绿/critical 红/dormant 灰', () => {
    expect(BUDDY_ACCENT.thriving).toContain('text-green-400');
    expect(BUDDY_ACCENT.weak).toContain('text-yellow-400');
    expect(BUDDY_ACCENT.critical).toContain('text-red-400');
    expect(BUDDY_ACCENT.dormant).toContain('text-gray-500');
  });

  it('gradient from-to 结构', () => {
    for (const s of states) {
      expect(BUDDY_GRADIENT[s]).toMatch(/^from-\S+ to-\S+$/);
    }
  });
});
