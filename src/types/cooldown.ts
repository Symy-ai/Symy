/**
 * cooldown — 反驳降温流 (batch48-b) 的共享类型。
 *
 * 服务端预检命中反驳意图时, 冷静卡 payload 随 SSE cooldown_card 事件 /
 * 非流式 JSON cooldownCard 字段附带; 客户端卡片动作写入待回访记录,
 * 次日由回访条消费。零金额: 全链路只有品类与次数, 不涉及 saved 金额。
 */

import type { InterceptCategory } from '@/features/butterfly/green-alt-copy';

/**
 * 可识别的守护品类 — R856: 从 SSOT 源 InterceptCategory 投影 (Exclude 'default'),
 * 与 MicroChallengeCategory / DimensionQueryCategory 同款对齐方式 (b134 方案 A)。
 * 此前为独立五档字面量声明, 对齐靠注释无编译期保证; 投影后源加/删档时此处
 * 随动, 消除漂移面。
 */
export type CooldownCategory = Exclude<InterceptCategory, 'default'>;

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
