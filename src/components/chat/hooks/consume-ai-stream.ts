/**
 * consumeAIStream — SSE 流消费 + 工具事件处理 (公共逻辑)
 *
 * 🔧 ARCH fix (Round 70 — use-chat-actions.ts split):
 *    从 sendMessage + retryAiResponse 提取公共 SSE 流消费逻辑 (while(true) + 缓冲区处理 +
 *    idle timeout + reader cleanup) 与 tool_result/tool_call 事件处理 (notification + toast +
 *    challenge 清除)。两个调用方通过 callbacks 注入各自的 setMessagesSync / throttling 行为。
 *
 * 行为零变化: 逻辑/注释/控制流 byte-for-byte 保留, 仅参数化为 callbacks。
 *   - sendMessage: 传入 onToken/onReasoning (throttled rAF) + onRemainingBufferToken (BUG-34 fix) +
 *     onError (含 throttling cleanup) + onToolResult (handleToolEvent)。
 *   - retryAiResponse: 传入 onToken/onReasoning (直接 setMessagesSync, 无 throttle) +
 *     onError (无 throttling cleanup) + onToolResult (handleToolEvent)。
 *
 * 关键不变量:
 *   - error 事件: consumeAIStream 标记 errorDisplayed=true + 调用 onError callback;
 *     若 callback 返回 true, consumeAIStream break 出 for + while 循环, 跑 finally (reader cleanup),
 *     返回 { errorDisplayed: true, ... }。调用方检查 errorDisplayed 跳过 finalMsg 处理 (匹配原 `return;`)。
 *   - tool_result/tool_call 事件: 调用 handleToolEvent (公共逻辑: buddy state refresh + toast +
 *     justCompletedChallengeRef + setActiveChallenge(undefined) + addMcpNotification)。
 *   - remaining buffer (BUG-34 fix): 仅当调用方提供 onRemainingBufferToken 时处理 (sendMessage 提供,
 *     retryAiResponse 不提供 — 保留原行为)。
 */

import type { ChatMessage } from '@/components/chat-bubble';
import type { useI18n } from '@/i18n/provider';
import type { ActiveChallenge } from './use-challenge-actions';
import { extractProductCards } from '@/lib/product-tool-result';
// 🔧 A1 移植 (commerce-agents "UI 组件即工具"): 结构化卡片通道的边界复检
import { parseStructuredCards } from '@/lib/structured-cards';
import type { ProductCardData } from '@/types/product-card';
import type { ReuseHint } from '@/lib/reuse-advisor';
import { dispatchInterceptMedal } from '@/lib/intercept-medal';
// 🌱 绿色替代卡片: chat route 预检命中高环境影响品类时注入的 green_alt 事件
import type { GreenAltCardData } from '@/types/green-alt-card';
import type { GreenAltRetroCardData } from '@/types/green-alt-retro';
// 🐞 batch46-b 微挑战: chat route 预检命中购买意图+品类时注入的 micro_challenge 事件
import type { MicroChallengeProposal } from '@/types/micro-challenge';
// 📖 batch47-a 知识问答: 知识型提问命中词条时注入的 green_knowledge 事件
import type { GreenKnowledgeCardData } from '@/types/green-knowledge';
// 🐘 batch48-b 反驳降温: 反驳意图命中时注入的 cooldown_card 事件 (canned 降温回复流最前)
import type { CooldownCardData } from '@/types/cooldown';
// 🐘 batch50-a 买前三问: 用户主动求问时注入的 prepurchase_card 事件 (canned 迎接回复流最前)
import type { PrepurchaseCardData } from '@/types/prepurchase';
import type { DuplicatePrecheckCardData } from '@/types/duplicate-purchase';
// 🐘 batch53-a 绿色承诺: 用户口头承诺时注入的 commitment_card 事件 (canned 迎接回复流最前)
import type { CommitmentCardData } from '@/types/commitment';
import type { CompareCardData } from '@/types/compare';
// 🐘 batch55-c 替代足迹: 用户召回足迹时注入的 alt_footprint 事件 (足迹卡 payload)
import type { AltFootprintCardData } from '@/types/alt-footprint';
// 🐘 batch57-a 清单分诊: 购物清单批量消息命中时注入的 list_triage_card 事件
import type { ListTriageCardData } from '@/types/list-triage';
// 🐘 batch57-c 问账: 用户问账时注入的 savings_query_card 事件 (对账卡 payload)
import type { SavingsQueryCardData } from '@/types/savings-query';
import type { CategoryQueryCardData, ImpulseTimeCardData } from '@/types/dimension-query';
import type { ImpulseForecastCardData } from '@/types/impulse-forecast';
// 🐘 batch68-c 按小时守护脉搏: 小时节奏问句命中时注入的 guard_pulse_card 事件
import type { GuardPulseCardData } from '@/types/guard-pulse';
// 🐘 batch60-c 情绪守护: 情绪×购物共现命中时注入的 emotion_guard_card 事件
import type { EmotionGuardCardData } from '@/types/emotion-guard';
// 🐘 batch61-b 弱信号: 生活语言命中时注入的 context_signal 事件 (信号词 chips)
import type { ContextSignalData } from '@/types/context-signal';
import type { TrustEvidence } from '@/lib/context-trust';
import type { ShoppingClarifyCardData } from '@/types/shopping-clarify-card';
import { logger } from '@/lib/logger';
// 🐘 人设转型 (2026-09-05): toast 文案改用小象话术库 (SSOT)
import { elephantGenericVars, getElephantPhrase } from '@/lib/elephant-tone';

