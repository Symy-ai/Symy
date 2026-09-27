/**
 * DecisionGate 契约 — 所有语义判定的统一出口（方案 §4）
 *
 * 架构定案（doc/Jev-引入方案-v2.md §2「两级门」）：
 *   第一级 规则快路径（词表+查表，微秒级，永远在线的降级路径）
 *   第二级 语义层（单 state 多问题并行，70-500ms，300ms 预算超时即放弃）
 *
 * 供应商可替换：Jev（waitlist）/ llm-wrapper（Phase 0 模拟 Jev 输出）/ rules。
 * Phase 0 用 LLMWrapperGate 跑通契约，拿到 Jev 访问后只换实现类——
 * 业务分支、阈值、evals 一行不用改。
 */

/** 判定供应商标识（gate provider） */
export type GateProvider = 'jev' | 'llm-wrapper' | 'rules';

/**
 * 量表档位描述（Score 问题的档位定义）
 *
 * 对应 Jev 的量表评分输出：档位按 index/(len-1) 归一到 0..1 浮点。
 */
export interface GateLevelDesc {
  /** 档位短标签（low / medium / high…） */
  label: string;
  /** 档位含义说明，缺省时只靠 label 表达 */
  description?: string;
}

/**
 * 判定问题——三类，对应 Jev 的三种输出形态
 *
 * 打包设计源自 Jev API：「单 state 塞尽可能多的问题、全部并行评估」
 * （19 个 chat 预检器 → 一次调用 19 个 Noul 问题 = Wave 1 的技术甜点）。
 */
export type GateQuestion =
  /** 是非判断 → [0,1] 浮点（陈述句可直接判定，不必自己造问句） */
  | { kind: 'noul'; id: string; statement: string }
  /**
   * 多选一 → 与 options 等长的概率分布（和 ≈ 1）
   *
   * statement 选填（b131 加）：options 若是裸 id（`electronics` / `tired`…），模型只能
   * 靠 state 猜该选哪一档 —— b130 实弹 9 个 choice 全落这条路上（argmax 恒高但选项判错、
   * 或分布摊平）。给了 statement 才谈得上「写清楚怎么从消息文本推断」，故 wrapper 通道
   * 会把它与 options 一起渲染给模型；不写时行为与 b130 逐字节一致。
   */
  | { kind: 'choice'; id: string; options: string[]; statement?: string }
  /** 量表评分 → [0,1] 浮点（levels 按 index/(len-1) 归一） */
  | { kind: 'score'; id: string; levels: GateLevelDesc[] };

/** 被判定对象的快照——一条消息 = 一个 state */
export interface GateState {
  /** state 标识（回填到结果里便于溯源） */
  id: string;
  /** state 正文（用户消息 / 搜索结果摘要） */
  text: string;
  /** 附加结构化上下文（不进 prompt 正文，展开进 JSON 指令） */
  meta?: Record<string, unknown>;
}

/** 单个问题的判定结果 */
export interface GateResult {
  /** 对应 question.id */
  id: string;
  /** 回显问题类型，消费方据此解释 value 的形状 */
  kind: GateQuestion['kind'];
  /** 置信度：Jev 为校准置信度，wrapper 为模型自估 */
  confidence: number;
  /** 按问题类型：noul/score 为 [0,1] 浮点，choice 为概率分布 */
  value: number | number[];
  /** 单次 evaluate 的真实耗时（毫秒），用于 300ms 预算判断 */
  latencyMs: number;
}

/** 语义判定的统一出口——所有判定能力都经此接口，供应商可替换 */
export interface DecisionGate {
  /**
   * 对同一个 state 并行评估全部问题。
   *
   * 约定：解析失败/部分缺失的单个问题落 {value: 0, confidence: 0}，
   * 不抛异常——两级门里语义层永远只是 bonus，失败等于没命中。
   */
  evaluate(state: GateState, questions: GateQuestion[]): Promise<GateResult[]>;
  /** 实际生效的供应商（evals 与审计靠它分辨是谁判的） */
  readonly provider: GateProvider;
}
