/**
 * MicroChallenge — chat 内微型守护挑战卡的共享 payload 类型。
 *
 * 服务端 (parts/micro-challenge-detector) 产出 → SSE micro_challenge 事件 /
 * 非流式 JSON microChallenge 字段 → ChatMessage.microChallenge → 卡片组件。
 * 与 greenAlt/reuseHint 同一「独立结构化卡通道」: 不解析模型正文, 历史持久化只存 content。
 */

/** 微挑战覆盖的品类 (与守护账本的 InterceptCategory 对齐, 'default' 不发起) */
export type MicroChallengeCategory = 'electronics' | 'clothing' | 'beauty' | 'home' | 'food';

/** detector 输出: null (不发起) 或一张 24h 微挑战卡提案 */
export interface MicroChallengeProposal {
  category: MicroChallengeCategory;
  /** 挑战文案 i18n key (chat.microChallenge.body.{category}) */
  titleKey: string;
  durationHours: 24;
}

/** 频控输入: 最近已发起的微挑战记录 (客户端 localStorage 维护) */
export interface MicroChallengeHistoryEntry {
  category: MicroChallengeCategory;
  /** 发起时间 (ms epoch) */
  initiatedAt: number;
}