/** parsed SSE event — tool_result / tool_call payload from JSON.parse (fields optional, shape varies by tool) */
export interface SseToolEvent {
  type?: string;
  tool?: string;
  content?: string | null;
  notifType?: string;
  /**
   * 🔧 A1 移植 (commerce-agents "UI 组件即工具"): 服务端已校验的结构化卡片通道
   *    (仅 symy_search 的 tool_result 携带)。存在即权威 — 不再回退字符串解析。
   */
  cards?: ProductCardData[];
}

/** consumeAIStream 的回调集合 — 调用方注入各自的 setMessagesSync / throttling 行为 */
export interface ConsumeAIStreamCallbacks {
  /**
   * Token 事件 (parsed.type === 'token', content 非空)。
   * @param token 当前 token (已非空, 已 null-coalesce)
   * @param accumulatedReply consumeAIStream 内部累积的完整回复 (含本 token)
   */
  onToken?: (token: string, accumulatedReply: string) => void;
  /**
   * Reasoning 事件 (parsed.type === 'reasoning', content 非空)。
   * @param token 当前 reasoning token (已非空, 已 null-coalesce)
   * @param accumulatedReasoning consumeAIStream 内部累积的完整 reasoning (含本 token)
   */
  onReasoning?: (token: string, accumulatedReasoning: string) => void;
  /**
   * tool_result / tool_call 事件。调用方通常委托给 handleToolEvent。
   * @param parsed SSE 事件的 parsed JSON
   */
  onToolResult?: (parsed: SseToolEvent) => void;
  /** Trusted product cards parsed from a symy_search tool result. */
  onProductCards?: (cards: ProductCardData[]) => void;
  /**
   * 🌱 green_alt 事件 (chat route 发 Letta 前关键词预检命中时, SSE 最前面注入)。
   * payload 已做最小形状校验 (id/why 为字符串 + options 为数组)。
   */
  onGreenAlt?: (data: GreenAltCardData) => void;
  /**
   * 🌱 batch68-a 绿色采纳后复盘: green_alt_retro 事件 (复盘追问轮 SSE 最前注入,
   * 4 个非羞辱选项卡 payload)。调用方挂到当前 assistant 消息并记 awaiting 会话态。
   */
  onGreenAltRetro?: (data: GreenAltRetroCardData) => void;
  /**
   * 🔁 复用优先 (reuse-first): 服务端预检命中复用类目 → SSE 流最前的
   * reuse_hint 事件 (带完整 hint payload, 文案已按 locale 渲染)。
   */
  onReuseHint?: (hint: ReuseHint) => void;
  /**
   * 🐞 batch46-b 微挑战: 服务端预检 (购买意图 + 品类 + 7 天频控) 命中 → SSE 流最前的
   * micro_challenge 事件 (带完整提案 payload)。调用方可按需丢弃 (如已有 active 挑战时)。
   */
  onMicroChallenge?: (proposal: MicroChallengeProposal) => void;
  /**
   * 📖 batch47-a 知识问答: 服务端预检命中知识型提问 → SSE 流最前的 green_knowledge
   * 事件 (带完整来源 chip payload, 文案已按 locale 渲染)。
   */
  onGreenKnowledge?: (data: GreenKnowledgeCardData) => void;
  /**
   * 🐘 batch48-b 反驳降温: 反驳意图命中 → canned 降温回复流最前的 cooldown_card
   * 事件 (带冷静卡 payload)。调用方挂到当前 assistant 消息。
   */
  onCooldownCard?: (card: CooldownCardData) => void;
  /**
   * 🐘 batch50-a 买前三问: 用户主动求问意图命中 → canned 迎接回复流最前的
   * prepurchase_card 事件 (带三问决策卡 payload)。调用方挂到当前 assistant 消息。
   */
  onPrepurchaseCard?: (card: PrepurchaseCardData) => void;
  onDuplicatePrecheckCard?: (card: DuplicatePrecheckCardData) => void;
  /** 🐘 batch53-a: commitment_card 事件 (带承诺登记卡 payload)。调用方挂到当前 assistant 消息。 */
  onCommitmentCard?: (card: CommitmentCardData) => void;
  onCompareCard?: (card: CompareCardData) => void;
  /**
   * 🐘 batch55-c 替代足迹: 用户召回足迹 (样本足够) → SSE 流最前的 alt_footprint
   * 事件 (带足迹卡 payload)。调用方挂到当前 assistant 消息。
   */
  onAltFootprint?: (card: AltFootprintCardData) => void;
  /**
   * 🐘 batch57-a 清单分诊: 购物清单批量消息命中 → canned 迎接回复流最前的
   * list_triage_card 事件 (带分诊卡 payload)。调用方挂到当前 assistant 消息。
   */
  onListTriageCard?: (card: ListTriageCardData) => void;
  /**
   * 🐘 batch57-c 问账: 用户问账 ("这个月省了多少") 命中 → canned 对账回复流
   * 最前的 savings_query_card 事件 (带问账卡 payload)。调用方挂到当前
   * assistant 消息。
   */
  onSavingsQueryCard?: (card: SavingsQueryCardData) => void;
  /** 🐘 batch58-c 分类问答: 分类对账卡事件 (最前的 category_query_card 附带) */
  onCategoryQueryCard?: (card: CategoryQueryCardData) => void;
  /** 🐘 batch58-c 时段问答: 时段统计卡事件 (最前的 impulse_time_card 附带) */
  onImpulseTimeCard?: (card: ImpulseTimeCardData) => void;
  /**
   * 🐘 batch62-c 冲动风险预报: 用户往前问 ("下周容易冲动吗") 命中 → canned
   * 预报回复流最前的 impulse_forecast_card 事件 (带预报卡 payload, 追问轮
   * 另带 focusDay)。调用方挂到当前 assistant 消息。
   */
  onImpulseForecastCard?: (card: ImpulseForecastCardData) => void;
  /**
   * 🐘 batch68-c 按小时守护脉搏: 用户问自己的小时节奏 ("我什么时候最容易
   * 冲动") 命中 → canned 脉搏回复流最前的 guard_pulse_card 事件 (带脉搏卡
   * payload)。调用方挂到当前 assistant 消息。
   */
  onGuardPulseCard?: (card: GuardPulseCardData) => void;
  /**
   * 🐘 batch60-c 情绪守护: 情绪×购物共现命中 → canned 共情回复流最前的
   * emotion_guard_card 事件 (带三选项守护卡 payload)。调用方挂到当前 assistant 消息。
   */
  onEmotionGuardCard?: (card: EmotionGuardCardData) => void;
  /**
   * 🐘 batch61-b 弱信号: context_signal 事件 (识别到的信号词 chips payload)。
   * 调用方挂到当前 assistant 消息, 气泡内渲染可纠正的信号词。
   */
  onContextSignal?: (data: ContextSignalData) => void;
  onContextTrust?: (data: TrustEvidence) => void;
  onShoppingClarify?: (data: ShoppingClarifyCardData) => void;
  /**
   * error 事件 (parsed.type === 'error')。consumeAIStream 会标记 errorDisplayed=true。
   * @param rawContent parsed.content (可能为 null/undefined/空字符串), 调用方负责 fallback
   * @returns 返回 true 信号表示 break 出循环 (匹配原 `return;`)
   */
  onError?: (rawContent: string | null | undefined) => boolean | void;
  /**
   * 剩余 buffer 处理 (BUG-34 fix: 流结束时最后一个未以 \n 结尾的事件)。
   * 仅 sendMessage 提供 (retryAiResponse 不提供 → 跳过整个 remaining buffer 块, 保留原行为)。
   * @param token parsed.content (已 null-coalesce, 可能为空字符串)
   * @param accumulatedReply consumeAIStream 内部累积的完整回复 (含本 token)
   */
  onRemainingBufferToken?: (token: string, accumulatedReply: string) => void;
}

