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

/**
 * 🎯 Wave 1 首条点亮（doc/jev-wave1-first-light-plan §3.2）：
 * 生产用 gate 工厂 — Jev 到位前用 LLMWrapperGate + createLLMCompletion 模拟层。
 * gate-agnostic：消费方只拿 DecisionGate 接口，Jev 到位后只换此工厂内部实现。
 * 惰性构造（模块级缓存）：开关关闭时零开销（不建 gate 对象、不发任何调用）。
 */
let _productionGate: import('./types').DecisionGate | null = null;
export function getProductionGate(): import('./types').DecisionGate | null {
  if (!isDecisionGateEnabled()) return null;
  if (_productionGate === null) {
    try {
      _productionGate = new LLMWrapperGate({ call: createLLMCompletion });
    } catch (err) {
      // safe to ignore: 工厂构造失败由调用方 fallback 分支兜住, 此处只留痕
      logger.warn('[DecisionGate] production gate 构造失败, 点亮接线将全部回退原生', err);
      return null;
    }
  }
  return _productionGate;
}

import { logger } from '@/lib/logger';
import { LLMWrapperGate } from './llm-wrapper-gate';
import { createLLMCompletion } from '@/lib/llm-client';
