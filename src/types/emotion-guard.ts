/**
 * emotion-guard — 情绪守护对话流 (batch60-c) 的共享类型。
 *
 * 用户带着情绪提起购买 ("今天好累，想买点东西哄自己") 时, 服务端预检命中,
 * 情绪守护卡 payload 随 SSE emotion_guard_card 事件 / 非流式 JSON
 * emotionGuardCard 字段附带。卡片给三条路: 花钱安慰 (不评判, 不写失败事件) /
 * 免费安抚 (确认后写一次 manual_adjustment 审计) / 先等 10 分钟 (本地 one-shot,
 * 到期追问; 放下写一次审计)。
 *
 * 红线: mood 是稳定的感受标签, 不是临床诊断 — 绝不输出病理化词汇; 金额不进
 * 卡面/metadata/分享面; 高风险语义 (自伤等) 不由本流处理 (detector 层排除,
 * 自然降级到通用聊天)。
 */

import type { GuardIntensity } from '@/lib/guard-intensity';

/** 稳定 mood id — 感受标签, 非诊断分类 (celebratory = 开心想犒劳自己) */
export type EmotionMood = 'tired' | 'stressed' | 'anxious' | 'sad' | 'celebratory';

export const EMOTION_MOODS: readonly EmotionMood[] = ['tired', 'stressed', 'anxious', 'sad', 'celebratory'];

/** 用户选了哪条路需要落审计的两种: 免费安抚 / 等待后放下 (花钱安慰不写事件) */
export type EmotionGuardChoice = 'free_care' | 'wait_passed';

/** 情绪守护卡 payload (服务端 emotion-guard-turn 产出, 挂到 assistant 消息) */
export interface EmotionGuardCardData {
  /** 从用户消息识别的稳定 mood id */
  mood: EmotionMood;
  /** 守护强度三档: gentle 只共情给空间 / balanced 三选项 / strict 加 10 分钟建议 */
  intensity: GuardIntensity;
}

/** 「先等 10 分钟」本地等待记录 (localStorage, emotion-guard-store 维护; 不跨设备同步) */
export interface PendingEmotionWait {
  mood: EmotionMood;
  /** 等待开始时间 (ms epoch) */
  startedAt: number;
  /** 到期时间 (ms epoch) = startedAt + 10min — 到期后追问「现在还想买吗」 */
  dueAt: number;
}
