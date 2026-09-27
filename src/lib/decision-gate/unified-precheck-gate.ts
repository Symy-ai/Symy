/**
 * unified-precheck-gate — Wave 1 骨架：N 个预检问题打包成单次 DecisionGate 调用
 *
 * 背景（doc/Jev-引入方案-v2.md §2「两级门」+ doc/jev-wave1-recon-result.md）：
 *   预检器判定本体是 N 个互不相关的检测器，但每次请求只需要**一次**语义调用
 *   （Jev 的设计就是「单 state 塞尽可能多的问题、全部并行评估」）。
 *   本文件只负责【打包 → 调闸 → 按 id 对齐回位】，不含任何判定逻辑。
 *
 * 三条硬纪律（与 LLMWrapperGate 同款，别在 Wave 1 迁移时破）：
 *   1. **绝不 throw** —— 语义层是 bonus 不是依赖。超时/异常一律落
 *      {results: [], fallbackUsed: true}，消费端只跑规则层，行为与今天一致。
 *   2. **300ms 预算由这里管** —— gate 本体不含超时（LLMWrapperGate 纪律 1），
 *      预算预算 = Promise.race，超时即放弃，零降级感。
 *   3. **按 id 对齐，不信任顺序** —— gate 可能乱序/漏答；缺失的 id 落
 *      {value: 0, confidence: 0}（= 没命中，规则层继续），顺序恒等于 specs 顺序。
 *
 * 本文件是**骨架**（只建不接）：不改任何 parts/ 检测器，不改 chat route，
 * 没有真实 Jev 访问时不会被任何业务管道调用。
 */

import type { DecisionGate, GateQuestion, GateResult, GateState } from './types';

/** 预检判定单元的登记项：一个问题 + 它的规则层对应实现 */
export interface PrecheckQuestionSpec {
  /** 判定单元 id（与 precheck-registry.ts 的登记簿一一对应，如 'emotion-shopping-detector'） */
  detectorId: string;
  /** 判定本体住哪：b128 侦察结论 = 12 住 parts / 8 住 lib */
  source: 'parts' | 'lib';
  /** 打包进同一次 evaluate 的问题（Wave 0 的三型：noul / choice / score） */
  question: GateQuestion;
  /** 该判定单元的规则层实现路径（Wave 1 迁移时替换为 gate 结果的消费端） */
  ruleRef?: string;
}

/** 一次统一预检的产出 */
export interface UnifiedPrecheckResult {
  /** 与传入 specs **一一对应且同序**的判定结果（缺失的已落 {value:0, confidence:0}） */
  results: GateResult[];
  /** true = gate 超时/抛异常/未开通，消费端应只用规则层结果 */
  fallbackUsed: boolean;
  /** 本次统一预检的端到端耗时（毫秒） */
  totalLatencyMs: number;
}

/** 延迟预算（v2 方案 §2）：300ms 内不回来就放弃语义层，零降级感 */
export const PRECHECK_DEFAULT_TIMEOUT_MS = 300;

/** 缺失/未命中的结果形状——两级门里「没命中」不是一个错误状态 */
function missResult(spec: PrecheckQuestionSpec, latencyMs: number): GateResult {
  return { id: spec.question.id, kind: spec.question.kind, value: 0, confidence: 0, latencyMs };
}

/** 契约里 value 必填（number 或 number[]）：空对象/缺 value 的条目按漏答处理，不进 map */
function hasUsableValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return Array.isArray(value) && value.length > 0;
}

/**
 * 按 specs 顺序把 gate 的原始结果对回位：
 *   - 乱序 → 按 question.id 匹配后回位
 *   - 漏答 / 形状违约 → 落 {value:0, confidence:0}
 *   - 契约整体违约（evaluate 返回非数组）→ 全部落 miss，不抛
 */
function alignResults(specs: PrecheckQuestionSpec[], raw: unknown, latencyMs: number): GateResult[] {
  const byId = new Map<string, GateResult>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const candidate = entry as GateResult;
      if (typeof candidate.id !== 'string' || byId.has(candidate.id)) continue;
      if (!hasUsableValue(candidate.value)) continue;
      byId.set(candidate.id, { ...candidate, latencyMs: Math.max(0, candidate.latencyMs ?? latencyMs) });
    }
  }
  return specs.map((spec) => byId.get(spec.question.id) ?? missResult(spec, latencyMs));
}

/**
 * 把 N 个预检问题打包成一次 DecisionGate.evaluate 调用。
 *
 * 永不抛异常：超时 / gate 抛错 / 返回形状违约，一律返回 fallbackUsed=true，
 * 消费端回落到规则层（行为与今天逐字节一致）。
 *
 * @param gate 任意 DecisionGate 实现（Jev / LLMWrapperGate / fake）
 * @param state 被判定对象的快照（一条消息 = 一个 state）
 * @param specs 预检问题清单（顺序 = results 顺序）
 * @param opts timeoutMs 延迟预算，默认 300ms
 */
export async function runUnifiedPrecheck(
  gate: DecisionGate,
  state: GateState,
  specs: PrecheckQuestionSpec[],
  opts?: { timeoutMs?: number },
): Promise<UnifiedPrecheckResult> {
  const startedAt = performance.now();
  // 空清单不调闸：省掉一次无意义的网络往返，也让「没有要问的问题」不产生 fallback 噪音
  if (specs.length === 0) {
    return { results: [], fallbackUsed: false, totalLatencyMs: performance.now() - startedAt };
  }

  const timeoutMs = opts?.timeoutMs ?? PRECHECK_DEFAULT_TIMEOUT_MS;
  const questions = specs.map((spec) => spec.question);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // Promise.race 会给两臂都挂处理器：闸门在超时之后才 reject 也不会变成 unhandledRejection
    const evaluated = gate.evaluate(state, questions);
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });

    const raw = await Promise.race([evaluated, budget]);
    const latencyMs = performance.now() - startedAt;
    if (raw === null) return { results: [], fallbackUsed: true, totalLatencyMs: latencyMs };
    return { results: alignResults(specs, raw, latencyMs), fallbackUsed: false, totalLatencyMs: latencyMs };
  } catch {
    // 纪律 1：语义层失败等于没命中，规则快路径继续（方案 §2 降级链）
    return {
      results: [],
      fallbackUsed: true,
      totalLatencyMs: performance.now() - startedAt,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
