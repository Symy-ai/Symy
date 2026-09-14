/**
 * Chat Message Type — canonical type definition
 *
 * 🔧 架构优化: 消除层级违反 — lib 不应从 components 导入类型
 *    旧代码: src/lib/demo-data.ts 从 @/components/chat-bubble 导入 ChatMessage
 *    修复: 类型定义移到 src/types/, components/lib/hooks 都从这里导入
 */

import type { ProductCardData } from './product-card';
import type { GreenAltCardData } from './green-alt-card';
import type { ReuseHint } from '@/lib/reuse-advisor';
import type { MicroChallengeProposal } from './micro-challenge';
import type { GreenKnowledgeCardData } from './green-knowledge';
import type { CooldownCardData } from './cooldown';
import type { PrepurchaseCardData } from './prepurchase';
import type { CommitmentCardData } from './commitment';
import type { CompareCardData } from './compare';
import type { AltFootprintCardData } from './alt-footprint';
import type { ListTriageCardData } from './list-triage';
import type { SavingsQueryCardData } from './savings-query';
import type { CategoryQueryCardData, ImpulseTimeCardData } from './dimension-query';
import type { ImpulseForecastCardData } from './impulse-forecast';
import type { GuardPulseCardData } from './guard-pulse';
import type { EmotionGuardCardData } from './emotion-guard';
import type { ContextSignalData } from './context-signal';
import type { TrustEvidence } from '@/lib/context-trust';
import type { ShoppingClarifyCardData } from './shopping-clarify-card';
import type { DuplicatePrecheckCardData } from './duplicate-purchase';
import type { GreenAltRetroCardData } from './green-alt-retro';

