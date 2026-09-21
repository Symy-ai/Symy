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

"use client";

import { useCallback, useRef } from "react";
import { ChatMessage } from "@/components/chat-bubble";
import { logger } from "@/lib/logger";
import { symyEvents } from "@/lib/posthog";
import { handleDemoSendMessage } from "./demo-send-message";
import { requestSendMessage } from "./parts/send-message-request";
import { consumeSendMessageStream } from "./parts/send-message-stream";
import { processSendMessageNonStream } from "./parts/send-message-non-stream";
import { handleSendMessageError } from "./parts/send-message-error";
import { finalizeSendMessage } from "./parts/send-message-finalize";
// retryAiResponse 提取为独立 impl 函数
import { retryAiResponseImpl } from "./retry-ai-response";
// 🔧 ARCH fix (2026-07-22): Types extracted to separate file
import type { UseChatActionsParams } from "./use-chat-actions-types";
export type {
  ImpulseContext,
  SendMessageLockState,
  UseChatActionsParams,
} from "./use-chat-actions-types";

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
  const { activeChallenge, isLoadingHistory, isDemo, impulseContext, locale } =
    state;

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

  const { setMessagesSync, setIsLoading, setInput, setActiveChallenge } =
    setters;

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
  const retryAiResponseRef = useRef<
    ((content: string) => Promise<void>) | null
  >(null);

  // ======== 发送消息 ========
  // displayContent: UI 上显示的简洁消息（如 "I want to buy Nike Air Max for $129.99. Challenge me!"）
  // apiContent: 发给 API 的完整提示词（如包含 CHALLENGE MODE 指令的长文本），不传则等于 displayContent
  // overrideChallengeContext: BUG-4 FIX — 显式传入 challenge 上下文，不依赖组件 state
  //   解决：Give Up 按钮先清 banner 再发消息，导致 sendMessage 读到 undefined 的问题
  // isBuyPath: 🔧 P0 fix (mirror philosophy — I choose to buy): true 表示此调用来自 handleChooseToBuy,
  //   sendMessage 会设 justBoughtChallengeRef.current=true, 让 handleToolEvent 知道接下来 AI 调
  //   complete_challenge(status='failed') 是 buy 路径, 应跳过存款对话框 + passed toast。
  //   finally 块清除 ref。设此参数后, handleChooseToBuy 不再手动设 ref (避免 force-abort race)。
  const sendMessage = useCallback(
    async (
      content: string,
      apiContent?: string,
      overrideChallengeContext?: {
        itemName: string;
        amount: number;
        challengeId?: string;
      },
      isBuyPath?: boolean,
      actionType?: "saw_it" | "chose_to_buy" | "challenge_created",
    ) => {
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
      const msgMode: "challenge" | "normal" = inChallenge
        ? "challenge"
        : "normal";
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
      if (
        !overrideChallengeContext &&
        trimmedContent === sendMessageLockRef.current.lastContent &&
        now - sendMessageLockRef.current.lastTime < DEDUP_WINDOW_MS
      ) {
        logger.info(
          "[ChatTab] sendMessage dedup: same content within 1s, skipping",
        );
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
      if (
        sendMessageLockRef.current.inProgress ||
        (isLoadingHistory && !overrideChallengeContext)
      )
        return;
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
        const isFirstChallenge =
          demoMsgCountRef.current === 0 &&
          (overrideChallengeContext || activeChallengeRef.current);
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
        id: nextId(actionType ? "action" : "user"),
        role: actionType ? "action" : "user",
        content: displayContent,
        timestamp: new Date(),
        mode: msgMode,
        ...(actionType ? { actionType } : {}),
      };

      setMessagesSync((prev) => {
        // 🔧 NEW-016 fix: 去重 — 如果 userMsg 已存在, 不再追加
        if (prev.some((m) => m.id === userMsg.id)) return prev;
        return [...prev, userMsg];
      });
      setInput("");
      setIsLoading(true);

      saveMessage(userMsg);

      symyEvents.chatMessageSent({ mode: isDemo ? "demo" : "real" });

      // 防止 loadHistory 覆盖刚发的用户消息
      // 🔧 NEW-025 fix: 也设 nonce, 防止 sendMessage 后 loadHistory 被不必要触发
      skipNextHistoryLoadRef.current = true;
      skipNonceRef.current = Date.now();

      let assistantMsgId: string | null = null;

      try {
        const requestResult = await requestSendMessage({
          displayContent,
          fullApiContent,
          userMsg,
          messages: messagesRef.current,
          activeChallenge: activeChallengeRef.current,
          activeChallengeState: activeChallenge,
          overrideChallengeContext,
          impulseContext,
          isDemo,
          locale,
          signal: abortController.signal,
        });
        const { response, currentActiveChallenge } = requestResult;
        const contentType = response.headers.get("Content-Type") || "";

        if (contentType.includes("text/event-stream")) {
          assistantMsgId = await consumeSendMessageStream({
            response,
            content,
            msgMode,
            activeChallenge,
            currentActiveChallenge,
            locale,
            t,
            nextId,
            onAssistantMsgId: (id) => {
              assistantMsgId = id;
            },
            saveMessage,
            setMessagesSync,
            messagesRef,
            sendMessageLockRef,
            retryAiResponseRef,
            justCompletedChallengeRef,
            justBoughtChallengeRef,
            setActiveChallenge,
            onBuddyStateRefresh,
            onToast,
            addMcpNotification,
            onChallengeCompleted,
            onChallengeBought,
          });
          if (!assistantMsgId) return;
        } else {
          assistantMsgId = await processSendMessageNonStream({
            response,
            content,
            msgMode,
            currentActiveChallenge,
            t,
            nextId,
            saveMessage,
            setMessagesSync,
            handleMCPResults,
            addMcpNotification,
            activeChallengeRef,
            buddyStateRefreshTimerRef,
            justCompletedChallengeRef,
            justBoughtChallengeRef,
            setActiveChallenge,
            onBuddyStateRefresh,
            onChallengeCompleted,
            onChallengeBought,
          });
        }
      } catch (err) {
        handleSendMessageError({
          err,
          assistantMsgId,
          t,
          nextId,
          setMessagesSync,
          messagesRef,
          sendMessageLockRef,
          retryAiResponseRef,
        });
      } finally {
        finalizeSendMessage({
          abortRef,
          sendMessageLockRef,
          setIsLoading,
          skipNextHistoryLoadRef,
          skipNonceRef,
          justBoughtChallengeRef,
          abortController,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
    [
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
    ],
  );

  // 🔧 NEW-002 fix: 重试 AI 回复 — 不创建新的 userMsg, 不 saveMessage, 只重新请求 AI
  // retryAiResponse 逻辑提取到 retry-ai-response.ts (retryAiResponseImpl)。
  //    此处仅做参数注入 + 调用, 逻辑/注释/控制流 byte-for-byte 保留在 impl 函数内。
  const retryAiResponse = useCallback(
    // eslint-disable-next-line require-await -- async for API consistency
    async (_lastUserContent: string) => {
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
    [
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
    ],
  );

  // 同步 ref 每次 render — 让 sendMessage 内的 onRetry 闭包调到最新 retryAiResponse。
  //   原代码 sendMessage 是普通函数 (每次 render 重建), onRetry 捕获当前 retryAiResponse。
  //   等价行为: ref 每次 render 赋值, onRetry 调用时拿当前值。

  retryAiResponseRef.current = retryAiResponse;

  return { sendMessage, retryAiResponse };
}
