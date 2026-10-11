/**
 * yield-core — 四 detector 共享的「更强购物意图让路」核心模式 (batch R1216)
 *
 * 抽取自 savings-query-detector (57-c) / category-query-detector /
 * impulse-forecast-detector / follow-up-query (58-c) 四处逐字重复的
 * YIELD 核心 (R1076 观察项: 三处近似同构 → 四处核心完全同构)。
 *
 * 只有四文件完全一致的模式放这里; 各 detector 的语境增量 (买/吃/喝等
 * 具体消费动作) 留在原文件原地 — 合并后匹配行为必须零变化。
 *
 * 设计红线 (沿袭各 detector 头注释):
 * - 让路 = 命中即放弃本 detector, 让更强的购物类意图先走 (互斥由
 *   排除模式 + route 链顺序共同保证)
 * - zh 走包含匹配, en 走词边界 (小写归一后 regex, (?<![\w-]) 防
 *   子串误配)
 * - append-only: 新模式优先加在消费方语境增量里, 核心只收录跨场景
 *   普适的求问/对比形态
 */

/** 让路核心 (zh): 求问该不该买 / A 还是 B 对比 */
export const YIELD_CORE_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
];

/** 让路核心 (en): should i buy / worth buying / vs 对比 (词边界) */
export const YIELD_CORE_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying)(?![\w-])/i,
  /\svs\.?\s/i,
];
