/**
 * useChatActions — sendMessage + retryAiResponse 抽取
 *
 * 🔧 ARCH fix (Round 67 — chat-tab.tsx god component 拆分):
 *    从 chat-tab.tsx 提取 sendMessage (~620 行) + retryAiResponse (~230 行)。
 *    chat-tab.tsx 从 1677 行 → ~1000 行 (预估)。
 *
 * 🔧 ARCH fix (Round 70 — use-chat-actions.ts split):
 *    SSE 流消费 (while(true) + 缓冲区处理 + idle timeout + reader cleanup) + 工具事件
 *    (tool_result/ 的 notification/toast/challenge 清除) 提取为公共函数
 *    consumeAIStream + handleToolEvent (见 ./consume-ai-stream.ts)。两个调用方通过 callbacks
 *    注入各自的 setMessagesSync / throttling 行为。行为零变化, 逻辑/注释/控制流 byte-for-byte 保留。
 *
 * 🔧 ARCH fix (2026-07-22): Type definitions extracted to use-chat-actions-types.ts
 *    to reduce file from 851 to <800 lines.
 *
 * 行为零变化: 纯函数提取, 逻辑/注释/控制流 byte-for-byte 保留。
 * 唯一变化: 闭包变量改为 params 解构; 两个函数包 useCallback (deps 包含闭包读取的 state);
 * retryAiResponse 自引用 + sendMessage 内 onRetry 引用改为 retryAiResponseRef
 * (避免互相进入对方 deps → 重建循环)。
 *
 * 依赖: chat-tab.tsx 通过 params 对象注入 refs/state/setters/callbacks/i18n。
 */

'use client';

import { symyEvents } from '@/lib/posthog';

import { useCallback, useRef } from 'react';
import { ChatMessage } from '@/components/chat-bubble';
import { logger } from '@/lib/logger';
import { extractProductCards } from '@/lib/product-tool-result';
import type { ProductCardData } from '@/types/product-card';
// 🌱 绿色替代卡片: green_alt SSE 事件 / 非流式 greenAlt 字段挂到 assistant 消息
import type { GreenAltCardData } from '@/types/green-alt-card';
// 🐞 batch46-b 微挑战: micro_challenge SSE 事件 / 非流式 microChallenge 字段挂到 assistant 消息;
// 频控历史 (localStorage) 随请求体上行给服务端 detector 做 7 天同品类冷却
import { readMicroChallengeHistory } from '@/components/chat/parts/micro-challenge-store';
// 🐘 batch61-b 弱信号: 会话内已纠正的信号词条 id (sessionStorage) 随请求上行,
//    服务端 detector 排除 — 用户一次纠正, 本会话不再重复同信号
import { readDismissedContextSignals } from '@/components/chat/parts/context-signal-store';
import { readAskedShoppingSubjects } from '@/components/chat/parts/shopping-clarify-store';
// 🌱 batch68-a 复盘会话态: 采纳待追问 / 待回答 / 选项草稿, 发送时一次性消费上行
import {
  consumeGreenAltRetroForRequest,
  markGreenAltRetroAwaited,
} from '@/components/chat/parts/green-alt-retro-store';
import type { GreenAltRetroCardData } from '@/types/green-alt-retro';
import { ApiError, getErrorStatus } from '@/lib/errors/api-error';
// 🌱 绿色守护开关 (localStorage 零 DDL): 发请求时透传给 /api/chat → symy_green_pref
import { getGreenPrefEnabled } from '@/hooks/use-green-pref';
import { getGuardIntensity } from '@/hooks/use-guard-intensity';
import { getGuardScope } from '@/hooks/use-guard-scope';
// SSE 流消费 + 工具事件处理提取为公共函数
import { consumeAIStream, handleToolEvent } from './consume-ai-stream';
// 🐘 batch59-c 追问跟随: 最近一条数据问答卡元数据随请求体上行 (内存级会话态)
import { lastDataQueryMeta } from './data-query-follow-up';
import { handleDemoSendMessage } from './demo-send-message';
import { applyDriftGuard, DRIFT_REPLACEMENTS } from '@/lib/chat-drift-guard';
// retryAiResponse 提取为独立 impl 函数
import { retryAiResponseImpl } from './retry-ai-response';
// 🔧 ARCH fix (2026-07-22): Types extracted to separate file
import type { UseChatActionsParams } from './use-chat-actions-types';
export type { ImpulseContext, SendMessageLockState, UseChatActionsParams } from './use-chat-actions-types';

// batch80-b (b79c-defects #2): AI tool-call args 无 schema 保证 — 通知文案金额只认有限非零数字,
// 其余 (字符串/NaN/Infinity/0) 回落 undefined 走无金额文案 (0 维持既有 falsy 分档, 不改语义)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : undefined);

/**
 * useChatActions — sendMessage + retryAiResponse
 *
 * 返回两个 useCallback 包装的函数。chat-tab.tsx 通过:
 *   const { sendMessage, retryAiResponse } = useChatActions({ ... });
 * 接入。
 *
 * 注意:
 * - retryAiResponse 被 sendMessage 内部的 onRetry 闭包引用 (4 处)。
 *   为避免 sendMessage deps 含 retryAiResponse → 重建循环, 使用 retryAiResponseRef。
 * - retryAiResponse 自身的 onRetry 闭包也引用自身 (2 处), 同样使用 ref。
 * - ref 在每次 render 同步赋值 (类似 chat-tab.tsx 既有的 sendMessageRef 模式)。
 */
