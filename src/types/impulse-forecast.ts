/**
 * impulse-forecast 类型 — 未来 7 天冲动风险预报卡 payload (batch62-c)
 *
 * 用户问 "下周容易冲动吗 / next week risk" 命中预报轮 (parts/
 * impulse-forecast-turn.ts) 时, 服务端用 lib/impulse-forecast 纯函数算好
 * 逐日风险, canned 生成 (绝不经过 Letta), 随 SSE / 非流式 JSON 附带。
 *
 * 红线:
 * - 卡上数字全部来自聚合 lib (forecastImpulseRisk), 本层零第二遍口径计算。
 * - 结构上无金额/百分比收益/碳数值字段 — 只允许次数/天数/星期/时段。
 * - 本卡无分享面; 样本不足 status='insufficient' 引导态, 不造伪规律。
 * - focusDay: "那周六呢" 单轮追问的聚焦日 (0-6 周一制), 主轮缺省。
 */

import type { ImpulseRiskForecast } from '@/lib/impulse-forecast';

export type { ForecastRiskLevel, ForecastDayRisk } from '@/lib/impulse-forecast';

export type ImpulseForecastCardData = ImpulseRiskForecast & {
  /** 单轮追问聚焦日 (0-6, Monday=0); 整周预报轮不带 */
  focusDay?: number;
};
