/**
 * player/ 子目录 index — re-export（C2 拆分）
 *
 * 从 use-butterfly-normal-player.ts 抽出的类型/纯辅助函数集中 re-export。
 * 主 hook 文件从此处 import，外部消费者不受影响。
 */

export type {
  SceneData,
  ChapterData,
  NormalPhase,
  UseButterflyNormalPlayerReturn,
} from './types';
export {
  splitScenes,
  convertStoryChapterToChapterData,
  shouldCompleteAfterSubmit,
  computeCompleteValues,
} from './helpers';
export type { StoryCompleteData } from './helpers';
export { normalPlayerReducer, initialNormalPlayerState } from './reducer';
export type { NormalPlayerState, NormalPlayerAction } from './reducer';
// C7 拆分: 统一 Player 接口 (Demo + Normal 共用)
export type { ButterflyPlayer, ButterflyPhase } from './butterfly-player';
export { adaptDemoPlayer } from './butterfly-player';
