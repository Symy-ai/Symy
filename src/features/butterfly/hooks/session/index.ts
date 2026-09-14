/**
 * session/ 子目录 index — re-export（C1 + 阶段1拆分 + XState 阶段0 machine 骨架）
 *
 * 从 use-butterfly-session.ts 抽出的类型/常量/纯辅助函数集中 re-export。
 * XState machine 文件（butterfly-machine/machine-actions/machine-services）也从此处 re-export。
 * 主 hook 文件从此处 import，外部消费者不受影响。
 */

export type { PreloadedChapterData, UseButterflySessionReturn } from './types';
export { DEFAULT_UI_STATE, API, DEMO_API } from './constants';
export { buildChoicesMap } from './helpers';
export type { PreloadAccumulator, PreloadContext } from './preload-logic';
export {
  createPreloadAccumulator,
  parseSSELine,
  reducePreloadEvent,
  buildPreloadedChapter,
} from './preload-logic';

// XState 完整重写：machine + actions + services/guards
export { butterflyMachine, initialContext } from './butterfly-machine';
export type {
  ButterflyMachineContext,
  ButterflyMachineEvent,
  ButterflyMachineActor,
  ButterflyEndpoints,
  ContinueResult,
  SubmitChoiceResult,
} from './butterfly-machine';
export { MachineActions } from './machine-actions';
export type { MachineActions as MachineActionsType } from './machine-actions';
export {
  MachineGuards,
  loadActiveService,
  generateOutlineService,
  streamStoryService,
  // 🔧 ARCH fix (Round 12 XSTATE-15): continueService 已删除 (死代码)
  submitChoiceService,
  regenerateService,
  // 🔧 ARCH fix (Round 13 BUG-8): 导出 AuthExpiredError 供 guard 检查
  AuthExpiredError,
} from './machine-services';
export type {
  MachineServices,
  MachineGuards as MachineGuardsType,
  LoadActiveInput,
  GenerateOutlineInput,
  StreamStoryInput,
  // 🔧 ARCH fix (Round 12 XSTATE-15): ContinueInput 已删除 (死代码)
  SubmitChoiceInput,
  RegenerateInput,
} from './machine-services';