/** consumeAIStream 返回值 — 调用方用此同步本地累积变量 + 判断是否跳过 finalMsg */
export interface ConsumeAIStreamResult {
  /** 完整回复文本 (含 token + remaining buffer token) */
  reply: string;
  /** 完整 reasoning 文本 */
  reasoning: string;
  /** 是否触发 error 事件 (true → 调用方跳过 finalMsg 处理) */
  errorDisplayed: boolean;
  /** 🔧 batch43-b: 流是否因 idle timeout 结束 (调用方显示重试兜底) */
  idleTimeout: boolean;
}

/** handleToolEvent 的依赖参数 — 调用方 (sendMessage / retryAiResponse) 闭包注入 */
export interface HandleToolEventParams {
  /** 当前 active challenge (闭包值, 与 sendMessage 一致) — 用于 toast 显示 savedAmount */
  activeChallenge: ActiveChallenge | undefined;
  /** i18n t 函数 */
  t: ReturnType<typeof useI18n>['t'];
  /** 🐘 人设转型 (2026-09-05): toast 文案从小象话术库取词, 需要 UI 语言 */
  locale: string;
  /** setActiveChallenge setter — complete_challenge / record_impulse 时清 undefined */
  setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  /** onBuddyStateRefresh callback — tool_result 时刷新 buddy state */
  onBuddyStateRefresh?: () => void;
  /** onToast callback — complete_challenge 时显示 success toast */
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** addMcpNotification callback — 显示工具通知 */
  addMcpNotification: (message: string, type: 'reward' | 'penalty' | 'badge') => void;
  /** justCompletedChallengeRef — 防止 activeChallenge fetch effect 重新设 challenge */
  justCompletedChallengeRef: React.MutableRefObject<boolean>;
  // 🔧 信任存入 fix (Round 106): 挑战完成回调, 弹出 DepositDialog
  onChallengeCompleted?: (challengeId: string, savedAmount: number) => void;
  // 🔧 需求九: bought 路径回调 (流式 SSE complete_challenge + justBoughtChallengeRef) → 沉默时刻 (bought)
  onChallengeBought?: (amount: number, itemName: string) => void;
  /**
   * 🔧 P0 fix (mirror philosophy — I choose to buy): 当用户点击 "I choose to buy" 时,
   *   handleChooseToBuy 设此 ref = true, 让 handleToolEvent 知道接下来 AI 调
   *   complete_challenge 是 "buy" 路径 (status='failed'), 应该:
   *   - 跳过 onChallengeCompleted (不弹存款对话框 — 用户买了, 没钱可存)
   *   - 跳过 challengePassedToast (handleChooseToBuy 已显示 "You saw it. You're free.")
   *   sendMessage finally 块清除此 ref。
   */
  justBoughtChallengeRef?: React.MutableRefObject<boolean>;
}

