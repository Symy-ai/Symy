/**
 * LLMWrapperGate — 用 LLM 通道模拟 Jev 的三种输出（Noul / Choice / Score）
 *
 * Phase 0（方案 §6 行动清单 #2）：Jev 还在 waitlist，先用 llm-client 通道把
 * DecisionGate 契约在全链路跑通；拿到访问后只换实现类（同一个 DecisionGate 接口）。
 *
 * 三条硬纪律：
 *   1. 纯判定逻辑，不含超时——300ms 预算由调用方 Promise.race（语义层是 bonus 不是依赖）
 *   2. 解析容错——模型回垃圾/漏答都不抛异常，落 {value:0, confidence:0}
 *   3. 依赖注入——call 从构造器进，单测传 fake，无需 mock 模块
 */

import { logger } from '@/lib/logger';
// type-only import：与 llm-client 无运行时耦合（保持 llm-client 惰性加载）
import type { LLMCompletionOptions, LLMMessage } from '@/lib/llm-client';
import type { DecisionGate, GateQuestion, GateResult, GateState } from './types';

/** 构造注入的 LLM 调用签名（与 createLLMCompletion 兼容） */
export type GateLLMCall = (
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
) => Promise<string>;

export interface LLMWrapperGateOptions {
  /** LLM 调用通道（生产传 createLLMCompletion，测试传 fake） */
  call: GateLLMCall;
  /** 透传给 LLM 的采样参数（判定要稳定，temperature 默认 0） */
  completionOptions?: LLMCompletionOptions;
  /** 判定提示词：整段替换默认指令（换语言/换风格时用） */
  systemPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = [
  '你是 Symy 的语义判定引擎（DecisionGate 模拟层）。',
  '对给定 state 逐一评估问题，只输出一个 JSON 对象，不要输出任何其他文字。',
  '格式：{"results":[{"id":"<问题id>","value":<按 kind 形状>,"confidence":<0..1>}]}',
  'value 形状约定：',
  '- kind=noul：0..1 浮点（0=否，1=是）',
  '- kind=choice：与 options 等长的数组，元素为概率，和约等于 1',
  '- kind=score：0..1 浮点，第 i 档对应 i/(档数-1)（单档按 0.5 处理）',
  '必须回答每一个问题；无法判断时给 value 0、confidence 0。',
].join('\n');

/** 收敛到 [0,1]；非法数值（NaN/字符串/缺省）返回 null 交上层兜底 */
function clamp01OrNull(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.min(1, Math.max(0, raw));
}

/** 模型偶尔在 JSON 前后加解释文字或 ```json 围栏，取最外层 {...} */
function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** choice：截断/补齐到 options 长度，非正数落 0，总和为 0 时退化为末位 1 */
function normalizeDistribution(raw: unknown, size: number): number[] | null {
  if (!Array.isArray(raw) || size === 0) return null;
  const source = raw;
  const weights = Array.from({ length: size }, (_, i) => {
    const n = clamp01OrNull(source[i]);
    return n !== null && n > 0 ? n : 0;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    weights[size - 1] = 1;
    return weights;
  }
  return weights.map((w) => w / total);
}

/** 按问题类型把模型原始 value 收敛到契约形状；无法收敛返回 null */
function normalizeValue(question: GateQuestion, raw: unknown): number | number[] | null {
  if (question.kind === 'choice') return normalizeDistribution(raw, question.options.length);
  return clamp01OrNull(raw);
}

/** 单档量表没有 index/(len-1) 可算，指令里要求按中位 0.5 解释 */
function renderQuestion(question: GateQuestion): Record<string, unknown> {
  if (question.kind === 'choice') {
    return { id: question.id, kind: 'choice', options: question.options };
  }
  if (question.kind === 'score' && question.levels.length === 1) {
    return { id: question.id, kind: 'score', levels: question.levels.map((l) => l.label), note: '单档量表，落在该档请给 0.5' };
  }
  if (question.kind === 'score') {
    return { id: question.id, kind: 'score', levels: question.levels };
  }
  return { id: question.id, kind: 'noul', statement: question.statement };
}

function buildMessages(systemPrompt: string, state: GateState, questions: GateQuestion[]): LLMMessage[] {
  const payload = {
    state: { id: state.id, text: state.text, meta: state.meta ?? {} },
    questions: questions.map(renderQuestion),
  };
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

function parseAnswers(raw: string): Map<string, { value: unknown; confidence: unknown }> {
  const byId = new Map<string, { value: unknown; confidence: unknown }>();
  const objectJson = extractJsonObject(raw);
  if (!objectJson) return byId;
  let parsed: unknown;
  try {
    parsed = JSON.parse(objectJson);
  } catch {
    // safe to ignore: 模型输出不是合法 JSON —— 语义层失败即"没命中"，由规则层兜底
    return byId;
  }
  const results = (parsed as { results?: unknown }).results;
  if (!Array.isArray(results)) return byId;
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as { id?: unknown; value?: unknown; confidence?: unknown };
    if (typeof record.id !== 'string' || byId.has(record.id)) continue;
    byId.set(record.id, { value: record.value, confidence: record.confidence });
  }
  return byId;
}

function toResult(
  question: GateQuestion,
  answer: { value: unknown; confidence: unknown } | undefined,
  latencyMs: number,
): GateResult {
  const value = answer ? normalizeValue(question, answer.value) : null;
  const confidence = clamp01OrNull(answer?.confidence);
  if (value === null) logger.warn(`[DecisionGate] ${question.id} 解析失败，落 value=0（规则层继续）`);
  return {
    id: question.id,
    kind: question.kind,
    confidence: confidence ?? 0,
    value: value ?? 0,
    latencyMs: Math.max(0, latencyMs),
  };
}

export class LLMWrapperGate implements DecisionGate {
  readonly provider = 'llm-wrapper' as const;

  private readonly call: GateLLMCall;
  private readonly completionOptions: LLMCompletionOptions;
  private readonly systemPrompt: string;

  constructor(opts: LLMWrapperGateOptions) {
    this.call = opts.call;
    this.completionOptions = { temperature: 0, ...opts.completionOptions };
    this.systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * 对同一 state 并行评估全部问题（打包技巧见方案 §2：19 预检器 = 1 次调用）。
   * 本类不含超时——300ms 预算由调用方 Promise.race。
   */
  async evaluate(state: GateState, questions: GateQuestion[]): Promise<GateResult[]> {
    if (questions.length === 0) return [];
    const startedAt = performance.now();
    const raw = await this.call(
      buildMessages(this.systemPrompt, state, questions),
      this.completionOptions,
    );
    const latencyMs = performance.now() - startedAt;
    const answers = parseAnswers(raw);
    return questions.map((question) => toResult(question, answers.get(question.id), latencyMs));
  }
}
