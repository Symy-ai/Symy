/**
 * DecisionGate 统一出口（方案 §4）
 *
 * Phase 0 只建不接：Jev 还在 waitlist，LLMWrapperGate 也没接进任何业务管道
 * （green-first-rank 的接线是 Wave 0 验收线之后的事）。开关默认关。
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

/** 语义层总开关——DECISION_GATE_ENABLED=1 才允许接线（默认关，Phase 0 只建不接） */
export function isDecisionGateEnabled(): boolean {
  return process.env.DECISION_GATE_ENABLED === '1';
}