export interface ChatMessage {
  id: string;
  /**
   * 🔧 P1-2 fix: 新增 'action' role — 系统动作标识 (如 "✓ Saw it", "✗ Chose to buy")
   * 区别于 'user' (用户主动输入) 和 'assistant' (AI 回复)。
   * action 消息渲染为带图标的简短状态条, 不以用户气泡形式显示。
   */
  role: 'user' | 'assistant' | 'action';
  content: string;
  /** Agent 内部推理（不再显示给用户） */
  reasoning?: string;
  timestamp: Date;
  /** 🔧 消息分离: 'normal' = 普通聊天, 'challenge' = 挑战模式 */
  mode?: 'normal' | 'challenge';
  /** 🔧 错误消息: AI 超时/过载时标记, 显示错误样式 + 重新生成按钮 */
  isError?: boolean;
  /** 🔧 重新生成回调: 错误消息附带, 点击"重新生成"时调用 */
  onRetry?: () => void;
  /**
   * 🔧 P1-2 fix: action 子类型 — 决定 action 消息的图标和文案
   * - 'saw_it': 用户点击 "I saw it" (防御成功)
   * - 'chose_to_buy': 用户点击 "I choose to buy" (防御失败)
   * - 'challenge_created': 系统创建挑战
   */
  actionType?: 'saw_it' | 'chose_to_buy' | 'challenge_created';
  /** Product cards extracted from a trusted symy_search tool result. */
  productCards?: ProductCardData[];
  /**
   * 触发本轮回复的用户搜索词 — 只驱动绿色意图引导语（queryHasGreenIntent），
   * 不参与卡片分档/排序/徽章（反造假契约，见 green-rules.ts）。
   */
  productCardsQuery?: string;
  /**
   * 🌱 绿色替代卡片: chat route 发 Letta 前关键词预检命中高环境影响品类时,
   * 响应带 green_alt 标记 (SSE 事件 / JSON greenAlt 字段), 挂在 AI 回复气泡下方。
   */
  greenAlt?: GreenAltCardData;
  /**
   * 🔁 复用优先 (reuse-first): "先看看已有的" 建议卡 — 服务端预检命中
   * 复用类目时随 SSE reuse_hint 事件 / 非流式 JSON reuseHint 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  reuseHint?: ReuseHint;
  /**
   * 🐞 batch46-b 微挑战卡: 24h 微型守护挑战提案 — 服务端预检 (购买意图 + 品类 +
   * 7 天频控) 命中时随 SSE micro_challenge 事件 / 非流式 JSON microChallenge 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  microChallenge?: MicroChallengeProposal;
  /**
   * 📖 batch47-a 知识问答来源 chip: 服务端预检命中知识型提问时随 SSE
   * green_knowledge 事件 / 非流式 JSON greenKnowledge 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  greenKnowledge?: GreenKnowledgeCardData;
  /**
   * 🐘 batch48-b 冷静卡: 反驳降温轮 (上一轮守护卡 + 反驳意图) 命中时随 SSE
   * cooldown_card 事件 / 非流式 JSON cooldownCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  cooldownCard?: CooldownCardData;
  /**
   * 🐘 batch50-a 买前三问决策卡: 用户主动求问 ("该买 X 吗") 命中时随 SSE
   * prepurchase_card 事件 / 非流式 JSON prepurchaseCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  prepurchaseCard?: PrepurchaseCardData;
  /** duplicate-purchase precheck card (SSE duplicate_precheck_card / JSON field). */
  duplicatePrecheckCard?: DuplicatePrecheckCardData;
  /**
   * 🐘 batch53-a 承诺登记卡: 用户口头承诺 ("这个月不买 X") 命中时随 SSE
   * commitment_card 事件 / 非流式 JSON commitmentCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  commitmentCard?: CommitmentCardData;
  /**
   * 🐘 batch56-a 对比裁决卡: 用户二选一求问 ("买 A 还是 B") 命中时随 SSE
   * compare_card 事件 / 非流式 JSON compareCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  compareCard?: CompareCardData;
  /**
   * 🐘 batch55-c 替代足迹卡: 用户召回自己的替代足迹 ("我做过哪些绿色替代")
   * 命中时随 SSE alt_footprint 事件 / 非流式 JSON altFootprint 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  altFootprint?: AltFootprintCardData;
  /**
   * 🐘 batch57-a 清单分诊卡: 购物清单批量消息 ("要买这些：A、B、C") 命中时
   * 随 SSE list_triage_card 事件 / 非流式 JSON listTriageCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  listTriageCard?: ListTriageCardData;
  /**
   * 🐘 batch57-c 问账卡: 用户问账 ("这个月省了多少") 命中时随 SSE
   * savings_query_card 事件 / 非流式 JSON savingsQueryCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  savingsQueryCard?: SavingsQueryCardData;
  /**
   * 🐘 batch58-c 分类问答卡: 用户问 "这个月奶茶拦截了几次" 命中时随 SSE
   * category_query_card 事件 / 非流式 JSON categoryQueryCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  categoryQueryCard?: CategoryQueryCardData;
  /**
   * 🐘 batch58-c 时段问答卡: 用户问 "我晚上冲动买的多吗" 命中时随 SSE
   * impulse_time_card 事件 / 非流式 JSON impulseTimeCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  impulseTimeCard?: ImpulseTimeCardData;
  /**
   * 🐘 batch62-c 冲动风险预报卡: 用户往前问 ("下周容易冲动吗 / next week
   * risk") 命中时随 SSE impulse_forecast_card 事件 / 非流式 JSON
   * impulseForecastCard 字段附带。会话内字段 (聊天历史持久化只存 content)。
   */
  impulseForecastCard?: ImpulseForecastCardData;
  /**
   * 🐘 batch68-c 按小时守护脉搏卡: 用户问自己的小时节奏 ("我什么时候最容易
   * 冲动 / my weakest shopping hour") 命中时随 SSE guard_pulse_card 事件 /
   * 非流式 JSON guardPulseCard 字段附带。会话内字段 (聊天历史持久化只存 content)。
   */
  guardPulseCard?: GuardPulseCardData;
  /**
   * 🐘 batch60-c 情绪守护卡: 用户带着情绪提起购买 ("今天好累想买点东西哄自己")
   * 命中时随 SSE emotion_guard_card 事件 / 非流式 JSON emotionGuardCard 字段附带。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  emotionGuardCard?: EmotionGuardCardData;
  /**
   * 🐘 batch61-b 弱信号词 chips: 小象从生活语言里识别到的消费场景信号词
   * ("奖励自己 / 最后三单 / 快坏了"), 随 SSE context_signal 事件 / 非流式 JSON
   * contextSignal 字段附带; chat 气泡展示 chips, 用户可逐个纠正 (一次纠正,
   * 本会话服务端不再重复同信号)。会话内字段 (聊天历史持久化只存 content)。
   */
  contextSignal?: ContextSignalData;
  /**
   * 🌱 batch68-a 绿色采纳后复盘卡: 上一轮绿色替代卡被采纳、下一轮非购买/非
   * 紧急/非问账消息触发追问轮时, 随 SSE green_alt_retro 事件 / 非流式 JSON
   * greenAltRetro 字段附带 (4 个非羞辱选项 + 自由文本提示)。
   * 会话内字段 (聊天历史持久化只存 content, 与 productCards 同策略)。
   */
  greenAltRetro?: GreenAltRetroCardData;
  /** Transparent evidence attached to high-value context-signal turns (not persisted). */
  contextTrust?: TrustEvidence;
  shoppingClarifyCard?: ShoppingClarifyCardData;
}
