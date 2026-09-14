/**
 * tab/ 子目录 index — re-export（C5 拆分）
 *
 * 从 butterfly-tab.tsx 抽出的子组件/类型/常量集中 re-export。
 * 主文件从此处 import，外部消费者不受影响。
 */

export type { ButterflyTabProps, DemoScenePlayerProps } from './types';
export {
  EXAMPLE_DECISION_KEYS,
  TONE_ACCENT_COLORS,
  TONE_ACCENT_COLORS_LIGHT,
  TONE_ACCENT_DARK,
  TONE_ACCENT_LIGHT,
  TONE_BORDER_COLORS,
  TONE_BORDER_COLORS_LIGHT,
  TONE_BORDER_DARK,
  TONE_BORDER_LIGHT,
  TONE_GLOW_DARK,
  TONE_GLOW_LIGHT,
  TONE_EMOJI,
  TONE_TEXT_CSS_DARK,
  TONE_TEXT_CSS_LIGHT,
} from './constants';
export { DemoScenePlayer } from './demo-scene-player';
