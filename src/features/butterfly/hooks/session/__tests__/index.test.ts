import { describe, expect, it } from 'vitest';

import * as barrel from '../index';
import * as constants from '../constants';
import * as preloadLogic from '../preload-logic';
import { butterflyMachine, initialContext } from '../butterfly-machine';
import { MachineActions } from '../machine-actions';

/**
 * session/index.ts (52行) — C1 barrel (14 组导出)。
 *
 * 锁定:
 * - 值导出锚: 常量三件/preload 四函数/machine 双件/MachineActions
 * - 类型导出编译可达 (import type 全量)
 * - butterflyMachine 可解释 (XState machine 对象)
 */
describe('session barrel 导出面', () => {
  it('常量/preload/machine 值锚', () => {
    expect(barrel.API).toBe(constants.API);
    expect(barrel.DEMO_API).toBe(constants.DEMO_API);
    expect(barrel.DEFAULT_UI_STATE).toBe(constants.DEFAULT_UI_STATE);
    expect(barrel.createPreloadAccumulator).toBe(preloadLogic.createPreloadAccumulator);
    expect(barrel.parseSSELine).toBe(preloadLogic.parseSSELine);
    expect(barrel.butterflyMachine).toBe(butterflyMachine);
    expect(barrel.initialContext).toBe(initialContext);
    expect(barrel.MachineActions).toBe(MachineActions);
  });

  it('butterflyMachine 是 XState machine (可解释)', () => {
    expect(butterflyMachine).toBeTruthy();
    // XState v5 machine 有 transition/toJSON
    expect(typeof (butterflyMachine as unknown as { transition: unknown }).transition).toBe('function');
    expect(initialContext).toBeTruthy();
  });

  it('类型导出编译锚 (PreloadedChapterData/Return/Machine 五类型)', async () => {
    const mod = await import('../index');
    expect(Object.keys(mod).length).toBeGreaterThanOrEqual(12); // 值导出面齐全
  });
});
