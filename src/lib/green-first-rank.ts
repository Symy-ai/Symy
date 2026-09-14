/**
 * 绿色优先排序组合层 — symy_search 结果卡渲染前的一站式管道（纯函数）：
 *
 *   词表评估 (green-rules) → 三档分类 (green-level) → 稳定排序 (green-sort)
 *
 * 绿色守护关闭时整体静默：signal=undefined、level 全 unknown（不重排）、
 * hasHigh=false（顶部引导语一并静默）— 与商品卡既有守护语义一致。
 */

import { evaluateGreenSignal, type GreenSignal, type GreenSignalCardInput } from './green-rules';
import { classifyGreenLevel, type GreenLevel } from './green-level';
import { sortByGreenLevel } from './green-sort';

export interface GreenRankedCard<T extends GreenSignalCardInput> {
  card: T;
  /** 绿色守护关闭时为 undefined */
  signal: GreenSignal | undefined;
  level: GreenLevel;
}

export interface GreenRankResult<T extends GreenSignalCardInput> {
  ranked: GreenRankedCard<T>[];
  /** 结果里是否存在 high 档 — 控制顶部引导语；无绿色选项不提示（不说教） */
  hasHigh: boolean;
}

/**
 * 按绿色档位稳定重排商品卡。返回新数组，不修改入参。
 * query 传入时意图加成参与分档（弱信号卡可被推过徽章线）；guard-off 仍整体静默。
 */
export function rankCardsByGreenLevel<T extends GreenSignalCardInput>(
  cards: readonly T[],
  greenPrefEnabled: boolean,
  query = '',
): GreenRankResult<T> {
  if (!greenPrefEnabled) {
    return {
      ranked: cards.map((card) => ({ card, signal: undefined, level: 'unknown' as const })),
      hasHigh: false,
    };
  }

  const signals = evaluateGreenSignal(query, cards);
  const ranked = sortByGreenLevel(
    cards.map((card, index) => {
      const signal = signals[index];
      return { card, signal, level: classifyGreenLevel(signal) };
    }),
    (entry) => entry.level,
  );
  return { ranked, hasHigh: ranked.some((entry) => entry.level === 'high') };
}
