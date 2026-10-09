import { describe, expect, it } from 'vitest';

import * as playerBarrel from '../index';
import * as helpers from '../helpers';
import { initialNormalPlayerState, normalPlayerReducer } from '../reducer';
import { adaptDemoPlayer } from '../butterfly-player';

/**
 * player/index.ts (25行) — C2 barrel。
 *
 * 锁定:
 * - helpers 四函数
 * - reducer 双导出
 * - adaptDemoPlayer (C7 统一接口)
 */
describe('player barrel 导出面', () => {
  it('helpers 四函数锚', () => {
    expect(playerBarrel.splitScenes).toBe(helpers.splitScenes);
    expect(playerBarrel.convertStoryChapterToChapterData).toBe(helpers.convertStoryChapterToChapterData);
    expect(playerBarrel.shouldCompleteAfterSubmit).toBe(helpers.shouldCompleteAfterSubmit);
    expect(playerBarrel.computeCompleteValues).toBe(helpers.computeCompleteValues);
  });

  it('reducer 双导出 + C7 adaptDemoPlayer', () => {
    expect(playerBarrel.normalPlayerReducer).toBe(normalPlayerReducer);
    expect(playerBarrel.initialNormalPlayerState).toBe(initialNormalPlayerState);
    expect(playerBarrel.adaptDemoPlayer).toBe(adaptDemoPlayer);
    expect(typeof initialNormalPlayerState).toBe('object'); // 初始态工厂/常量
  });
});