/**
 * handleToolEvent — 处理 SSE tool_result / tool_call 事件的公共逻辑。
 *
 * 逻辑 (byte-for-byte 保留自 sendMessage / retryAiResponse 的 tool 分支):
 *   1. tool_result 时调 onBuddyStateRefresh (刷新 buddy state)
 *   2. toolName 是 complete_challenge / record_impulse 时:
 *      - complete_challenge + onToast: 显示 success toast (含 savedAmount)
 *      - justCompletedChallengeRef.current = true (防止 effect 重新设 challenge)
 *      - setActiveChallenge(undefined)
 *   3. 构建 notifType (penalty / badge / reward) 基于 parsed.notifType + toolName
 *   4. 构建 notifMessage: 优先用 parsed.content, 否则按 toolName switch 取 i18n 默认值
 *   5. addMcpNotification(notifMessage, notifType)
 */
export function handleToolEvent(parsed: SseToolEvent, params: HandleToolEventParams): void {
  const { activeChallenge, t, locale, setActiveChallenge, onBuddyStateRefresh, onToast, addMcpNotification, justCompletedChallengeRef, onChallengeCompleted, onChallengeBought, justBoughtChallengeRef } = params;

  // Letta Agent 调用了 MCP 工具 → 刷新 buddy state + 显示通知
  if (onBuddyStateRefresh && parsed.type === 'tool_result') {
    onBuddyStateRefresh();
  }
  // 🔧 BUG-4 fix: Clear active challenge banner when complete_challenge is called
  const toolName = parsed.tool || '';
  if (toolName === 'complete_challenge' || toolName === 'record_impulse') {
    // 🔧 P0 fix (mirror philosophy — I choose to buy):
    //   当用户点击 "I choose to buy" 时, handleChooseToBuy 已:
    //     1) 调 /api/challenge/complete (status='failed') 完成挑战
    //     2) 显示 "You saw it. You're free." toast
    //   AI 随后也会调 complete_challenge(status='failed') — 这是冗余调用。
    //   旧代码: 无条件显示 "You saw it. $X stays." toast + 弹存款对话框
    //     → 用户看到错误文案 + 错误弹窗 (用户买了, 没钱可存)
    //   修复: 当 justBoughtChallengeRef.current === true 时:
    //     - 跳过 challengePassedToast (避免覆盖 "You saw it. You're free.")
    //     - 跳过 onChallengeCompleted (不弹存款对话框)
    //     - 仍清 activeChallenge (确保 banner 消失)
    //     - 仍标 justCompletedChallengeRef (防止 effect 重设)
    const isBuyPath = justBoughtChallengeRef?.current === true;

    // 🏅 拦截勋章 (绿色转向) — 流式 SSE 路径: 仅 tool_result (非 tool_call, 防双发; dedupe 兜底),
    //   非 buy 路径 (用户买了不是拦截)。"没买" = 可晒的勋章, Buddy 页监听显示晒入口。
    if (parsed.type === 'tool_result' && toolName === 'complete_challenge' && !isBuyPath) {
      const savedAmount = activeChallenge?.amount;
      if (savedAmount && savedAmount > 0) {
        dispatchInterceptMedal({
          itemTitle: activeChallenge?.itemName || '',
          savedCents: Math.round(savedAmount * 100),
          date: new Date().toISOString(),
        });
      }
    }

    // 🔧 BUG-013 fix: 挑战完成时显示 toast (仅 passed 路径 — buy 路径已显示 toast)
    //   🐘 人设转型: 小象恭喜话术 (荣誉框架), 不再动既有 i18n key
    if (toolName === 'complete_challenge' && onToast && !isBuyPath) {
      const savedAmount = activeChallenge?.amount;
      onToast(
        getElephantPhrase('saw_it', locale, {
          ...elephantGenericVars(locale),
          ...(savedAmount ? { amount: `$${savedAmount.toFixed(2)}` } : {}),
        }),
        'success'
      );
    }
    // 🔧 Bug 1 fix (Round 43): 标记刚完成挑战, 防止 activeChallenge fetch effect
    //   立即重新设 activeChallenge (服务端可能还没提交 complete_challenge 事务)
    justCompletedChallengeRef.current = true;
    setActiveChallenge(undefined);
    // 🔧 信任存入 fix (Round 106): 通知前端弹出 DepositDialog
    //   流式路径: challengeId 和 savedAmount 从 activeChallenge 获取 (SSE 事件不含 args/result)
    //   🔧 P0 fix (mirror philosophy): buy 路径不弹存款对话框 — 用户买了, 没钱可存
    if (!isBuyPath && toolName === 'complete_challenge' && activeChallenge?.challengeId && activeChallenge?.amount && activeChallenge.amount > 0) {
      onChallengeCompleted?.(activeChallenge.challengeId, activeChallenge.amount);
    }
    // 🔧 需求九: bought 路径 (isBuyPath) — 触发沉默时刻 (bought 文案), 无存款对话框
    if (isBuyPath && toolName === 'complete_challenge' && activeChallenge?.amount && activeChallenge.amount > 0) {
      onChallengeBought?.(activeChallenge.amount, activeChallenge.itemName || '');
    }
    // 🏅 拦截勋章 (绿色转向): 流式路径 "没买" = complete_challenge 且非 buy 路径。
    //    SSE 对同一工具调用会先后发 tool_call + tool_result, 只在 tool_result (权威结果) 派发一次;
    //    activeChallenge 闭包持有 itemName + amount (SSE 事件本身不含 args/result)。
    //    dispatchInterceptMedal 内部有 60s 去重, 与 "I'll pass" 直连完成路径/AI 冗余重调不冲突。
    if (
      parsed.type === 'tool_result' &&
      toolName === 'complete_challenge' &&
      !isBuyPath &&
      activeChallenge?.amount &&
      activeChallenge.amount > 0
    ) {
      dispatchInterceptMedal({
        itemTitle: activeChallenge.itemName || '',
        savedCents: Math.round(activeChallenge.amount * 100),
        date: new Date().toISOString(),
      });
    }
  }
  // 根据工具类型显示通知
  const toolContent = parsed.content || '';
  const notifType: 'reward' | 'penalty' | 'badge' =
    parsed.notifType === 'penalty' ? 'penalty' :
    parsed.notifType === 'badge' ? 'badge' :
    toolName === 'record_impulse' ? 'penalty' :
    toolName === 'add_badge' ? 'badge' : 'reward';
  // 生成通知消息（即使 content 为空也显示工具名通知）
  let notifMessage = toolContent;
  if (!notifMessage) {
    switch (toolName) {
      case 'record_impulse': notifMessage = t('chat.mcpNotifications.impulseRecorded'); break;
      case 'complete_challenge': notifMessage = t('chat.mcpNotifications.challengeCompleted'); break;
      case 'add_tokens': notifMessage = t('chat.mcpNotifications.tokensEarned'); break;
      case 'add_badge': notifMessage = t('chat.mcpNotifications.badgeUnlocked'); break;
      case 'add_dream_fund_progress': notifMessage = t('chat.mcpNotifications.dreamFundUpdated'); break;
      case 'add_vitality': notifMessage = t('chat.mcpNotifications.vitalityAdjusted'); break;
      default: notifMessage = t('chat.mcpNotifications.toolUsed', { toolName });
    }
  }
  // 🔧 架构还债: 用 addMcpNotification 替代内联 setMcpNotifications
  if (notifMessage) {
    addMcpNotification(notifMessage, notifType);
  }
}

