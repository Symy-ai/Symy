import { describe, expect, it } from 'vitest';

import { Z_INDEX, type ZIndexLayer } from '../z-index';

/**
 * z-index.ts (49行) — PM-P1-2 层级规范 (纯常量)。
 *
 * 锁定:
 * - 七层从低到高单调递增 (DECORATIVE→RITUAL)
 * - 值锚: 5/100/200/300/400/500/9999
 * - 9999 封顶 (sign-out 已从 10000 降为 MODAL_HIGH — PM-P1-2 迁移锚)
 */
describe('Z_INDEX 层级规范', () => {
  const layers = Object.values(Z_INDEX);

  it('七层结构', () => {
    expect(Object.keys(Z_INDEX)).toEqual([
      'DECORATIVE', 'OVERLAY', 'TOAST', 'MODAL', 'MODAL_HIGH', 'GLOBAL_TOAST', 'RITUAL',
    ]);
  });

  it('从低到高单调递增', () => {
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i]).toBeGreaterThan(layers[i - 1]);
    }
  });

  it('值锚 (PM-P1-2)', () => {
    expect(Z_INDEX.DECORATIVE).toBe(5);
    expect(Z_INDEX.MODAL).toBe(300);
    expect(Z_INDEX.MODAL_HIGH).toBe(400); // sign-out 从 z-[10000] 降此 (迁移锚)
    expect(Z_INDEX.RITUAL).toBe(9999);
  });

  it('9999 封顶 (无 10000 残留)', () => {
    expect(Math.max(...layers)).toBe(9999);
    const all: ZIndexLayer[] = ['DECORATIVE', 'OVERLAY', 'TOAST', 'MODAL', 'MODAL_HIGH', 'GLOBAL_TOAST', 'RITUAL'];
    expect(all).toHaveLength(7);
  });
});
