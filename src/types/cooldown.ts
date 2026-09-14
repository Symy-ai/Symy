/**
 * cooldown — 反驳降温流 (batch48-b) 的共享类型。
 *
 * 服务端预检命中反驳意图时, 冷静卡 payload 随 SSE cooldown_card 事件 /
 * 非流式 JSON cooldownCard 字段附带; 客户端卡片动作写入待回访记录,
 * 次日由回访条消费。零金额: 全链路只有品类与次数, 不涉及 saved 金额。
 */

/** 可识别的守护品类 (与 micro-challenge 五品类对齐) */
export type CooldownCategory = 'electronics' | 'clothing' | 'beauty' | 'home' | 'food';

/** 冷静卡 payload (服务端 cooldown-turn 产出, 挂到 assistant 消息) */
export interface CooldownCardData {
  /** 从用户消息识别的品类; 识别不出为 null → 卡片用通用文案 */
  category: CooldownCategory | null;
}

/** 待回访记录 (localStorage, cooldown-store 维护) */
export interface PendingCooldownFollowup {
  category: CooldownCategory | null;
  /** 冷静卡确认时间 (ms epoch) */
  askedAt: number;
  /** 回访到期时间 (ms epoch) = askedAt + 24h */
  dueAt: number;
  /** 用户在冷静卡上点了「现在就要」→ 次日回访直接走祝福语义 */
  userChoseBuy: boolean;
}
