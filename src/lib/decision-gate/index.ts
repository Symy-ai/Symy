/**
 * DecisionGate 统一出口（方案 §4）
 *
 * Phase 0 只建不接：Jev 还在 waitlist，LLMWrapperGate 也没接进任何业务管道
 * （green-first-rank 的接线是 Wave 0 验收线之后的事）。开关默认关。
 *
 * Wave 1 前置骨架同样「只建不接」：runUnifiedPrecheck / PRECHECK_REGISTRY 没有任何
 * 业务调用方，改动一个检测器都不需要碰它。
 */

export type {
  DecisionGate,
  GateLevelDesc,
  GateProvider,
  GateQuestion,
  GateResult,
  GateState,
} from './types';

export { LLMWrapperGate } from './llm-wrapper-gate';
export type { GateLLMCall, LLMWrapperGateOptions } from './llm-wrapper-gate';

export {
  PRECHECK_DEFAULT_TIMEOUT_MS,
  runUnifiedPrecheck,
} from './unified-precheck-gate';
export type { PrecheckQuestionSpec, UnifiedPrecheckResult } from './unified-precheck-gate';

export {
  PRECHECK_REGISTRY,
  PRECHECK_REGISTRY_SIZE,
  WAVE1_OUT_OF_REGISTRY,
  findPrecheckSpec,
} from './precheck-registry';

/** 语义层总开关——DECISION_GATE_ENABLED=1 才允许接线（默认关，Phase 0 只建不接） */
export function isDecisionGateEnabled(): boolean {
  return process.env.DECISION_GATE_ENABLED === '1';
}
