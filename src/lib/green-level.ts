/**
 * green_level 三档分类 — 绿色优先链路的分档层（纯函数，零依赖）
 *
 * 在 green-rules 词表评分之上收敛成三档（对外语义比 0-100 分更好解释）：
 * - high   : 卡片自身词表信号已过绿叶徽章线 → 排最前 + 「🌱 绿色优选」角标
 * - medium : 有自身绿色信号但未过线（如 耐用/可重复使用 单独命中）→ 排 unknown 前，无角标
 * - unknown: 无任何绿色词表命中 → 保持原序，无角标（不打负向标，荣誉框架非羞耻框架）
 *
 * 注意：查询意图加成（GREEN_QUERY_INTENT_BONUS）只可能把弱信号卡推过 high 线，
 * 不参与 medium 判定 — 卡片分档只看卡片自己的文本信号，绿色 query 不会让
 * 普通商品凭空变"有绿色信号"。
 */

import { GREEN_SCORE_BADGE_THRESHOLD, type GreenSignal } from './green-rules';

export type GreenLevel = 'high' | 'medium' | 'unknown';

/** 排序档位权重：值小者靠前 */
export const GREEN_LEVEL_RANK: Record<GreenLevel, number> = {
  high: 0,
  medium: 1,
  unknown: 2,
};

/** 单张卡的绿色档位。signal 缺省（如绿色守护关闭时）一律 unknown。 */
export function classifyGreenLevel(signal: GreenSignal | undefined): GreenLevel {
  if (!signal || signal.green_flags.length === 0) return 'unknown';
  if (signal.green_score >= GREEN_SCORE_BADGE_THRESHOLD) return 'high';
  return 'medium';
}