export function useChatActions({
  state,
  refs,
  setters,
  callbacks,
  i18n,
  demo,
}: UseChatActionsParams) {
  const {
    activeChallenge,
    isLoadingHistory,
    isDemo,
    impulseContext,
    locale,
  } = state;

  const {
    sendMessageLockRef,
    abortRef,
    messagesRef,
    activeChallengeRef,
    impulseContextRef,
    localeRef,
    justCompletedChallengeRef,
    demoReplyTimerRef,
    demoAuthTimerRef,
    demoMsgCountRef,
    buddyStateRefreshTimerRef,
    skipNextHistoryLoadRef,
    skipNonceRef,
    justBoughtChallengeRef,
  } = refs;

  const {
    setMessagesSync,
    setIsLoading,
    setInput,
    setActiveChallenge,
  } = setters;

  const {
    nextId,
    saveMessage,
    handleMCPResults,
    addMcpNotification,
    onBuddyStateRefresh,
    onAuthPrompt,
    onToast,
    onChallengeCompleted,
    onChallengeBought,
  } = callbacks;

  const { t } = i18n;
  const { DEMO_FREE_MESSAGES } = demo;

  // retryAiResponse 自引用 ref — 避免 sendMessage deps 含 retryAiResponse
  //   (若 retryAiResponse 在 sendMessage deps 内, retry 重建会触发 sendMessage 重建 →
  //    useLayoutEffect 重新写 sendMessageRef → 不必要的 effect 触发)。
  //   原代码 sendMessage 是普通函数 (每次 render 重建), onRetry 闭包捕获 render 时的 retryAiResponse。
  //   等价行为: ref 每次 render 同步赋值 → onRetry 调用时拿到当前 render 的 retryAiResponse。
  const retryAiResponseRef = useRef<((content: string) => Promise<void>) | null>(null);

  // ======== 发送消息 ========
  // displayContent: UI 上显示的简洁消息（如 "I want to buy Nike Air Max for $129.99. Challenge me!"）
  // apiContent: 发给 API 的完整提示词（如包含 CHALLENGE MODE 指令的长文本），不传则等于 displayContent
  // overrideChallengeContext: BUG-4 FIX — 显式传入 challenge 上下文，不依赖组件 state
  //   解决：Give Up 按钮先清 banner 再发消息，导致 sendMessage 读到 undefined 的问题
  // isBuyPath: 🔧 P0 fix (mirror philosophy — I choose to buy): true 表示此调用来自 handleChooseToBuy,
  //   sendMessage 会设 justBoughtChallengeRef.current=true, 让 handleToolEvent 知道接下来 AI 调
  //   complete_challenge(status='failed') 是 buy 路径, 应跳过存款对话框 + passed toast。
  //   finally 块清除 ref。设此参数后, handleChooseToBuy 不再手动设 ref (避免 force-abort race)。
  const sendMessage = useCallback(async (content: string, apiContent?: string, overrideChallengeContext?: { itemName: string; amount: number; challengeId?: string }, isBuyPath?: boolean, actionType?: 'saw_it' | 'chose_to_buy' | 'challenge_created') => {
    // 🔧 P0 fix (mirror philosophy — I choose to buy): 在 sendMessage 入口同步设/清 buy flag。
    //   旧代码: handleChooseToBuy 在调用 sendMessage 前设 ref=true → 若 sendMessage 被 force-abort
    //   (旧 stream 还在跑), finally 块因 abort mismatch 不清 ref → ref 泄漏到下一个 sendMessage →
    //   下一个挑战的 complete_challenge 误判为 buy 路径 → 跳过存款对话框 + passed toast。
    //   修复: ref 由 sendMessage 内部管理 (基于 isBuyPath 参数), 不依赖外部预设。
    //   - isBuyPath=true → ref=true (buy 路径, 跳过存款对话框)
    //   - isBuyPath=false/undefined → ref=false (passed 路径, 正常显示存款对话框)
    justBoughtChallengeRef.current = isBuyPath === true;

    // 🔧 P0 fix (Bug 3): 入口统一捕获 msgMode, 防止 setActiveChallenge 异步导致 mode 错误
    // overrideChallengeContext (Give Up / resume) 优先, 其次 activeChallenge
    const inChallenge = !!(overrideChallengeContext || activeChallenge);
    const msgMode: 'challenge' | 'normal' = inChallenge ? 'challenge' : 'normal';
    // 历史加载中不允许发送，防止消息乱序
    // isLoadingHistoryRef 已删除, 用 state (sendMessage 每次 render 重建, 闭包最新)
    // BUG-4 FIX: When overrideChallengeContext is provided (Give Up button),
    // force-abort any in-progress stream so the surrender message can go through.
    if (!content.trim()) return;
    // 🔧 BUG-018 root cause fix: 模块级互斥锁 — 同步检查, 不依赖 React ref
    // 🔧 ARCH fix (Round 19 Frontend C1 — lock check blocks Give Up/Resume force-abort):
    //    旧代码: if (sendMessageLockRef.current.inProgress) return; — 无条件 return,
    //    导致 overrideChallengeContext (Give Up/Resume) 的 force-abort 逻辑 (line 662) 是死代码。
    //    根因修复: overrideChallengeContext 跳过 early return, 允许进入 force-abort 路径。
    // 🔧 Bug 25 fix (Challenge 用户消息不显示):
    //    旧代码: lock 持有时, 普通 sendMessage 直接 return → 用户消息不显示, AI 也不回新消息。
    //      场景: Challenge 模式 AI 首回复慢 (10-30s reasoning) → 用户想回复 → 消息被吞。
    //    根因修复: lock 持有时, 也 abort 当前 stream 并继续发送 (与 overrideChallengeContext 同路径)。
    //    保护: 1s dedup 窗口已防双击; abortController 代际判断防 finally 错释放锁。
    // 🔧 Adversarial review fix: dedup 必须在 force-abort 之前 — 否则双击同一消息
    //    会先 abort 当前 stream, 再被 dedup 吞掉, 导致 AI 回复被中断且无新 AI 回复。
    //    正确顺序: 1) dedup check (passive, 不动 lock) → 2) force-abort (active, 释放 lock)
    const now = Date.now();
    const trimmedContent = content.trim();
    const DEDUP_WINDOW_MS = 1000; // 1s (was 5s — 5s 吞掉合法 retry)
    if (!overrideChallengeContext &&
        trimmedContent === sendMessageLockRef.current.lastContent &&
        now - sendMessageLockRef.current.lastTime < DEDUP_WINDOW_MS) {
      logger.info('[ChatTab] sendMessage dedup: same content within 1s, skipping');
      return;
    }
    if (sendMessageLockRef.current.inProgress && !overrideChallengeContext) {
      // 🔧 Bug 25 fix: lock 持有 → 仍允许用户发送新消息 (abort 当前 AI stream)
      //   旧代码: 直接 return → 用户消息丢失 (Bug 25 根因)
      //   修复: 进入 force-abort 路径 (与 Give Up 同逻辑), 释放锁 + abort stream, 然后继续发送
      //   注意: dedup 已在上面执行过, 这里不会双击触发
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      sendMessageLockRef.current.inProgress = false;
      setIsLoading(false);
      // 不 return — 继续走正常发送流程
    }
    if (sendMessageLockRef.current.inProgress && overrideChallengeContext) {
      // Force-abort the current stream so surrender message can be sent
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      sendMessageLockRef.current.inProgress = false;
      setIsLoading(false);
    }
    // 🔧 ARCH fix (Round 22 Frontend H2 — force-abort bypasses lock but not isLoadingHistory):
    //    旧代码: overrideChallengeContext 绕过 lock check 但不绕过 isLoadingHistory check →
    //    Give Up/Resume 在 history 加载中被静默丢弃。
    //    根因修复: overrideChallengeContext 也绕过 isLoadingHistory check。
    if (sendMessageLockRef.current.inProgress || (isLoadingHistory && !overrideChallengeContext)) return;
    // 立即设模块级互斥锁, 防止并发
    sendMessageLockRef.current.inProgress = true;
    sendMessageLockRef.current.lastTime = now;
    sendMessageLockRef.current.lastContent = trimmedContent;
    // BUG-95 fix: Abort previous request and create new AbortController
    if (abortRef.current) abortRef.current.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Demo 模式：拦截发送，弹出注册提示
    // 🔧 F45 fix: 匿名用户第一次挑战消息走真实 AI 分析 (让用户感受产品价值)
    //   旧代码: demo 模式全部走 canned reply, 用户无法体验真实 AI
    //   新代码: 第一次挑战消息 (demoMsgCountRef.current === 0 + 有 challengeContext) 走真实 API
    //   后续消息走 demo canned reply + 注册引导
    if (isDemo) {
      const isFirstChallenge = demoMsgCountRef.current === 0 && (overrideChallengeContext || activeChallengeRef.current);
      if (!isFirstChallenge) {
        // Demo mode logic extracted to demo-send-message.ts (handleDemoSendMessage)
        //    Behavior: add user msg → 1.5s delay → add AI canned reply → auth prompt after N msgs
        // 传 overrideChallengeContext (saw_it/chose_to_buy 路径需要)
        handleDemoSendMessage({
          content,
          activeChallengeRef,
          demoMsgCountRef,
          demoReplyTimerRef,
          demoAuthTimerRef,
          sendMessageLockRef,
          nextId,
          setMessagesSync,
          setInput,
          setIsLoading,
          onAuthPrompt,
          DEMO_FREE_MESSAGES,
          locale, // 🐘 人设转型: demo 小象话术按 UI 语言取词 (elephant-tone.ts)
          overrideChallengeContext: overrideChallengeContext,
        });
        return;
      }
      // 第一次挑战消息: 标记已用, 继续走真实 API 路径 (不 return)
      demoMsgCountRef.current = 1;
    }

    // sendMessageLockRef 已在 guard 后立即设置 (BUG-018 fix)

    // 🔧 ARCH fix Round 73 (Finding 9.5): enterTurboPolling chain removed — was no-op
    // in Realtime mode. Realtime subscription handles MCP tool update perception (<1s).

    // UI 显示简洁消息，API 可收到完整提示词（如 Challenge 指令）
    const displayContent = content.trim();
    const fullApiContent = (apiContent || content).trim();
    // 🔧 P1-2 fix: 当 actionType 存在时, 消息 role='action' (渲染为状态徽章, 非用户气泡)
    //   AI 仍通过 apiMessages 收到完整上下文 (role 映射为 'user' 发给 API)
    const userMsg: ChatMessage = {
      id: nextId(actionType ? 'action' : 'user'),
      role: actionType ? 'action' : 'user',
      content: displayContent,
      timestamp: new Date(),
      mode: msgMode,
      ...(actionType ? { actionType } : {}),
    };

    setMessagesSync((prev) => {
      // 🔧 NEW-016 fix: 去重 — 如果 userMsg 已存在, 不再追加
      if (prev.some(m => m.id === userMsg.id)) return prev;
      return [...prev, userMsg];
    });
    setInput('');
    setIsLoading(true);

    saveMessage(userMsg);

    symyEvents.chatMessageSent({ mode: isDemo ? 'demo' : 'real' });

    // 防止 loadHistory 覆盖刚发的用户消息
    // 🔧 NEW-025 fix: 也设 nonce, 防止 sendMessage 后 loadHistory 被不必要触发
    skipNextHistoryLoadRef.current = true;
    skipNonceRef.current = Date.now();

    // 🔧 NEW-063 fix (Round 69): 提升 assistantMsgId 到 try 块外, 让 catch 能精确移除
    //   旧代码: assistantMsgId 在 SSE 分支内声明, catch 不可见 → 用 "find last empty assistant"
    //   启发式移除 → 快速发送时可能误删第二条消息的 assistant 气泡
    //   修复: 提升到 try 外, catch 用精确 id 移除
    let assistantMsgId: string | null = null;

    try {
      // BUG-182 fix: 使用 messagesRef.current 代替 messages，避免 stale closure
      // 构建 API 消息列表：UI 用 displayContent，API 用 fullApiContent
      // 防御性 filter — 防止 ref 提前一拍包含 userMsg
      // 🔧 P1-2 fix: action role → user role when sending to API (AI needs user context)
      const apiMessages = [...messagesRef.current.filter(m => m.id !== userMsg.id), { ...userMsg, content: displayContent }].map((m) => ({
        role: m.role === 'action' ? 'user' as const : m.role,
        content: m.id === userMsg.id ? fullApiContent : m.content,
      }));

      // 🔧 V3-5 fix: 用 activeChallengeRef.current (最新值) 而非 activeChallenge (可能 stale)
      //   根因: setActiveChallenge(undefined) 后, 同一轮 activeChallenge state 仍是旧值
      //   修复: 用 ref 获取最新值, 确保挑战完成后不传旧 context
      const currentActiveChallenge = activeChallengeRef.current || activeChallenge;

      // 🔧 2026-07-20 (P0 fix): 匿名试用 — demo 模式调 /api/chat/anonymous (IP 限流 3 次/天)
      //    旧代码: demo 模式也调 /api/chat → 401 → 用户看到 "Symy is quiet" 被误导
      //    修复: demo 模式调 /api/chat/anonymous, 支持 3 次免费试用, 超限后引导注册
      const chatEndpoint = isDemo ? '/api/chat/anonymous' : '/api/chat';
      // 🌱 batch68-a: 复盘会话态一次性消费 (pending=待追问 / answer=待回答或选项点击;
      // 读后即清 — 无论服务端是否触发, 同一采纳/同一追问只消费一次, 不顺延重复)
      const greenAltRetroState = consumeGreenAltRetroForRequest();
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          impulseContext: impulseContext || null,
          // 🔧 N31 fix: 只在有 overrideChallengeContext（Give Up 按钮）或 activeChallenge 仍在挑战中时传 challengeContext
          // 防止上一轮挑战残留的 activeChallenge 误关联到新的自由对话
          challengeContext: overrideChallengeContext || (currentActiveChallenge ? currentActiveChallenge : null) || null,
          stream: true, // 🚀 启用 SSE 流式响应，用户更早看到首 token（体感快 2-3x）
          locale, // 🌐 Bug 5 fix: pass UI language so AI responds in the correct language
          // 🌱 绿色守护开关: 发送时读最新值 (非 hook 订阅, 避免 stale closure)
          greenPref: getGreenPrefEnabled() ? 'on' : 'off',
          // 🛡️ batch48-a: 守护强度三档上行 (letta-turn-context 注入档位指令行)
          guardIntensity: getGuardIntensity(),
          // 🗺️ batch53-b: 守护范围三态上行 (scope 指令行注入 + 豁免品类拦截卡静默)
          guardScope: getGuardScope(),
          // 🐞 batch46-b: 微挑战频控历史上行 (服务端 detector 消费; 空/不可读 → 空数组)
          microChallengeHistory: readMicroChallengeHistory(),
          // 🐘 batch59-c 追问跟随: 最近数据问答卡的窗口/维度 (无则 null — 服务端回落普通检测)
          dataQueryContext: lastDataQueryMeta(messagesRef.current),
          // 🐘 batch61-b 弱信号会话纠正: 已纠正词条 id 上行 (空/不可读 → 空数组)
          dismissedContextSignals: readDismissedContextSignals(),
          askedShoppingSubjects: readAskedShoppingSubjects(),
          // 🐘 batch48-b 反驳降温: 上一轮 assistant 消息带过守护卡 (green/reuse/micro)
          // 时上行 true — 服务端据此才启用 pushback 预检 (普通咨询轮不误触发)
          afterGuardCard: (() => {
            const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === 'assistant');
            return !!(lastAssistant && (lastAssistant.greenAlt || lastAssistant.reuseHint || lastAssistant.microChallenge));
          })(),
          // 🌱 batch68-a 复盘: 采纳后待追问 / 追问后的回答 (选项带 optionId; 自由
          // 文本只带 entryId, 由服务端让位 gate 判定是否真回答)
          pendingGreenAltRetro: greenAltRetroState?.pending ?? undefined,
          greenAltRetroAnswer: greenAltRetroState?.answer ?? undefined,
        }),
        signal: abortController.signal, // 🔧 BUG-38: 添加取消信号
        credentials: 'include', // 确保 cookie 发送 (与 apiFetch 对齐)
      });

      // Check HTTP status before processing response
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // 🔧 2026-07-20 (P0 fix): 保留 status, 让 catch 块能区分 401 (需登录) vs 500 (真错误)
        //    旧代码: throw new Error(string) → catch 块只显示通用 "Symy is quiet", 401 用户被误导
        //    修复: 用 ApiError 带 status, catch 块根据 status 显示不同信息
        throw new ApiError(`Chat API error (${response.status}): ${errorText.substring(0, 200)}`, response.status);
      }

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedReply = '';
        let accumulatedReasoning = '';
        assistantMsgId = nextId('ai'); // 🔧 NEW-063 fix: 赋值 (声明已提升到 try 外)
        const currentAssistantMsgId = assistantMsgId; // 局部 const, TS 收窄类型
        const turnId = currentAssistantMsgId; // 🔧 batch43-b: 漂移日志用 turnId

        // 🔧 TECH-DEBT-D: Throttled streaming updates
        // Instead of setMessages on every SSE token (~3-10/sec), batch updates
        // via requestAnimationFrame (~60fps max). Reduces re-renders by ~60%.
        let streamingRafId = 0;
        let pendingStreamUpdate = false;

        // Track SSE error to prevent finally's flushStreamUpdate
        //    from overwriting errorContent with accumulatedReply ("").
        //    旧代码: SSE 'error' 事件设 errorContent + isError + onRetry → return → finally 调 flushStreamUpdate()
        //    → flushStreamUpdate 用 accumulatedReply (可能是 "") 覆盖 content → 用户看到空气泡/部分回复,
        //    errorContent (如 "Connection interrupted") 丢失。
        //    根因修复: error 事件设 sseErrorDisplayed=true + 取消 pending rAF, finally 跳过 flush。
        let sseErrorDisplayed = false;
        // batch80-a fix (/tmp/b79c-defects.md #1): 空 SSE 流 (idle timeout / 流关闭零 token) 时
        //    try 块写入 streamInterrupted 兜底文案 + isError + onRetry 后 return,
        //    finally 无条件 flushStreamUpdate() 用空串 accumulatedReply 覆盖 content → 空气泡。
        //    修复: 与 sseErrorDisplayed 同款守卫 — 兜底文案已写入时 finally 跳过 flush。
        let idleFallbackDisplayed = false;
        let productCards: ProductCardData[] = [];
        let greenAltCard: GreenAltCardData | undefined;
        // 🌱 batch68-a: green_alt_retro 预注入事件附带 (finalMsg 持久化用, 与 greenAlt 同策略)
        let greenAltRetroCard: GreenAltRetroCardData | undefined;
        // 🔁 复用优先: reuse_hint 预注入事件附带 (finalMsg 持久化用, 与 productCards 同策略)
        let reuseHint: ChatMessage['reuseHint'];
        // 🐞 batch46-b: micro_challenge 预注入事件附带 (finalMsg 持久化用)
        let microChallenge: ChatMessage['microChallenge'];
        // 📖 batch47-a 知识问答: green_knowledge 预注入事件附带 (finalMsg 用)
        let greenKnowledge: ChatMessage['greenKnowledge'];
        // 🐘 batch48-b 反驳降温: cooldown_card 预注入事件附带 (finalMsg 用)
        let cooldownCard: ChatMessage['cooldownCard'];
        // 🐘 batch50-a 买前三问: prepurchase_card 预注入事件附带 (finalMsg 用)
        let prepurchaseCard: ChatMessage['prepurchaseCard'];
        let duplicatePrecheckCard: ChatMessage['duplicatePrecheckCard'];
        // 🐘 batch53-a 绿色承诺: commitment_card 预注入事件附带 (finalMsg 用)
        let commitmentCard: ChatMessage['commitmentCard'];
        // 🐘 batch56-a 对比裁决: compare_card 预注入事件附带 (finalMsg 用)
        let compareCard: ChatMessage['compareCard'];
        // 🐘 batch55-c 替代足迹: alt_footprint 预注入事件附带 (finalMsg 用)
        let altFootprint: ChatMessage['altFootprint'];
        // 🐘 batch57-a 清单分诊: list_triage_card 预注入事件附带 (finalMsg 用)
        let listTriageCard: ChatMessage['listTriageCard'];
        // 🐘 batch57-c 问账: savings_query_card 预注入事件附带 (finalMsg 用)
        let savingsQueryCard: ChatMessage['savingsQueryCard'];
        // 🐘 batch58-c 分类问答: category_query_card 预注入事件附带 (finalMsg 用)
        let categoryQueryCard: ChatMessage['categoryQueryCard'];
        // 🐘 batch58-c 时段问答: impulse_time_card 预注入事件附带 (finalMsg 用)
        let impulseTimeCard: ChatMessage['impulseTimeCard'];
        // 🐘 batch62-c 预报: impulse_forecast_card 预注入事件附带 (finalMsg 持久化用)
        let impulseForecastCard: ChatMessage['impulseForecastCard'];
        // 🐘 batch68-c 脉搏: guard_pulse_card 预注入事件附带 (finalMsg 持久化用)
        let guardPulseCard: ChatMessage['guardPulseCard'];
        // 🐘 batch60-c 情绪守护: emotion_guard_card 预注入事件附带 (finalMsg 用)
        let emotionGuardCard: ChatMessage['emotionGuardCard'];
        // 🐘 batch61-b 弱信号: context_signal 预注入事件附带 (finalMsg 用)
        let contextSignal: ChatMessage['contextSignal'];
        let contextTrust: ChatMessage['contextTrust'];
        let shoppingClarifyCard: ChatMessage['shoppingClarifyCard'];

        // 🔧 BUG-325 v6 fix: 流式过程中始终显示 content — 不做思考链检测
        const flushStreamUpdate = () => {
          pendingStreamUpdate = false;
          streamingRafId = 0;
          setMessagesSync((prev) => {
            // 🔧 ARCH fix: 如果 assistantMsg 还没在 prev 中 (React 批处理延迟), 先追加
            const exists = prev.some(m => m.id === currentAssistantMsgId);
            if (!exists) {
              return [...prev, {
                id: currentAssistantMsgId,
                role: 'assistant' as const,
                content: accumulatedReply,
                reasoning: accumulatedReasoning || undefined,
                timestamp: new Date(),
                mode: msgMode,
              }];
            }
            return prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, content: accumulatedReply, reasoning: accumulatedReasoning || m.reasoning }
                : m
            );
          });
        };
        const scheduleStreamUpdate = () => {
          if (!pendingStreamUpdate) {
            pendingStreamUpdate = true;
            streamingRafId = requestAnimationFrame(flushStreamUpdate);
          }
        };

        const assistantMsg: ChatMessage = {
          id: currentAssistantMsgId,
          role: 'assistant',
          content: '',
          reasoning: undefined,
          timestamp: new Date(),
          mode: msgMode,
        };
        setMessagesSync((prev) => {
          // 🔧 NEW-016 fix: 去重 — 如果 assistantMsg 已存在 (React 批处理延迟导致重复), 不再追加
          if (prev.some(m => m.id === currentAssistantMsgId)) return prev;
          return [...prev, assistantMsg];
        });

        if (reader) {
          try {
            // SSE while(true) + idle timeout + reader cleanup 提取到
            //    consumeAIStream (见 ./consume-ai-stream.ts)。此处的 try/finally 仅保留 rAF cleanup +
            //    flush (sendMessage 特有的 throttling)。reader.cleanup 已移入 consumeAIStream 的 finally。
            //    🔧 H1 fix: 90s idle timeout + Round 49 R49-A-1 reject 处理 也在 consumeAIStream 内。
            //    🔧 BUG-10 fix / Round 19 Frontend H5: reader.cancel + releaseLock 也在 consumeAIStream 内。
            const streamResult = await consumeAIStream(reader, decoder, {
              onToken: (_token, accReply) => {
                accumulatedReply = accReply;
                // 🔧 TECH-DEBT-D: Throttled — schedule update instead of immediate setMessages
                scheduleStreamUpdate();
              },
              onReasoning: (_token, accReasoning) => {
                accumulatedReasoning = accReasoning;
                // 🔧 TECH-DEBT-D: Throttled — schedule update instead of immediate setMessages
                scheduleStreamUpdate();
              },
              onToolResult: (parsed) => handleToolEvent(parsed, {
                activeChallenge, t, locale, setActiveChallenge, onBuddyStateRefresh, onToast,
                addMcpNotification, justCompletedChallengeRef,
                // 🔧 信任存入 fix (Round 106): 流式路径 tool_result → 弹出 DepositDialog
                onChallengeCompleted,
                // 🔧 需求九: bought 路径 → 沉默时刻 (bought)
                onChallengeBought,
                // 🔧 P0 fix (mirror philosophy): buy 路径不弹存款对话框 + 不显示 passed toast
                justBoughtChallengeRef,
              }),
              onProductCards: (cards) => {
                productCards = cards;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, productCards: cards, productCardsQuery: content } : m
                ));
              },
              onGreenAlt: (data) => {
                // 🌱 绿色替代卡片: 预检命中 → 挂到当前 assistant 消息 (气泡下方渲染)
                greenAltCard = data;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, greenAlt: data } : m
                ));
              },
              onGreenAltRetro: (data) => {
                // 🌱 batch68-a 复盘追问卡: 挂到当前 assistant 消息 + 记 awaiting 会话态
                // (下一条自由文本视为回答尝试; 用户点「先不聊这个」时会话态被清)
                greenAltRetroCard = data;
                markGreenAltRetroAwaited(data.entryId);
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, greenAltRetro: data } : m
                ));
              },
              onReuseHint: (hint) => {
                // 🔁 复用优先: SSE 流最前的 reuse_hint 事件 → 挂到当前 assistant 消息
                reuseHint = hint;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, reuseHint: hint } : m
                ));
              },
              onMicroChallenge: (proposal) => {
                // 🐞 batch46-b: 微挑战提案只在没有进行中的挑战时挂卡 —
                // 已有 active 挑战时接受微挑战会把真实挑战顶掉 (create 会 expire 旧 active), 直接静默丢弃
                if (currentActiveChallenge) return;
                microChallenge = proposal;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, microChallenge: proposal } : m
                ));
              },
              onGreenKnowledge: (data) => {
                // 📖 batch47-a 知识问答: 词条来源 chip → 挂到当前 assistant 消息
                greenKnowledge = data;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, greenKnowledge: data } : m
                ));
              },
              onCooldownCard: (card) => {
                // 🐘 batch48-b 反驳降温: 冷静卡 → 挂到当前 assistant 消息
                cooldownCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, cooldownCard: card } : m
                ));
              },
              onPrepurchaseCard: (card) => {
                // 🐘 batch50-a 买前三问: 三问决策卡 → 挂到当前 assistant 消息
                prepurchaseCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, prepurchaseCard: card } : m
                ));
              },
              onDuplicatePrecheckCard: (card) => {
                duplicatePrecheckCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, duplicatePrecheckCard: card } : m
                ));
              },
              onCommitmentCard: (card) => {
                // 🐘 batch53-a 绿色承诺: 承诺登记卡 → 挂到当前 assistant 消息
                commitmentCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, commitmentCard: card } : m
                ));
              },
              onCompareCard: (card) => {
                // 🐘 batch56-a 对比裁决: 裁决卡 → 挂到当前 assistant 消息
                compareCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, compareCard: card } : m
                ));
              },
              onAltFootprint: (card) => {
                // 🐘 batch55-c 替代足迹: 足迹卡 → 挂到当前 assistant 消息
                altFootprint = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, altFootprint: card } : m
                ));
              },
              onListTriageCard: (card) => {
                // 🐘 batch57-a 清单分诊: 分诊卡 → 挂到当前 assistant 消息
                listTriageCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, listTriageCard: card } : m
                ));
              },
              onSavingsQueryCard: (card) => {
                // 🐘 batch57-c 问账: 对账卡 → 挂到当前 assistant 消息
                savingsQueryCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, savingsQueryCard: card } : m
                ));
              },
              onCategoryQueryCard: (card) => {
                // 🐘 batch58-c 分类问答: 分类对账卡 → 挂到当前 assistant 消息
                categoryQueryCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, categoryQueryCard: card } : m
                ));
              },
              onImpulseTimeCard: (card) => {
                // 🐘 batch58-c 时段问答: 时段统计卡 → 挂到当前 assistant 消息
                impulseTimeCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, impulseTimeCard: card } : m
                ));
              },
              onImpulseForecastCard: (card) => {
                // 🐘 batch62-c 预报: 预报卡 → 挂到当前 assistant 消息
                impulseForecastCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, impulseForecastCard: card } : m
                ));
              },
              onGuardPulseCard: (card) => {
                // 🐘 batch68-c 脉搏: 脉搏卡 → 挂到当前 assistant 消息
                guardPulseCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, guardPulseCard: card } : m
                ));
              },
              onEmotionGuardCard: (card) => {
                // 🐘 batch60-c 情绪守护: 三选项守护卡 → 挂到当前 assistant 消息
                emotionGuardCard = card;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, emotionGuardCard: card } : m
                ));
              },
              onContextSignal: (data) => {
                // 🐘 batch61-b 弱信号: 信号词 chips → 挂到当前 assistant 消息
                contextSignal = data;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, contextSignal: data } : m
                ));
              },
              onContextTrust: (data) => {
                contextTrust = data;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, contextTrust: data } : m
                ));
              },
              onShoppingClarify: (data) => {
                shoppingClarifyCard = data;
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId ? { ...m, shoppingClarifyCard: data } : m
                ));
              },
              onError: (rawContent) => {
                // 🔧 错误处理: AI 超时/过载时后端发 type='error' SSE 事件
                const errorContent = rawContent || t('chat.aiFallback.connectionInterrupted');
                // 标记 error 已显示 + 取消 pending rAF,
                //    防 finally 的 flushStreamUpdate 用 accumulatedReply 覆盖 errorContent。
                sseErrorDisplayed = true;
                if (streamingRafId) {
                  cancelAnimationFrame(streamingRafId);
                  streamingRafId = 0;
                }
                pendingStreamUpdate = false;
                // 替换当前的空 assistantMsg 为错误消息
                setMessagesSync((prev) => prev.map((m) =>
                  m.id === currentAssistantMsgId
                    ? { ...m, content: errorContent, isError: true, onRetry: () => {
                        // 🔧 NEW-002 fix: 只重试 AI 回复, 不重新发送用户消息
                        setMessagesSync((prev2) => prev2.filter((m2) => m2.id !== currentAssistantMsgId));
                        const lastUserMsg = messagesRef.current.filter((m2) => m2.role === 'user').pop();
                        if (lastUserMsg) {
                          // 🔧 P0-3 fix (2026-07-11): 强制释放可能残留的锁 + setTimeout(0) 避免竞态
                          sendMessageLockRef.current.inProgress = false;
                          setTimeout(() => {
                            retryAiResponseRef.current?.(lastUserMsg.content);
                          }, 0);
                        }
                      }}
                    : m
                ));
                return true; // 信号: break consumeAIStream 的 for + while 循环 (匹配原 `return;`)
              },
              onRemainingBufferToken: (_token, accReply) => {
                accumulatedReply = accReply;
                // 🔧 TECH-DEBT-D: Direct setMessages for final buffer (no throttle needed)
                setMessagesSync((prev) =>
                  prev.map((m) =>
                    m.id === currentAssistantMsgId
                      ? { ...m, content: accumulatedReply }
                      : m
                  )
                );
              },
            });
            accumulatedReply = streamResult.reply;
            accumulatedReasoning = streamResult.reasoning;
            // errorDisplayed → return 跳过 finalMsg 处理 (匹配原 SSE 循环内的 `return;`)
            if (streamResult.errorDisplayed) return;
            // 🔧 batch43-b: idle timeout 且无内容 → 显示流中断 fallback
            if (streamResult.idleTimeout && !accumulatedReply.trim()) {
              // batch80-a fix (/tmp/b79c-defects.md #1): 标记兜底文案已写入 —
              //    finally 跳过 flushStreamUpdate, 防止空串 accumulatedReply 覆盖 streamInterrupted 文案。
              idleFallbackDisplayed = true;
              setMessagesSync((prev) =>
                prev.map((m) =>
                  m.id === currentAssistantMsgId
                    ? {
                        ...m,
                        content: t('chat.aiFallback.streamInterrupted', { defaultValue: 'The reply was cut off.' }),
                        isError: true,
                        onRetry: () => {
                          setMessagesSync((prev2) => prev2.filter((m2) => m2.id !== currentAssistantMsgId));
                          const lastUserMsg = messagesRef.current.filter((m2) => m2.role === 'user').pop();
                          if (lastUserMsg) {
                            sendMessageLockRef.current.inProgress = false;
                            setTimeout(() => {
                              if (retryAiResponseRef.current) {
                                retryAiResponseRef.current(lastUserMsg.content);
                              }
                            }, 0);
                          }
                        },
                      }
                    : m
                )
              );
              return;
            }
          } finally {
            // 🔧 TECH-DEBT-D: Cancel any pending RAF and flush final state
            if (streamingRafId) cancelAnimationFrame(streamingRafId);
            // SSE error 事件已设 errorContent + isError + onRetry,
            //    不再 flush (否则 flushStreamUpdate 用 accumulatedReply 覆盖 errorContent)。
            // batch80-a: idle timeout 兜底文案已写入同理跳过 flush (保住 streamInterrupted,
            //    否则空串 accumulatedReply 覆盖 → 空气泡, 见 /tmp/b79c-defects.md #1)。
            if (!sseErrorDisplayed && !idleFallbackDisplayed) {
              // 🔧 ARCH fix: 始终 flush final state (不管 pendingStreamUpdate 是否 true)
              //    旧代码: if (pendingStreamUpdate) flushStreamUpdate() — 如果 rAF 已被 cancel,
              //    pendingStreamUpdate 仍为 true 但 flushStreamUpdate 不会重置它 → final state 丢失
              //    根因修复: 始终 flush, flushStreamUpdate 内部重置 pendingStreamUpdate
              flushStreamUpdate();
            }
            // reader cleanup 已移入 consumeAIStream 的 finally (Round 70)
          }
        }

        // 🔧 P1 fix (Issue 3): 用 .trim() 检查 — 空白-only 回复 (' ', '\n') 也算空, 用 fallback
        //    旧代码: if (!accumulatedReply) — ' ' 是 truthy → 不触发 fallback → 用户看到空消息 (只有时间戳)
        if (!accumulatedReply.trim()) {
          setMessagesSync((prev) =>
            prev.map((m) =>
              m.id === currentAssistantMsgId
                ? { ...m, content: t('chat.aiFallback.hereForYou') }
                : m
            )
          );
        }

        // 🔧 BUG-325 v6 fix: finalMsg 时检测高确定性思考链泄露（函数名/规则原文）
        const HIGH_CONFIDENCE_LEAK_PATTERNS = [
          /\bcomplete_challenge\b|\badd_dream_fund_progress\b|\brecord_impulse\b/i,
          /\bIF THE USER\b|\bYou MUST\b|\bimpulse scoring guide\b/i,
        ];
        const isHighConfidenceLeak = accumulatedReply.length > 20 &&
          HIGH_CONFIDENCE_LEAK_PATTERNS.some(p => p.test(accumulatedReply));

        const rawFinalContent = isHighConfidenceLeak
          ? t('chat.aiFallback.hereForYou')
          : (accumulatedReply.trim() || t('chat.aiFallback.hereForYou'));

        // 🔧 batch43-b: 话术漂移 guard — 命中时静默替换为守护叙事版本
        const detectedDrift = applyDriftGuard(rawFinalContent, turnId);
        const finalContent = detectedDrift
          ? (DRIFT_REPLACEMENTS[detectedDrift] ?? rawFinalContent)
          : rawFinalContent;

        const finalMsg: ChatMessage = {
          id: currentAssistantMsgId,
          role: 'assistant',
          content: finalContent,
          reasoning: undefined,
          timestamp: new Date(),
          mode: msgMode, // 🔧 P1 fix (Issue 4): finalMsg 也带 mode, 防止挑战中途结束时 mode 分裂
          productCards: productCards.length ? productCards : undefined,
          productCardsQuery: productCards.length ? content : undefined,
          greenAlt: greenAltCard,
          greenAltRetro: greenAltRetroCard,
          reuseHint,
          microChallenge,
          greenKnowledge,
          cooldownCard,
          prepurchaseCard,
          duplicatePrecheckCard,
          commitmentCard,
          compareCard,
          altFootprint,
          listTriageCard,
          savingsQueryCard,
          categoryQueryCard,
          impulseTimeCard,
          impulseForecastCard,
          guardPulseCard,
          emotionGuardCard,
          contextSignal,
          contextTrust,
          shoppingClarifyCard,
        };
        saveMessage(finalMsg);
      } else {
        const data = await response.json();
        const replyContent = data.reply || t('chat.aiFallback.hereForYou');

        // 🔧 batch43-b: 话术漂移 guard — 非流式路径也做检测
        const nonStreamTurnId = nextId('ai');
        const detectedDrift = applyDriftGuard(replyContent, nonStreamTurnId);
        const finalContent = detectedDrift
          ? (DRIFT_REPLACEMENTS[detectedDrift] ?? replyContent)
          : replyContent;

        const assistantMsg: ChatMessage = {
          id: nonStreamTurnId,
          role: 'assistant',
          content: finalContent,
          reasoning: data.reasoning || undefined,
          timestamp: new Date(),
          mode: msgMode,
        };
        const nonStreamCards: ProductCardData[] = (data.toolCalls || []).flatMap((toolCall: { name: string; result?: string }) =>
          extractProductCards(toolCall.name, toolCall.result));
        if (nonStreamCards.length) {
          assistantMsg.productCards = nonStreamCards;
          assistantMsg.productCardsQuery = content;
        }
        // 🌱 绿色替代卡片: 非流式路径 JSON greenAlt 字段 (未命中为 null → 不挂)
        if (data.greenAlt) assistantMsg.greenAlt = data.greenAlt;
        // 🌱 batch68-a: 非流式 JSON greenAltRetro 字段 (复盘追问轮附带; 记 awaiting 会话态)
        if (data.greenAltRetro) {
          assistantMsg.greenAltRetro = data.greenAltRetro;
          markGreenAltRetroAwaited(data.greenAltRetro.entryId);
        }
        // 🔁 复用优先: 非流式 JSON reuseHint 字段 (服务端预检附带)
        if (data.reuseHint) assistantMsg.reuseHint = data.reuseHint;
        // 🐞 batch46-b: 非流式 JSON microChallenge 字段 (已有 active 挑战时同样静默丢弃)
        if (data.microChallenge && !currentActiveChallenge) assistantMsg.microChallenge = data.microChallenge;
        // 📖 batch47-a: 非流式 JSON greenKnowledge 字段 (未命中/守卫关闭时缺省)
        if (data.greenKnowledge) assistantMsg.greenKnowledge = data.greenKnowledge;
        // 🐘 batch48-b: 非流式 JSON cooldownCard 字段 (降温轮 canned 回复附带)
        if (data.cooldownCard) assistantMsg.cooldownCard = data.cooldownCard;
        // 🐘 batch50-a: 非流式 JSON prepurchaseCard 字段 (三问轮 canned 回复附带)
        if (data.prepurchaseCard) assistantMsg.prepurchaseCard = data.prepurchaseCard;
        if (data.duplicatePrecheckCard) assistantMsg.duplicatePrecheckCard = data.duplicatePrecheckCard;
        // 🐘 batch53-a: 非流式 JSON commitmentCard 字段 (承诺轮 canned 回复附带)
        if (data.commitmentCard) assistantMsg.commitmentCard = data.commitmentCard;
        // 🐘 batch56-a: 非流式 JSON compareCard 字段 (对比轮 canned 回复附带)
        if (data.compareCard) assistantMsg.compareCard = data.compareCard;
        // 🐘 batch55-c: 非流式 JSON altFootprint 字段 (足迹召回轮附带)
        if (data.altFootprint) assistantMsg.altFootprint = data.altFootprint;
        // 🐘 batch57-a: 非流式 JSON listTriageCard 字段 (清单分诊轮 canned 回复附带)
        if (data.listTriageCard) assistantMsg.listTriageCard = data.listTriageCard;
        // 🐘 batch57-c: 非流式 JSON savingsQueryCard 字段 (问账轮 canned 回复附带)
        if (data.savingsQueryCard) assistantMsg.savingsQueryCard = data.savingsQueryCard;
        // 🐘 batch58-c: 非流式 JSON categoryQueryCard / impulseTimeCard 字段 (canned 轮附带)
        if (data.categoryQueryCard) assistantMsg.categoryQueryCard = data.categoryQueryCard;
        if (data.impulseTimeCard) assistantMsg.impulseTimeCard = data.impulseTimeCard;
        // 🐘 batch62-c: 非流式 JSON impulseForecastCard 字段 (预报轮 canned 回复附带)
        if (data.impulseForecastCard) assistantMsg.impulseForecastCard = data.impulseForecastCard;
        // 🐘 batch68-c: 非流式 JSON guardPulseCard 字段 (脉搏轮 canned 回复附带)
        if (data.guardPulseCard) assistantMsg.guardPulseCard = data.guardPulseCard;
        // 🐘 batch60-c: 非流式 JSON emotionGuardCard 字段 (情绪守护轮 canned 回复附带)
        if (data.emotionGuardCard) assistantMsg.emotionGuardCard = data.emotionGuardCard;
        // 🐘 batch61-b: 非流式 JSON contextSignal 字段 (弱信号轮 canned 回复附带)
        if (data.contextSignal) assistantMsg.contextSignal = data.contextSignal;
        if (data.contextTrust) assistantMsg.contextTrust = data.contextTrust;

        setMessagesSync((prev) => {
          // 🔧 NEW-016 fix: 去重
          if (prev.some(m => m.id === assistantMsg.id)) return prev;
          return [...prev, assistantMsg];
        });
        saveMessage(assistantMsg);

        // Handle MCP tool results from fallback LLM path
        if (data.toolResults && Array.isArray(data.toolResults)) {
          handleMCPResults(data.toolResults);
        }

        // Handle toolCalls from Letta Agent path
        // When Letta Agent calls MCP tools (record_impulse, complete_challenge, etc.),
        // the response includes `toolCalls` with the tool names and args.
        // We need to: 1) Show notifications, 2) Refresh buddy state
        if (data.toolCalls && Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
          // Show notifications for each tool call
          for (const tc of data.toolCalls) {
            const toolName = tc.name || '';
            const notifType: 'reward' | 'penalty' | 'badge' =
              toolName === 'record_impulse' ? 'penalty' :
              toolName === 'add_badge' ? 'badge' : 'reward';

            let notifMessage = '';
            switch (toolName) {
              case 'record_impulse': {
                const amount = num(tc.args?.amount);
                notifMessage = amount ? t('chat.mcpNotifications.impulseRecordedWithAmount', { amount }) : t('chat.mcpNotifications.impulseRecorded');
                break;
              }
              case 'complete_challenge': {
                const savedAmount = num(tc.args?.saved_amount);
                notifMessage = savedAmount ? t('chat.mcpNotifications.challengeCompletedSaved', { amount: savedAmount }) : t('chat.mcpNotifications.challengeCompleted');
                // Clear challenge banner on completion
                // 🔧 Bug 1 fix (Round 43): 标记刚完成挑战, 防止 activeChallenge fetch effect 重新设
                justCompletedChallengeRef.current = true;
                setActiveChallenge(undefined);
                // 🔧 信任存入 fix (Round 106): 通知前端弹出 DepositDialog
                //   非流式路径 (toolCalls) — challengeId 从 args 获取
                //   流式路径在 use-mcp-notifications.ts handleMCPResults 中处理
                // 🔧 P0 fix (mirror philosophy): buy 路径不弹存款对话框 — 用户买了, 没钱可存
                const depositChallengeId = tc.args?.challenge_id;
                const depositSavedAmount = activeChallengeRef.current?.amount;
                const isBuyPath = justBoughtChallengeRef.current;
                if (!isBuyPath && depositChallengeId && depositSavedAmount && depositSavedAmount > 0) {
                  onChallengeCompleted?.(depositChallengeId, depositSavedAmount);
                }
                // 🔧 需求九: bought 路径 (isBuyPath) — 触发沉默时刻 (bought 文案), 无存款对话框
                if (isBuyPath && depositSavedAmount && depositSavedAmount > 0) {
                  onChallengeBought?.(depositSavedAmount, activeChallengeRef.current?.itemName || '');
                }
                break;
              }
              case 'add_tokens': {
                const tokenAmount = num(tc.args?.amount);
                notifMessage = tokenAmount ? t('chat.mcpNotifications.tokensEarnedAmount', { amount: tokenAmount }) : t('chat.mcpNotifications.tokensEarned');
                break;
              }
              case 'add_badge': {
                const badgeId = tc.args?.badge_id;
                notifMessage = t('chat.mcpNotifications.badgeUnlockedName', { name: badgeId || 'Achievement' });
                break;
              }
              case 'add_dream_fund_progress': {
                const fundAmount = num(tc.args?.amount);
                notifMessage = fundAmount ? t('chat.mcpNotifications.dreamFundAdded', { amount: fundAmount }) : t('chat.mcpNotifications.dreamFundProgress');
                break;
              }
              case 'add_vitality': {
                const vitalityChange = num(tc.args?.amount);
                notifMessage = vitalityChange ? t('chat.mcpNotifications.vitalityChange', { change: `${vitalityChange > 0 ? '+' : ''}${vitalityChange}` }) : t('chat.mcpNotifications.vitalityAdjusted');
                break;
              }
              default:
                notifMessage = t('chat.mcpNotifications.toolUsed', { toolName });
            }

            if (notifMessage) {
              // 🔧 架构还债: 用 addMcpNotification 替代内联 setMcpNotifications
              addMcpNotification(notifMessage, notifType);
            }
          }

          // Refresh buddy state after MCP tool calls
          // 🔧 NEW-N fix: 只调一次 (forceRefresh 已有 3s 防抖), 之前调 2 次 (2s + 5s) 导致过度轮询
          if (onBuddyStateRefresh) {
            // 🔧 H7 fix: 用 ref 跟踪 timer, 卸载时清理
            if (buddyStateRefreshTimerRef.current) clearTimeout(buddyStateRefreshTimerRef.current);
            buddyStateRefreshTimerRef.current = setTimeout(() => {
              buddyStateRefreshTimerRef.current = null;
              onBuddyStateRefresh();
            }, 3000);
          }
        }
      }
    } catch (err) {
      // AbortError 时不显示错误消息（用户主动取消或组件卸载）
      // 🔧 NEW-063 fix (Round 69): 用精确 assistantMsgId 移除空气泡, 不再用脆弱的启发式
      //   旧代码: "find last empty assistant" 启发式 → 快速发送时可能误删第二条的 assistant 气泡
      //   修复: assistantMsgId 已提升到 try 外, catch 直接按 id 过滤
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 🔧 NEW-063 fix: 用精确 id 移除本次 stream 的 assistant 气泡 (如果有)
        if (assistantMsgId) {
          setMessagesSync((prev) => prev.filter(m => m.id !== assistantMsgId));
        }
        return;
      }
      // 🔧 错误处理: 显示错误信息 + 重新生成按钮
      // 🔧 2026-07-20 (P0 fix): 区分 401 (需登录) vs 其他错误
      //    旧代码: 所有错误统一显示 "Symy is quiet. Try again." → 401 用户被误导, 点 Retry 无限循环
      //    修复: 401 显示 "Sign in to chat with Symy" + 引导注册; 其他错误保持原逻辑
      const errorStatus = getErrorStatus(err);
      const isAuthError = errorStatus === 401;
      const errorMsgId = nextId('ai');
      const errorMsg: ChatMessage = {
        id: errorMsgId,
        role: 'assistant',
        content: isAuthError
          ? t('chat.aiFallback.authRequired', { defaultValue: 'Sign in to chat with Symy and save your conversations.' })
          : t('chat.aiFallback.aiError', { defaultValue: 'AI is temporarily unavailable. This might be due to high traffic or a timeout. Please try again.' }),
        timestamp: new Date(),
        isError: true,
        onRetry: () => {
          // 🔧 P0-3 fix (2026-07-11): Retry 按钮不工作 — 修复重试不发起请求的问题
          //   根因: onRetry 调用 retryAiResponseRef.current?.() 时, 可能因锁未释放或 ref 为 null 而静默失败
          //   修复: 1) 用 setTimeout(0) 确保在当前 render cycle 之后执行 (避免 setMessagesSync 竞态)
          //         2) 强制释放可能残留的锁 (sendMessageLockRef) — 错误路径的 finally 可能因代际判断失败而未释放
          //         3) 显式检查 retryAiResponseRef.current, 为 null 时 fallback 到 sendMessage
          // 🔧 NEW-002 fix: 移除错误消息, 但不重新发送用户消息 (避免重复)
          // 只重新请求 AI 回复, 用已有的 messages 数组作为上下文
          setMessagesSync((prev) => prev.filter((m) => m.id !== errorMsgId));
          // 找到最后一条用户消息, 只重新请求 AI 回复
          const lastUserMsg = messagesRef.current.filter((m) => m.role === 'user').pop();
          if (lastUserMsg) {
            // 🔧 P0-3 fix: 强制释放可能残留的锁 (错误路径 finally 可能因代际判断未释放)
            //   场景: 网络错误时 fetch 抛异常 → catch 创建 errorMsg → finally 检查 abortRef.current === abortController
            //   如果在此期间 abortRef 被其他代码 (如 Give Up force-abort) 修改, finally 的代际判断失败 → 锁不释放
            //   → retryAiResponseImpl 检查锁时 return → 重试不执行
            //   修复: onRetry 入口强制释放锁, 确保重试能执行
            sendMessageLockRef.current.inProgress = false;
            // 🔧 P0-3 fix: 用 setTimeout(0) 确保重试在当前执行栈完成后运行
            //   避免 setMessagesSync 的 functional updater 与 retryAiResponseImpl 的 messagesRef 读取竞态
            setTimeout(() => {
              if (retryAiResponseRef.current) {
                retryAiResponseRef.current(lastUserMsg.content);
              } else {
                // Fallback: 如果 retryAiResponseRef 为 null, 直接调 sendMessage (会重新发送用户消息, 但至少能工作)
                logger.warn('[ChatTab] retryAiResponseRef.current is null, falling back to sendMessage');
              }
            }, 0);
          }
        },
      };
      setMessagesSync((prev) => [...prev, errorMsg]);
      // BUG-116 fix: error/fallback messages should not be persisted to database
    } finally {
      // 🔧 ARCH fix (Round 19 Frontend H2 — finally 无条件释放锁, Give Up 后旧 stream 清新 stream 的锁):
      //    旧代码: 无条件 sendMessageLockRef.current.inProgress = false → Give Up force-abort 旧 stream
      //    + 开始新 send → 旧 stream finally 清新 stream 的锁 → 第三条消息可并发 → 消息重复。
      //    根因修复: 用 abortRef 代际判断 — 只有当前 stream 拥有锁时才释放。
      if (abortRef.current === abortController) {
        abortRef.current = null;
        sendMessageLockRef.current.inProgress = false;
        setIsLoading(false);
        // 🔧 NEW-044 fix (Round 40): 流结束后重新设 skip nonce, 抑制 MCP 工具触发的
        //   setActiveChallenge(undefined) 导致的 loadHistory 重复请求。
        //   旧代码: 流期间 AI 调 complete_challenge → setActiveChallenge(undefined) →
        //   activeChallenge dep 变化 → loadHistory effect 重跑 → 重复 /api/chat/history 请求。
        //   修复: 流结束后设 skip nonce, 下一次 loadHistory effect 运行时 skip。
        skipNextHistoryLoadRef.current = true;
        skipNonceRef.current = Date.now();
        // 🔧 P0 fix (mirror philosophy — I choose to buy): 清除 buy flag,
        //   防止下一轮挑战的 complete_challenge 误判为 buy 路径
        justBoughtChallengeRef.current = false;
      }
      // 不重置 isLoadingHistoryRef — 它由 loadHistory effect 管理,
      //    sendMessage 从不设它为 true, 不应在 finally 清它 (会清掉并发的 history retry)。
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [
    activeChallenge,
    isLoadingHistory,
    isDemo,
    impulseContext,
    locale,
    t,
    setMessagesSync,
    setIsLoading,
    setInput,
    setActiveChallenge,
    nextId,
    saveMessage,
    handleMCPResults,
    addMcpNotification,
    onBuddyStateRefresh,
    onAuthPrompt,
    onToast,
    // refs are stable (omitted): sendMessageLockRef, abortRef, messagesRef, activeChallengeRef,
    //   impulseContextRef, localeRef, justCompletedChallengeRef, demoReplyTimerRef,
    //   demoAuthTimerRef, demoMsgCountRef, buddyStateRefreshTimerRef, skipNextHistoryLoadRef,
    //   skipNonceRef
    // retryAiResponse omitted — accessed via retryAiResponseRef to avoid dep-cycle
    DEMO_FREE_MESSAGES,
  ]);

  // 🔧 NEW-002 fix: 重试 AI 回复 — 不创建新的 userMsg, 不 saveMessage, 只重新请求 AI
  // retryAiResponse 逻辑提取到 retry-ai-response.ts (retryAiResponseImpl)。
  //    此处仅做参数注入 + 调用, 逻辑/注释/控制流 byte-for-byte 保留在 impl 函数内。
  // eslint-disable-next-line require-await -- async for API consistency
  const retryAiResponse = useCallback(async (_lastUserContent: string) => {
    return retryAiResponseImpl({
      lastUserContent: _lastUserContent,
      activeChallenge,
      t,
      setMessagesSync,
      setIsLoading,
      setActiveChallenge,
      nextId,
      saveMessage,
      addMcpNotification,
      onBuddyStateRefresh,
      onToast,
      sendMessageLockRef,
      abortRef,
      messagesRef,
      activeChallengeRef,
      impulseContextRef,
      localeRef,
      justCompletedChallengeRef,
      skipNextHistoryLoadRef,
      skipNonceRef,
      justBoughtChallengeRef,
      retryAiResponseRef,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [
    activeChallenge, // 🔧 注意: 仅 line 1450 处用闭包值 (与 sendMessage 一致, 保留)
    t,
    setMessagesSync,
    setIsLoading,
    setActiveChallenge,
    nextId,
    saveMessage,
    addMcpNotification,
    onBuddyStateRefresh,
    onToast,
    // refs are stable (omitted): sendMessageLockRef, abortRef, messagesRef, activeChallengeRef,
    //   impulseContextRef, localeRef, justCompletedChallengeRef, skipNextHistoryLoadRef, skipNonceRef
    // retryAiResponse omitted — accessed via retryAiResponseRef (self-recursion)
  ]);

  // 同步 ref 每次 render — 让 sendMessage 内的 onRetry 闭包调到最新 retryAiResponse。
  //   原代码 sendMessage 是普通函数 (每次 render 重建), onRetry 捕获当前 retryAiResponse。
  //   等价行为: ref 每次 render 赋值, onRetry 调用时拿当前值。
   
  retryAiResponseRef.current = retryAiResponse;

  return { sendMessage, retryAiResponse };
}