/** 🔧 H1 fix: idle timeout — 60s 无数据则中止流 (防 Letta 卡住时黑屏)
 * 🔧 ARCH fix (Round 26 AUDIT-5 MEDIUM-4): 90s → 150s
 * 🔧 2026-07-20 (P0 fix): 150s → 60s (letta/auto 非 reasoning 模式更快, 不需要 150s)
 *    旧代码: 150s timeout (GLM-5.2 reasoning 可静默 >90s)
 *    修复: 60s timeout (letta/auto 非 reasoning 模式通常 5-15s 响应)
 */
const STREAM_IDLE_TIMEOUT_MS = 60_000;

/**
 * consumeAIStream — 消费 SSE 流, 调用 callbacks 处理各类事件, 返回累积结果。
 *
 * 包含 (byte-for-byte 保留自 sendMessage SSE 循环):
 *   - 90s idle timeout (Promise.race + clearTimeout, Round 49 R49-A-1 reject 处理)
 *   - buffer 累积 + split('\n') + pop (保留最后未完结行)
 *   - for (line of lines) 循环: data: 前缀过滤 + [DONE] 跳过 + JSON.parse + 类型分发
 *   - token / reasoning 事件: 累积 + 调 callback (调用方决定 throttled vs immediate)
 *   - tool_result / tool_call 事件: 调 onToolResult callback (通常 → handleToolEvent)
 *   - error 事件: 标记 errorDisplayed + 调 onError callback + (若 callback 返回 true) break
 *   - 剩余 buffer 处理 (BUG-34 fix): 仅当 onRemainingBufferToken 提供时执行
 *   - finally: reader.cancel + releaseLock (Round 19 Frontend H5 — releaseLock() throws if pending read)
 *
 * @returns { reply, reasoning, errorDisplayed } — 调用方同步本地变量 + 判断是否跳过 finalMsg
 */
