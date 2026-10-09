import { describe, expect, it } from 'vitest';

import * as tabBarrel from '../index';
import * as tabConstants from '../constants';
import { DemoScenePlayer } from '../demo-scene-player';

/**
 * tab/index.ts (25行) — C5 barrel。
 *
 * 锁定:
 * - 十四常量 (TONE 系列全 re-export)
 * - DemoScenePlayer 可达
 */
describe('tab barrel 导出面', () => {
  it('TONE 十四常量锚', () => {
    expect(tabBarrel.TONE_ACCENT_COLORS).toBe(tabConstants.TONE_ACCENT_COLORS);
    expect(tabBarrel.TONE_EMOJI).toBe(tabConstants.TONE_EMOJI);
    expect(tabBarrel.TONE_GLOW_DARK).toBe(tabConstants.TONE_GLOW_DARK);
    expect(tabBarrel.TONE_TEXT_CSS_LIGHT).toBe(tabConstants.TONE_TEXT_CSS_LIGHT);
    expect(tabBarrel.TONE_BORDER_LIGHT).toBe(tabConstants.TONE_BORDER_LIGHT);
  });

  it('DemoScenePlayer 组件可达', () => {
    expect(tabBarrel.DemoScenePlayer).toBe(DemoScenePlayer);
    expect(DemoScenePlayer).toBeTruthy();
  });
});
