/**
 * retryAiResponseImpl — 重试 AI 回复 (不创建新 userMsg, 不 saveMessage, 只重新请求 AI)
 *
 * 🔧 ARCH fix (Round 70 — use-chat-actions.ts split):
 *    从 use-chat-actions.ts 提取 retryAiResponse (~180 行) 为独立 impl 函数。
 *    use-chat-actions.ts 通过 useCallback 包装, deps 与原版一致。
 *
 * 行为零变化: 纯函数提取, 逻辑/注释/控制流 byte-for-byte 保留。
 * 唯一变化: 闭包变量改为 params 解构; retryAiResponseRef 通过 params 注入
 * (避免 self-recursion 进入 useCallback deps → 重建循环)。
 *
 * 关键不变量:
 *   - retryMode 从最后一条用户消息推断 (而非 activeChallenge), 防止挑战中途退出后 mode 分裂。
 *   - SSE 流消费通过 consumeAIStream (Round 70 抽取), 无 throttling (与 sendMessage 不同)。
 *   - error 事件: setMessagesSync(errorContent, isError, onRetry) + return true → break consumeAIStream。
 *   - AbortError: 静默 return (用户主动取消或组件卸载)。
 *   - finally: 用 abortRef 代际判断 (abortController === abortRef.current) 避免新调用被旧 finally 清理。
 */

import { ChatMessage } from '@/components/chat-bubble';
import { ApiError } from '@/lib/errors/api-error';
// 🌱 绿色守护开关 (localStorage 零 DDL): 重试请求同样透传 → /api/chat → symy_green_pref
import { getGreenPrefEnabled } from '@/hooks/use-green-pref';
import { getGuardIntensity } from '@/hooks/use-guard-intensity';
import { getGuardScope } from '@/hooks/use-guard-scope';
import type { useI18n } from '@/i18n/provider';
import type { ActiveChallenge } from './use-challenge-actions';
// 🔧 ARCH fix (Round 8): Use canonical ImpulseContext type
import type { ImpulseContext } from '@/types/impulse-context';
import { consumeAIStream, handleToolEvent } from './consume-ai-stream';
import {
  createStreamErrorRetry,
  markStreamErrorBubble,
} from './parts/stream-error-retry';
import { isAbortError, normalizeChatApiError } from './chat-api-error';

/** sendMessageLockRef 内部结构 (与 use-chat-actions.ts 结构兼容, 本地定义避免 circular dep) */
interface SendMessageLockState {
  inProgress: boolean;
  lastContent: string;
  lastTime: number;
}

/** retryAiResponse 的依赖参数 — 由 use-chat-actions.ts 通过闭包注入 */
export interface RetryAiResponseParams {
  /** 函数参数: 最后一条用户消息内容 (用于 catch 块的 onRetry 闭包) */
  lastUserContent: string;
  /** 渲染期 state: activeChallenge — handleToolEvent 用其 amount 显示 toast */
  activeChallenge: ActiveChallenge | undefined;
  /** i18n t 函数 */
  t: ReturnType<typeof useI18n>['t'];
  /** state setters */
  setMessagesSync: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setIsLoading: (value: boolean) => void;
  setActiveChallenge: (challenge: ActiveChallenge | undefined) => void;
  /** 外部回调 */
  nextId: (prefix: string) => string;
  saveMessage: (msg: ChatMessage) => void;
  addMcpNotification: (message: string, type: 'reward' | 'penalty' | 'badge') => void;
  onBuddyStateRefresh?: () => void;
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** 同步 refs (stable) */
  sendMessageLockRef: React.MutableRefObject<SendMessageLockState>;
  abortRef: React.MutableRefObject<AbortController | null>;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  activeChallengeRef: React.MutableRefObject<ActiveChallenge | undefined>;
  impulseContextRef: React.MutableRefObject<ImpulseContext | undefined>;
  localeRef: React.MutableRefObject<string>;
  justCompletedChallengeRef: React.MutableRefObject<boolean>;
  skipNextHistoryLoadRef: React.MutableRefObject<boolean>;
  skipNonceRef: React.MutableRefObject<number>;
  /** 🔧 P0 fix (mirror philosophy): buy 路径标志, 同 sendMessage */
  justBoughtChallengeRef: React.MutableRefObject<boolean>;
  /** retryAiResponse 自引用 ref — onRetry 闭包通过此 ref 调到最新 retryAiResponse (避免 dep-cycle) */
  retryAiResponseRef: React.MutableRefObject<((content: string) => Promise<void>) | null>;
}

