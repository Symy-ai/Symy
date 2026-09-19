/**
 * CO₂ 减排估算 — 拦截金额 → 估算减排量 (batch82-b)
 *
 * 口径 (估算值, 非实测): 1 美元居民消费 ≈ CO2_KG_PER_USD kg CO₂e。推导链全部公开:
 * - 美国人均温室气体 ≈ 15 t CO₂e/年 (EPA Inventory, ≈5.0 Gt ÷ 3.35 亿人)
 * - × 居民消费占全社会碳排放 53% (中科院口径, BP 0918 p11 引) ≈ 8 t CO₂e/人/年
 * - ÷ 美国人均年个人消费 ≈ $55k (BEA PCE 口径) ≈ 0.145
 * - 向下取整到保守值 (见下方常量) — 宁可低估减排, 不夸大
 *
 * 红线: 本估算只进 transparency 治理页, 且展示时必须随口径注明「估算非实测」;
 * 分享卡/荣誉面禁碳数值红线不变。系数字面量全库仅此一处, 新调用方必须复用本函数。
 */

/** 唯一换算系数 (kg CO₂e / USD) — 推导见文件头, 保守取值 */
export const CO2_KG_PER_USD = 0.14;

/** 口径标识 — 换算方法论单一来源; 新口径在此扩展, 禁在调用方另起炉灶 */
export type Co2Methodology = 'us-residential-consumption-intensity';
export const CO2_METHODOLOGY: Co2Methodology = 'us-residential-consumption-intensity';

/** 口径文档公开链接 — 治理页口径注明的跳转目标 (开源仓库本文件) */
export const CO2_METHODOLOGY_DOC_URL =
  'https://github.com/Symy-ai/Symy/blob/main/src/lib/co2-estimate.ts';

/**
 * 拦截金额 (USD) → 估算减排量 (kg CO₂e)。
 * 无效输入 (NaN/Infinity/0/负数) 与未识别口径一律返回 0 — 宁可不算, 不冒算。
 */
export function co2FromUsdSaved(usd: number, methodology: Co2Methodology = CO2_METHODOLOGY): number {
  if (methodology !== CO2_METHODOLOGY) return 0;
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return usd * CO2_KG_PER_USD;
}