export async function consumeAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  callbacks: ConsumeAIStreamCallbacks,
): Promise<ConsumeAIStreamResult> {
  let accumulatedReply = '';
  let accumulatedReasoning = '';
  let buffer = '';
  let errorDisplayed = false;
  let idleTimeout = false;

  try {
    while (true) {
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const readResult = await Promise.race([
        reader.read().then(result => {
          if (idleTimer) clearTimeout(idleTimer);
          return result;
        }).catch(err => {
          if (idleTimer) clearTimeout(idleTimer);
          throw err;
        }),
        new Promise<{ done: true; value: undefined }>((resolve) => {
          idleTimer = setTimeout(() => resolve({ done: true, value: undefined }), STREAM_IDLE_TIMEOUT_MS);
        }),
      ]);
      const { done, value } = readResult;
      if (done) {
        idleTimeout = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let shouldBreak = false;
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'token') {
            // 🔧 BUG-189 fix: 防止 null/undefined content 被拼接为字符串 "null"/"undefined"
            const token = parsed.content ?? '';
            if (token) {
              accumulatedReply += token;
              // 🔧 TECH-DEBT-D: 调用方决定 throttled (sendMessage: scheduleStreamUpdate) vs
              //   immediate (retryAiResponse: setMessagesSync)
              callbacks.onToken?.(token, accumulatedReply);
            }
          } else if (parsed.type === 'reasoning') {
            const reasoningToken = parsed.content ?? '';
            if (reasoningToken) {
              accumulatedReasoning += reasoningToken;
              callbacks.onReasoning?.(reasoningToken, accumulatedReasoning);
            }
          } else if (parsed.type === 'tool_result' || parsed.type === 'tool_call') {
            // 工具事件 → 调用方通常委托给 handleToolEvent (公共逻辑)
            callbacks.onToolResult?.(parsed);
            // 🔧 A1 移植 (commerce-agents "UI 组件即工具") 双轨取卡:
            //    新轨 — SSE 事件携带服务端已校验的结构化 cards → 边界再复检后直用;
            //    旧轨 — 无结构化字段时保留 extractProductCards 字符串解析作 fallback (过渡期)。
            //    cards 字段存在但校验后为空 ≠ 缺字段: 结构化通道在即不回退弱轨 (防坏卡复活)。
            const cards = Array.isArray(parsed.cards)
              ? parseStructuredCards({ cards: parsed.cards })
              : extractProductCards(parsed.tool || '', parsed.content);
            if (cards.length) callbacks.onProductCards?.(cards);
          } else if (parsed.type === 'green_alt') {
            // 🌱 绿色替代卡片事件 — 最小形状校验后交给调用方挂到 assistant 消息上
            const payload = parsed.greenAlt as GreenAltCardData | undefined;
            if (payload && typeof payload.id === 'string' && typeof payload.why === 'string' && Array.isArray(payload.options)) {
              callbacks.onGreenAlt?.(payload);
            } else {
              logger.warn('[consume-ai-stream] green_alt event with malformed payload ignored');
            }
          } else if (parsed.type === 'green_alt_retro') {
            // 🌱 batch68-a 复盘追问卡事件 — 最小形状校验 (entryId + 4 选项 id) 后交给调用方
            const payload = parsed.greenAltRetro as GreenAltRetroCardData | undefined;
            if (payload && typeof payload.entryId === 'string'
              && Array.isArray(payload.options) && payload.options.length === 4) {
              callbacks.onGreenAltRetro?.(payload);
            } else {
              logger.warn('[consume-ai-stream] green_alt_retro event with malformed payload ignored');
            }
          } else if (parsed.type === 'shopping_clarify_card') {
            const payload = parsed.shoppingClarifyCard as ShoppingClarifyCardData | undefined;
            if (payload && typeof payload.subject === 'string' && typeof payload.slot === 'string' && Array.isArray(payload.answers)) {
              callbacks.onShoppingClarify?.(payload);
            }
          } else if (parsed.type === 'reuse_hint') {
            // 🔁 复用优先: 预注入事件 (流最前, 先于任何 token) → 挂到当前 assistant 消息
            if (parsed.hint) callbacks.onReuseHint?.(parsed.hint);
          } else if (parsed.type === 'green_knowledge') {
            // 📖 batch47-a 知识问答: 词条来源 chip 事件 — 最小形状校验后交给调用方
            const payload = parsed.greenKnowledge as GreenKnowledgeCardData | undefined;
            if (payload && Array.isArray(payload.entries) && payload.entries.length > 0
              && typeof payload.entries[0].id === 'string' && typeof payload.entries[0].label === 'string') {
              callbacks.onGreenKnowledge?.(payload);
            } else {
              logger.warn('[consume-ai-stream] green_knowledge event with malformed payload ignored');
            }
          } else if (parsed.type === 'micro_challenge') {
            // 🐞 batch46-b: 预注入微挑战提案 (流最前) — 最小形状校验后交给调用方
            const proposal = parsed.microChallenge as MicroChallengeProposal | undefined;
            if (proposal && typeof proposal.category === 'string' && typeof proposal.titleKey === 'string' && proposal.durationHours === 24) {
              callbacks.onMicroChallenge?.(proposal);
            } else {
              logger.warn('[consume-ai-stream] micro_challenge event with malformed payload ignored');
            }
          } else if (parsed.type === 'cooldown_card') {
            // 🐘 batch48-b 反驳降温: 冷静卡事件 — 最小形状校验后交给调用方
            const payload = parsed.cooldownCard as CooldownCardData | undefined;
            if (payload && typeof payload === 'object' && 'category' in payload) {
              callbacks.onCooldownCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] cooldown_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'prepurchase_card') {
            // 🐘 batch50-a 买前三问: 决策卡事件 — 最小形状校验后交给调用方
            const payload = parsed.prepurchaseCard as PrepurchaseCardData | undefined;
            if (payload && typeof payload === 'object' && 'subject' in payload) {
              callbacks.onPrepurchaseCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] prepurchase_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'duplicate_precheck_card') {
            const payload = parsed.duplicatePrecheckCard as DuplicatePrecheckCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.itemTitle === 'string' && typeof payload.category === 'string') {
              callbacks.onDuplicatePrecheckCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] duplicate_precheck_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'commitment_card') {
            // 🐘 batch53-a 绿色承诺: 登记卡事件 — 最小形状校验后交给调用方
            const payload = parsed.commitmentCard as CommitmentCardData | undefined;
            if (payload && typeof payload === 'object' && 'durationKind' in payload) {
              callbacks.onCommitmentCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] commitment_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'compare_card') {
            // 🐘 batch56-a 对比裁决: 裁决卡事件 — 最小形状校验 (两侧对象词) 后交给调用方
            const payload = parsed.compareCard as CompareCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.sideA === 'string' && typeof payload.sideB === 'string') {
              callbacks.onCompareCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] compare_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'alt_footprint') {
            // 🐘 batch55-c 替代足迹: 足迹卡事件 — 最小形状校验 (public 计数字段) 后交给调用方
            const payload = parsed.altFootprint as AltFootprintCardData | undefined;
            if (payload && typeof payload === 'object' && payload.public
              && typeof payload.public.totalAdoptions === 'number'
              && Array.isArray(payload.public.topEntries)) {
              callbacks.onAltFootprint?.(payload);
            } else {
              logger.warn('[consume-ai-stream] alt_footprint event with malformed payload ignored');
            }
          } else if (parsed.type === 'list_triage_card') {
            // 🐘 batch57-a 清单分诊: 分诊卡事件 — 最小形状校验 (items 数组 + word 字符串) 后交给调用方
            const payload = parsed.listTriageCard as ListTriageCardData | undefined;
            if (payload && typeof payload === 'object' && Array.isArray(payload.items)
              && payload.items.length > 0 && payload.items.every((i) => typeof i?.word === 'string')) {
              callbacks.onListTriageCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] list_triage_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'savings_query_card') {
            // 🐘 batch57-c 问账: 对账卡事件 — 最小形状校验 (window/status 字符串) 后交给调用方
            const payload = parsed.savingsQueryCard as SavingsQueryCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.window === 'string'
              && (payload.status === 'ok' || payload.status === 'noData')) {
              callbacks.onSavingsQueryCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] savings_query_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'category_query_card') {
            // 🐘 batch58-c 分类问答: 分类对账卡事件 — 最小形状校验 (window/category 字符串 + status) 后交给调用方
            const payload = parsed.categoryQueryCard as CategoryQueryCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.window === 'string'
              && typeof payload.category === 'string'
              && (payload.status === 'ok' || payload.status === 'noData')) {
              callbacks.onCategoryQueryCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] category_query_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'impulse_time_card') {
            // 🐘 batch58-c 时段问答: 时段统计卡事件 — 最小形状校验 (window/impulseWindow 字符串 + status) 后交给调用方
            const payload = parsed.impulseTimeCard as ImpulseTimeCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.window === 'string'
              && typeof payload.impulseWindow === 'string'
              && (payload.status === 'ok' || payload.status === 'insufficient')) {
              callbacks.onImpulseTimeCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] impulse_time_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'impulse_forecast_card') {
            // 🐘 batch62-c 预报: 预报卡事件 — 最小形状校验 (status 字符串 + days 数组) 后交给调用方
            const payload = parsed.impulseForecastCard as ImpulseForecastCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.status === 'string'
              && Array.isArray(payload.days)) {
              callbacks.onImpulseForecastCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] impulse_forecast_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'guard_pulse_card') {
            // 🐘 batch68-c 脉搏: 脉搏卡事件 — 最小形状校验 (status 字符串 + hours/windows 数组) 后交给调用方
            const payload = parsed.guardPulseCard as GuardPulseCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.status === 'string'
              && Array.isArray(payload.hours) && Array.isArray(payload.windows)) {
              callbacks.onGuardPulseCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] guard_pulse_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'emotion_guard_card') {
            // 🐘 batch60-c 情绪守护: 守护卡事件 — 最小形状校验 (mood/intensity 字符串) 后交给调用方
            const payload = parsed.emotionGuardCard as EmotionGuardCardData | undefined;
            if (payload && typeof payload === 'object' && typeof payload.mood === 'string' && typeof payload.intensity === 'string') {
              callbacks.onEmotionGuardCard?.(payload);
            } else {
              logger.warn('[consume-ai-stream] emotion_guard_card event with malformed payload ignored');
            }
          } else if (parsed.type === 'context_signal') {
            // 🐘 batch61-b 弱信号: 信号词事件 — 最小形状校验 (signal 字符串 + words 数组) 后交给调用方
            const payload = parsed.contextSignal as ContextSignalData | undefined;
            if (
              payload && typeof payload === 'object' && typeof payload.signal === 'string' &&
              Array.isArray(payload.words)
            ) {
              callbacks.onContextSignal?.(payload);
            } else {
              logger.warn('[consume-ai-stream] context_signal event with malformed payload ignored');
            }
          } else if (parsed.type === 'context_trust') {
            const payload = parsed.contextTrust as TrustEvidence | undefined;
            if (
              payload && typeof payload === 'object' && Array.isArray(payload.signals) &&
              Array.isArray(payload.time) && typeof payload.minimal === 'boolean'
            ) {
              callbacks.onContextTrust?.(payload);
            } else {
              logger.warn('[consume-ai-stream] context_trust event with malformed payload ignored');
            }
          } else if (parsed.type === 'error') {
            // 🔧 错误处理: AI 超时/过载时后端发 type='error' SSE 事件
            // 🔧 ARCH fix (Round 69 BUG-AUDIT-69-1): 标记 errorDisplayed, 调用方负责 setMessagesSync
            //   (含 errorContent fallback) + 跳过 finalMsg。consumeAIStream 跑 finally (reader cleanup) 后返回。
            errorDisplayed = true;
            const shouldBreakLoop = callbacks.onError?.(parsed.content) === true;
            if (shouldBreakLoop) {
              shouldBreak = true;
              break;
            }
          }
        } catch (parseErr) {
          // 🔧 2026-07-15 (ARCH-11 #8 修复): 不再静默吞 SSE JSON parse 错误
          //    旧代码: } catch { /* silent */ } — 完全不记录, 影响可观测性
          //    修复: log warn 级别, 帮助排查 SSE 流格式问题
          logger.warn('[consume-ai-stream] SSE JSON parse error:', parseErr instanceof Error ? parseErr.message : String(parseErr));
        }
      }

      if (shouldBreak) break;

      // 🔧 BUG-34 fix: Process remaining buffer after stream ends
      // If the last SSE event didn't end with \n, it's still in the buffer
      // (仅当调用方提供 onRemainingBufferToken 时执行 — sendMessage 提供, retryAiResponse 不提供)
      if (callbacks.onRemainingBufferToken && buffer.trim()) {
        const remainingLine = buffer.trim();
        if (remainingLine.startsWith('data: ')) {
          const remainingData = remainingLine.slice(6).trim();
          if (remainingData && remainingData !== '[DONE]') {
            try {
              const parsed = JSON.parse(remainingData);
              // 🔧 2026-07-21 audit fix (agent-4 #6, BUG-34 follow-up): 成功 parse 后必须清空
              //   buffer, 否则下一次 while 迭代 `buffer += decoded` 会拼到已消费的事件后面,
              //   整体 JSON.parse 失败 → 下一个 token 被静默丢弃。
              buffer = '';
              if (parsed.type === 'token') {
                const token = parsed.content ?? ''; // BUG-293 fix: null safety
                accumulatedReply += token;
                // 🔧 TECH-DEBT-D: Direct setMessages for final buffer (no throttle needed)
                callbacks.onRemainingBufferToken(token, accumulatedReply);
              }
            } catch {
              // Ignore parse errors for remaining buffer (buffer 未清空, 保留供下次重试)
            }
          }
        }
      }
    } // end while
  } finally {
    // 🔧 BUG-10 fix: Ensure reader lock is always released (e.g. on AbortError)
    // 🔧 ARCH fix (Round 19 Frontend H5 — releaseLock() throws if pending read()):
    //    旧代码: reader.releaseLock() — 若有 pending reader.read() (如 90s timeout 后),
    //    WHATWG spec 说 releaseLock 会 throw TypeError → catch 块替换部分回复为 error。
    //    根因修复: 先 cancel reader (取消 pending read), 再 releaseLock。
    try {
      await reader.cancel();
    } catch {
      // reader.cancel() may throw if already cancelled — ignore
    }
    try {
      reader.releaseLock();
    } catch {
      // releaseLock may throw if no active read — ignore
    }
  }

  return { reply: accumulatedReply, reasoning: accumulatedReasoning, errorDisplayed, idleTimeout };
}

/** 重新导出 ChatMessage 类型, 方便调用方 (避免循环依赖) */
export type { ChatMessage };
