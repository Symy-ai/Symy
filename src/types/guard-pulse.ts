/**
 * guard-pulse 类型 — 按小时守护脉搏卡 payload (batch68-c)
 *
 * 用户问 "我什么时候最容易冲动 / my weakest shopping hour" 命中脉搏轮
 * (parts/guard-pulse-turn.ts) 时, 服务端用 lib/guard-pulse 纯函数算好
 * 近 28 天小时级节奏, canned 生成 (绝不经过 Letta), 随 SSE / 非流式
 * JSON 附带。
 *
 * 红线:
 * - 卡上数字全部来自聚合 lib (aggregateGuardPulse), 本层零第二遍口径计算。
 * - 结构上无金额/百分比收益/碳数值字段 — 只允许小时/次数/天数/密度。
 * - 本卡无分享面; 样本不足 status='insufficient' 引导态, 不造伪规律。
 */

import type { GuardPulse } from '@/lib/guard-pulse';

export type {
  GuardPulseHourStat,
  GuardPulseWindow,
  GuardPulseSuggestion,
} from '@/lib/guard-pulse';

export type GuardPulseCardData = GuardPulse;
