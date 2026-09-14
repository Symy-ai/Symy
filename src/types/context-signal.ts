/**
 * context-signal — 购物场景弱信号对话流 (batch61-b) 的共享类型。
 *
 * 用户用生活语言表达消费决策 ("想奖励自己 / 直播间说最后三单 / 家里那台快坏了"),
 * 无标准购物关键词时服务端弱信号层命中, 识别到的信号词随 SSE context_signal 事件 /
 * 非流式 JSON contextSignal 字段附带, 挂到 assistant 消息; chat 气泡展示信号词 chips,
 * 用户可逐个纠正 ("不是因为这个") — 纠正后本会话不再重复同信号 (sessionStorage +
 * 上行 dismissedContextSignals, 服务端 detector 排除)。
 *
 * 红线: payload 只含信号类型与信号词 (词表 SSOT 的展示词), 零金额零碳数值零物品
 * 抓取; 识别不做心理诊断/评分, confidence 只存在于服务端检测层, 不下发卡面。
 */

/** 弱信号类型 — 情绪奖励 / 稀缺促销 / 耗损替换 (与服务端词表 SSOT 同枚举) */
export type ShoppingContextSignalType = 'emotion_reward' | 'scarcity_promo' | 'wear_replace';

/** 单个识别到的信号词 (id 供会话纠正上行; zh/en 展示词由前端按 locale 取) */
export interface ContextSignalWord {
  /** 词表 SSOT 词条稳定 id */
  id: string;
  /** zh 展示信号词 (如 "奖励自己") */
  zh: string;
  /** en 展示信号词 (如 "treat myself") */
  en: string;
}

/** 信号词 payload (服务端产出, 挂到 assistant 消息; 三路渲染同形状) */
export interface ContextSignalData {
  /** 识别到的弱信号类型 (决定本轮路由到哪条既有能力) */
  signal: ShoppingContextSignalType;
  /** 识别到的信号词 (最多 3 个, 按置信度降序) */
  words: ContextSignalWord[];
}