/**
 * retryAiResponseImpl — 重试 AI 回复的纯函数实现。
 *
 * 调用方 (use-chat-actions.ts) 通过 useCallback 包装:
 *   const retryAiResponse = useCallback(
 *     (lastUserContent: string) => retryAiResponseImpl({ lastUserContent, ...deps }),
 *     [activeChallenge, t, setMessagesSync, setIsLoading, setActiveChallenge, nextId,
 *      saveMessage, addMcpNotification, onBuddyStateRefresh, onToast]
 *   );
 * refs + retryAiResponseRef 不进 deps (stable / self-ref)。
 */
export async function retryAiResponseImpl({
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
}: RetryAiResponseParams): Promise<void> {
  // 🔧 BUG-018 fix: 模块级互斥锁 (retryAiResponse 也要检查)
  if (sendMessageLockRef.current.inProgress) return;
  sendMessageLockRef.current.inProgress = true;
  setIsLoading(true);

  // 🔧 FIX: 从最后一条用户消息推断 mode, 而非用当前 activeChallenge
  // 之前: mode: activeChallenge ? 'challenge' : 'normal'
  //   问题: 如果用户在挑战模式发消息 → AI 失败 → 用户退出挑战 → 点 retry
  //   → activeChallenge=undefined → mode='normal' → 保存为 normal
  //   → loadHistory 按 mode='challenge' 过滤时丢失这条消息!
  // 现在: 找最后一条用户消息的 mode, 保持一致
  const lastUserMsg = messagesRef.current.filter(m => m.role === 'user').pop();
  // 🔧 Round 19 Frontend-H2: 读 activeChallengeRef.current (实时值) 而非闭包的 activeChallenge
  const currentActiveChallenge = activeChallengeRef.current;
  const retryMode = lastUserMsg?.mode || (currentActiveChallenge ? 'challenge' : 'normal');

  const assistantMsgId = nextId('ai');
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    reasoning: undefined,
    timestamp: new Date(),
    mode: retryMode,
  };
  setMessagesSync((prev) => [...prev, assistantMsg]);

  // 🔧 ARCH fix (Give Up race): 在 try 外声明 abortController, finally 可访问。
  let abortController: AbortController | null = null;
  try {
    const apiMessages = messagesRef.current
      .filter((m) => m.id !== assistantMsgId && !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    // 🔧 H2 fix: 创建 AbortController, 传 signal 给 fetch (之前遗漏)
    if (abortRef.current && !abortRef.current.signal.aborted) abortRef.current.abort();
    abortController = new AbortController();
    abortRef.current = abortController;
    

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        impulseContext: impulseContextRef.current || null,  // 🔧 Round 37 H2: 用 ref 读最新值
        challengeContext: retryMode === 'challenge' ? (currentActiveChallenge || null) : null,
        stream: true,
        locale: localeRef.current,  // 🔧 Round 37 H2: 用 ref 读最新值
        greenPref: getGreenPrefEnabled() ? 'on' : 'off',  // 🌱 绿色守护开关, 与 sendMessage 一致
        guardIntensity: getGuardIntensity(),  // 🛡️ batch48-a: 守护强度三档, 与 sendMessage 一致
        guardScope: getGuardScope(),  // 🗺️ batch53-b: 守护范围三态, 与 sendMessage 一致
      }),
      signal: abortController.signal, // 🔧 H2 fix: 传 signal, 允许取消重试
      credentials: 'include', // 🔧 BUG-1 fix: 确保 cookie 发送 (与 apiFetch 对齐)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      // 🔧 2026-07-20 (P0 fix): 保留 status, 让 catch 块能区分 401 (需登录) vs 500 (真错误)
      //    与 use-chat-actions.ts sendMessage 保持一致
      throw new ApiError(`Chat API error (${response.status}): ${errorText.substring(0, 200)}`, response.status);
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/event-stream')) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedReply = '';
      let accumulatedReasoning = ''; // 🔧 FIX: 缺少 reasoning 累积 (与 sendMessage 一致)

      if (reader) {
        // 🔧 ARCH fix (Round 70): SSE while(true) + idle timeout + reader cleanup 提取到
        //    consumeAIStream (见 ./consume-ai-stream.ts)。retryAiResponse 无 throttling (无 rAF),
        //    故无 try/finally wrapper — reader cleanup 已在 consumeAIStream 的 finally 内。
        //    🔧 H1 fix: 90s idle timeout + Round 49 R49-A-1 reject 处理 也在 consumeAIStream 内。
        //    🔧 Round 19 Frontend H5: reader.cancel + releaseLock 也在 consumeAIStream 的 finally 内。
        const streamResult = await consumeAIStream(reader, decoder, {
          onToken: (_token, accReply) => {
            accumulatedReply = accReply;
            setMessagesSync((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: accumulatedReply, reasoning: accumulatedReasoning || m.reasoning } : m
            ));
          },
          onReasoning: (_token, accReasoning) => {
            // 🔧 FIX: 缺少 reasoning 事件处理 (与 sendMessage 一致)
            accumulatedReasoning = accReasoning;
            setMessagesSync((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, reasoning: accumulatedReasoning } : m
            ));
          },
          onProductCards: (cards) => {
            // 🔧 fix (2026-09-04): retry 流式路径同样挂商品卡片 (与 sendMessage 一致)
            // 🌱 query 意图接线 (batch22-c): 重试轮的搜索词 = 最后一条用户消息, 与卡片同挂
            setMessagesSync((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, productCards: cards, productCardsQuery: lastUserMsg?.content } : m
            ));
          },
          onGreenAlt: (data) => {
            // 🌱 绿色替代卡片: retry 流式路径同样挂卡片 (与 sendMessage 一致)
            setMessagesSync((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, greenAlt: data } : m
            ));
          },
          onReuseHint: (hint) => {
            // 🔁 复用优先: retry 流式路径同样挂复用卡 (与 sendMessage 一致)
            setMessagesSync((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, reuseHint: hint } : m
            ));
          },
          onGreenKnowledge: (data) => {
            // 📖 batch47-a 知识问答: retry 流式路径同样挂词条来源 chip (与 sendMessage 一致)
            setMessagesSync((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, greenKnowledge: data } : m
            ));
          },
          onToolResult: (parsed) => handleToolEvent(parsed, {
            // 🔧 FIX: retryAiResponse 之前忽略 tool_result/tool_call 事件
            // 导致 AI 重试时调 MCP 工具 → buddy state 不刷新 → 通知不显示 → challenge banner 不清除
            // 🐘 人设转型: 传 locale, 小象 toast 话术按 UI 语言取词
            activeChallenge, t, locale: localeRef.current, setActiveChallenge, onBuddyStateRefresh, onToast,
            addMcpNotification, justCompletedChallengeRef,
            // 🔧 P0 fix (mirror philosophy): buy 路径不弹存款对话框 + 不显示 passed toast
            justBoughtChallengeRef,
          }),
          onError: (rawContent) => {
            // 🔧 FIX: retryAiResponse 之前不处理 SSE error 事件
            // → AI 流返回 error 时, retryAiResponse 会用空 accumulatedReply 保存 fallback 消息
            // → 但不标记 isError, 用户无法再次重试
            const errorContent = rawContent || t('chat.aiFallback.connectionInterrupted');
            markStreamErrorBubble({
              assistantMsgId,
              content: errorContent,
              setMessagesSync,
              onRetry: createStreamErrorRetry({
                assistantMsgId,
                setMessagesSync,
                messagesRef,
                sendMessageLockRef,
                retryAiResponseRef,
              }),
            });
            return true; // 信号: break consumeAIStream 的 for + while 循环 (匹配原 `return;` 跳出流式循环)
          },
          // retryAiResponse 不处理剩余 buffer (保留原行为 — 不传 onRemainingBufferToken)
        });
        accumulatedReply = streamResult.reply;
        accumulatedReasoning = streamResult.reasoning;
        // 🔧 ARCH fix (Round 70): errorDisplayed → return 跳过 finalMsg 处理 (匹配原 SSE 循环内的 `return;`)
        if (streamResult.errorDisplayed) return;
            if (streamResult.readerError) {
              markStreamErrorBubble({
                assistantMsgId,
                content: accumulatedReply,
                setMessagesSync,
                onRetry: createStreamErrorRetry({
                  assistantMsgId,
                  setMessagesSync,
                  sendMessageLockRef,
                  retryAiResponseRef,
                  retryContent: _lastUserContent,
                  releaseLockBeforeRetry: false,
                  skipIfLocked: true,
                }),
              });
              return;
            }
      }

      // finalMsg
      // 🔧 P1 fix (Issue 3): trim() 检查 — 空白-only 回复用 fallback
      setMessagesSync((prev) => prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, content: accumulatedReply.trim() || t('chat.aiFallback.hereForYou'), reasoning: accumulatedReasoning || undefined }
          : m
      ));
      // Save AI reply (not user message)
      // 🔧 FIX: 使用 retryMode (从用户消息推断), 而非 activeChallenge
      const finalMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        // 🔧 P1 fix (Issue 3): trim() 检查 — 空白-only 回复用 fallback
        content: accumulatedReply.trim() || t('chat.aiFallback.hereForYou'),
        reasoning: accumulatedReasoning || undefined,
        timestamp: new Date(),
        mode: retryMode,
      };
      saveMessage(finalMsg);
    }
  } catch (err) {
    if (isAbortError(err)) return;
    // 重新显示错误消息
    // 🔧 ARCH fix (Round 20 Frontend H6 — retryAiResponse catch 缺 onRetry, 用户卡死):
    //    旧代码不设 onRetry → 用户看到错误但无重试按钮, 必须刷新页面。
    //    根因修复: 加 onRetry, 让用户可再次重试。
    // 🔧 2026-07-20 (P0 fix): 区分 401 (需登录) vs 其他错误
    //    与 use-chat-actions.ts sendMessage 保持一致
    const errorStatus = normalizeChatApiError(err).status;
    const isAuthError = errorStatus === 401;
    const errorContent = isAuthError
      ? t('chat.aiFallback.authRequired')
      : t('chat.aiFallback.aiError');
    markStreamErrorBubble({
      assistantMsgId,
      content: errorContent,
      setMessagesSync,
      onRetry: createStreamErrorRetry({
        assistantMsgId,
        setMessagesSync,
        sendMessageLockRef,
        retryAiResponseRef,
        retryContent: _lastUserContent,
      }),
    });
  } finally {
    // 🔧 ARCH fix (Give Up race): 同 sendMessage — 用代际判断避免新调用被旧 finally 清理。
    if (abortController && abortRef.current === abortController) {
      setIsLoading(false);
      // 🔧 BUG-018 fix: 释放模块级互斥锁 (Round 13 BUG-3: sendMessageLockRef 统一管理)
      sendMessageLockRef.current.inProgress = false;
      // 🔧 FIX: 清除 abortRef, 防止 stale reference
      abortRef.current = null;
      // 🔧 NEW-044 fix (Round 40): 同 sendMessage — 流结束后设 skip nonce 抑制重复 loadHistory
      skipNextHistoryLoadRef.current = true;
      skipNonceRef.current = Date.now();
      // 🔧 P0 fix (mirror philosophy): 清除 buy flag, 同 sendMessage finally
      justBoughtChallengeRef.current = false;
    }
  }
}
