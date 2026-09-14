/**
 * prepurchase — 买前三问决策流 (batch50-a) 的共享类型。
 *
 * 用户主动求问 ("该买 X 吗") 时服务端预检命中, 三问决策卡 payload 随 SSE
 * prepurchase_card 事件 / 非流式 JSON prepurchaseCard 字段附带; 用户答完三问
 * 在卡上三选一 (买吧 / 家里有替代 / 冷静 24h), 决策写 health_events
 * (manual_adjustment 纯审计类型, 零 DDL 零 vitality 副作用) + 本地决策记录。
 *
 * 与 batch48-b 冷静卡的区别: 48-b 是拦截后用户顶回的降级流; 本流是用户主动
 * 求问的升级流 — 入口、语气、卡类型均独立, 不复用 48-b 的卡。
 *
 * 金额红线: 用户填写的价格只进本卡与决策记录 (用户私域), 永不进分享卡与荣誉框架。
 */

/** 决策卡三选项 */
export type PrepurchaseDecision = 'buy' | 'have_alt' | 'cooldown_24h';

/** 三问决策卡 payload (服务端 prepurchase-turn 产出, 挂到 assistant 消息) */
export interface PrepurchaseCardData {
  /** 从用户消息识别的物品主题; 识别不出为 null → 卡片用通用文案 */
  subject: string | null;
}

/** 本地决策记录 (localStorage, prepurchase-store 维护; 周累计金额的唯一来源) */
export interface PrepurchaseDecisionRecord {
  decision: PrepurchaseDecision;
  /** 冷静 24h 后次日回访改判「不想要了」→ true (此时金额才计入周累计) */
  followupLetGo: boolean;
  /** 用户选填的价格; 私域专用, 永不上分享/荣誉面 */
  amount: number | null;
  /** 决策/改判时间 (ms epoch) */
  decidedAt: number;
}

/** 冷静 24h 待回访记录 (localStorage, 次日回访条消费) */
export interface PendingPrepurchaseFollowup {
  subject: string | null;
  /** 冷静选项确认时间 (ms epoch) */
  askedAt: number;
  /** 回访到期时间 (ms epoch) = askedAt + 24h */
  dueAt: number;
  /** 用户选填的价格 — 回访改判「不想要了」时计入周累计 */
  amount: number | null;
}
