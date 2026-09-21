'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { VirtuosoHandle } from 'react-virtuoso';
import { ChatMessage } from './chat-bubble';
import { useMcpNotifications } from './chat/hooks/use-mcp-notifications';
import { useChallengeActions } from './chat/hooks/use-challenge-actions';
import { useChallengeFetch } from './chat/hooks/use-challenge-fetch';
import { useChatPersistence } from './chat/hooks/use-chat-persistence';
import { useChatActions } from './chat/hooks/use-chat-actions';
import { useChatHistory } from './chat/hooks/use-chat-history';
import { useChatRecap } from './chat/hooks/use-chat-recap';
// 🐞 batch46-b: 微挑战次日一次性回访条
import { useMicroChallengeFollowup } from './chat/hooks/use-micro-challenge-followup';
import { useCooldownFollowup } from './chat/hooks/use-cooldown-followup';
// 🐘 batch50-a 买前三问: 「冷静 24h」次日回访
import { usePrepurchaseFollowup } from './chat/hooks/use-prepurchase-followup';
import { useDuplicateReuseFollowup } from './chat/hooks/use-duplicate-reuse-followup';
import { useEmotionGuardFollowup } from './chat/hooks/use-emotion-guard-followup';
import { usePostPurchaseReview } from '@/hooks/use-post-purchase-review';
// 🐘 batch52-b: 小象引导式周复盘对话 (固定入口 + due 自动开一次)
import { useWeeklyReview } from '@/hooks/use-weekly-review';
// ====== File Split Wave 1: 剩余内联逻辑拆到 chat/hooks/* + chat/sections/* (纯搬运, 行为零变化) ======
import { useChatDemoMode } from './chat/hooks/use-chat-demo-mode';
import { useChatLifecycleCleanup } from './chat/hooks/use-chat-lifecycle-cleanup';
import { usePendingContext } from './chat/hooks/use-pending-context';
import { useImpulseContext } from './chat/hooks/use-impulse-context';
import { ChatHeader } from './chat/parts/chat-header';
import { ChatBanners } from './chat/parts/chat-banners';
import { ChatMessages } from './chat/parts/chat-messages';
import { ChatRecap } from './chat/parts/chat-recap';
import { MicroChallengeFollowup } from './chat/parts/micro-challenge-followup';
import { CooldownFollowup } from './chat/parts/cooldown-followup';
// 🐘 batch50-a 买前三问: 「冷静 24h」次日回访条
import { PrepurchaseFollowup } from './chat/parts/prepurchase-followup';
import { DuplicateReuseFollowup } from './chat/parts/duplicate-reuse-followup';
// 🐘 batch60-c 情绪守护: 「先等 10 分钟」到期待追问条 (刷新/换会话后接棒)
import { EmotionGuardCheckin } from './chat/parts/emotion-guard-checkin';
import { PostPurchaseReview } from './chat/parts/post-purchase-review';
import { WeeklyReviewCard } from './chat/parts/weekly-review';
import { WeeklyReviewEntry } from './chat/parts/weekly-review-entry';
import { GuardMomentsCard } from './chat/parts/guard-moments';
import { GuardMomentsEntry } from './chat/parts/guard-moments-entry';
// 🐘 batch59-a 进行中守护面板: 三类 active 项聚合 (挑战/承诺/冷静期) + SOS 降温
import { ActiveGuardsPanel } from './chat/parts/active-guards-panel';
import { ActiveGuardsEntry } from './chat/parts/active-guards-entry';
// 🐘 batch53-a 绿色承诺: 到期结算卡 (health_events 派生, 一次性展示)
import { CommitmentSettlement } from './chat/parts/commitment-settlement';
import { useGreenCommitment } from '@/hooks/use-green-commitment';
import { useGuardMoments } from '@/hooks/use-guard-moments';
// 🐘 batch59-a 进行中守护面板数据源 (只读派生, 唯一写入是 SOS 事件)
import { useActiveGuards } from '@/hooks/use-active-guards';
import { getActivePendingPrepurchase } from './chat/parts/prepurchase-store';
// 🐘 batch47-b: 今日守护日记卡
import { GuardDiaryCard } from './chat-parts/guard-diary-card';
// 🐘 batch48-c: 深夜守护横幅 (高危=深夜且当前在窗口内才渲染)
import { NightGuardBanner } from './chat-parts/night-guard-banner';
import { InterceptMedalMoment } from './chat/parts/intercept-medal-moment';
import { CompanionBackground } from './chat/parts/companion-background';
import { ChatComposer } from './chat/sections/chat-composer';
import { DepositDialogSection } from './chat/sections/deposit-dialog-section';
import { SilentMomentSection } from './chat/sections/silent-moment-section';
import { BUDDY_ACCENT, BUDDY_GRADIENT } from './chat/chat-accents';
import { useAuth } from '@/components/auth/auth-provider';
import type { ChatTabProps } from './chat/chat-tab-props';
import { useI18n } from '@/i18n/provider';
import { useSilentMoment } from '@/hooks/use-silent-moment';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

const PAGE_SIZE = 6;

/**
 * ChatTab 编排壳 — 状态/refs 声明 + hooks 装配 + JSX 区块编排。
 * (原 747 行 — 前几轮已拆出 chat/hooks/* + chat/parts/*, 本轮把剩余内联逻辑移入
 *  use-chat-demo-mode / use-chat-lifecycle-cleanup / use-pending-context / use-impulse-context
 *  与 chat/sections/*; 纯搬运, 行为零变化)
 */
export function ChatTab({ impulseContext, buddyState, contextMessage, challengeContext, onContextConsumed, onBuddyStateRefresh, isDemo = false, onAuthPrompt, onToast, onChallengePassed, onMessageSent, onNavigateProfile }: ChatTabProps) {
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  // 🔧 hourlyRate: 传入挑战 prompt (生命小时数计算) + handleResume
  const { hourlyRate } = useHourlyRate(isDemo);  // 🔧 需求九: 沉默时刻 — 挑战完成后 2s 仪式, 再弹 DepositDialog (saw) 或结束 (bought)
  const { silentMoment, triggerSaw: triggerSawSilentMoment, triggerBought: triggerBoughtSilentMoment, attachPendingAhaMoment, completeSilentMoment } = useSilentMoment(isDemo);
  const sendMessageLockRef = useRef({ inProgress: false, lastContent: '', lastTime: 0 });
  const justCompletedChallengeRef = useRef(false);
  // 🔧 P0 fix (mirror philosophy — I choose to buy):
  //   handleChooseToBuy 设此 ref = true, 让 handleToolEvent (SSE 流中) 知道 AI 调
  //   complete_challenge 是 "buy" 路径 (status='failed'), 应跳过存款对话框 + passed toast。
  //   sendMessage finally 块清除 ref。
  const justBoughtChallengeRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // N62+BUG-003: ref 必须同步更新 (setState + ref.current 同时更新, 防 finally 竞态)
  const [isLoading, setIsLoadingState] = useState(false);
  const setIsLoading = useCallback((value: boolean) => {
    setIsLoadingState(value);
  }, []);

  const [isLoadingHistory, setIsLoadingHistoryState] = useState(true);
  const setIsLoadingHistory = useCallback((value: boolean) => {
    setIsLoadingHistoryState(value);
  }, []);

  const [hasMore, setHasMoreState] = useState(false);
  const setHasMore = useCallback((value: boolean) => {
    setHasMoreState(value);
  }, []);
  //    Virtuoso startReached 可能在同 tick 内双发, state 异步无法拦截, 必须用 ref
  const isLoadingMoreRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  // Virtuoso 反向分页：firstItemIndex 给历史消息预留空间，prepend 时前移以保持视觉位置
  const [firstItemIndex, setFirstItemIndex] = useState(100000);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  // BUG-95 fix: Store AbortController ref for cleanup on unmount
  const abortRef = useRef<AbortController | null>(null);
  // 已提取到 useMcpNotifications hook (见 line 199)

  // 之前声明在 line 332, 但 loadHistory useEffect (line 209) 和 saveMessage useCallback (line 271)
  // 的依赖数组同步求值 activeChallenge 时, 该变量仍在 TDZ (Temporal Dead Zone)
  // → ReferenceError: Cannot access 'en' before initialization (en 是 minified 后的 activeChallenge)
  // 修复: 将声明上移到所有 useEffect 之前
  // 保存 challengeContext 的本地状态（独立于 prop，不会被 onContextConsumed 清除）
  const [activeChallenge, setActiveChallenge] = useState<{ itemName: string; amount: number; challengeId?: string } | undefined>(undefined);
  //    之间完成 (SSE complete_challenge → setActiveChallenge(undefined)), retry 用 stale challengeContext。
  //    根因修复: 加 activeChallengeRef, retryAiResponse 读 ref.current 而非闭包值。
  const activeChallengeRef = useRef(activeChallenge);
  useEffect(() => { activeChallengeRef.current = activeChallenge; }, [activeChallenge]);

  //    根因修复: 用 ref 读最新值
  const impulseContextRef = useRef(impulseContext);
  useEffect(() => { impulseContextRef.current = impulseContext; }, [impulseContext]);
  const localeRef = useRef(locale);
  useEffect(() => { localeRef.current = locale; }, [locale]);
  const [expiredChallenge, setExpiredChallenge] = useState<{ challengeId: string; itemName: string; amount: number } | null>(null);
  // 🔧 DM-4 fix: 加 ref 防止重复弹出 (三个 SSE 路径都可能触发 onChallengeCompleted)
  const depositShownRef = useRef<string | null>(null);
  const [depositDialog, setDepositDialog] = useState<{ challengeId: string; savedAmount: number } | null>(null);
  // chat/history GET 500 时显示错误 + 重试按钮
  //    旧代码 if (!res.ok) return → 用户看到空聊天界面, 无错误提示, 无重试按钮。
  //    修复: 加 historyLoadError state, UI 显示错误 banner + Retry 按钮。
  // Retry 按钮需要 historyRetryNonce 触发 effect 重新运行
  //    旧修复只设 state, 但 loadHistory effect deps 是 [user?.id, activeChallenge] — 不变则 effect 不重跑。
  //    修复: 加 historyRetryNonce state, retry 时 ++, 加入 effect deps。
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [historyRetryNonce, setHistoryRetryNonce] = useState(0);

  // 清理 demo timers on unmount
  // 🔧 H7 fix: buddyStateRefreshTimerRef 也在此清理
  const buddyStateRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔧 Round 2 QA fix: store deposit nav timer for cleanup on unmount
  const depositNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // BUG-181 fix: 单调递增 ID 计数器，防止 Date.now() 碰撞导致 React key 重复
  const idCounterRef = useRef(0);
  const nextId = useCallback((prefix: string) => `${prefix}-${Date.now()}-${++idCounterRef.current}`, []);

  // messagesRef 保留 (onRetry 闭包 + loadMore cursor 需要同步读取)
  //   清理 M6 fix 失败方案的死注释, 保留 useEffect 同步模式 (ref 滞后一拍但保证一致性)
  // 🔧 ARCH fix (Round 23 MEDIUM-2 — setMessagesSync 名称误导, 实际不同步 ref):
  //    旧代码 setMessagesSync 只调 setMessages, messagesRef 通过 effect 滞后一拍同步。
  //    sendMessage/retryAiResponse/loadMore 读 messagesRef.current 可能拿到旧值。
  //    根因修复: setMessagesSync 内同步更新 messagesRef.current (functional update 时用计算结果)。
  //    根因修复: 只调一次 setMessages, 在 functional update 内同步 ref。
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const setMessagesSync = useCallback((
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => {
    // 只调一次 setMessages, 在 functional update 内同步 ref
    setMessages(prev => {
      const next = typeof updater === 'function' ? (updater as (p: ChatMessage[]) => ChatMessage[])(prev) : updater;
      messagesRef.current = next;  // 同步 ref
      return next;
    });
  }, []);

  // ======== Demo 模式 (预填充 + demo→auth 清理 + demo timers/counter) ========
  const { demoReplyTimerRef, demoAuthTimerRef, demoMsgCountRef, DEMO_FREE_MESSAGES } = useChatDemoMode({ isDemo, messages, setMessagesSync, setIsLoadingHistory, t });

  // 替换原来的 mcpNotifications state + handleMCPResults useCallback
  const { mcpNotifications, handleMCPResults, addMcpNotification } = useMcpNotifications({
    nextId,
    t,
    onChallengeClear: () => setActiveChallenge(undefined),
    onBuddyStateRefresh,
    // 🔧 信任存入 fix (Round 106): 流式路径 complete_challenge → 弹出 DepositDialog
    // 🔧 DM-4 fix: 用 depositShownRef 防止同一 challenge 重复弹出
    onChallengeCompleted: (challengeId: string, savedAmount: number) => {
      if (depositShownRef.current === challengeId) return; // 已弹过, 不重复
      depositShownRef.current = challengeId;
      // 🔧 需求九: 先显示沉默时刻, 完成后再弹 DepositDialog (由 SilentMomentOverlay onComplete 触发)
      triggerSawSilentMoment(challengeId, savedAmount, activeChallengeRef.current?.itemName || '');
      // 🔧 ARCH fix Round 74 (Finding 4+5): onChallengePassed 推迟到沉默时刻完成后.
      //    旧代码: triggerSawSilentMoment + onChallengePassed 同步触发 →
      //    SilentMomentOverlay (z-[310]) + AhaMomentOnboarding (z-[300]) 同时显示, UX 冲突.
      //    根因修复: 把 onChallengePassed 参数存入 silentMoment.pendingAhaMoment,
      //    SilentMomentOverlay.onComplete 时一起触发 (仪式节奏不被打断).
      attachPendingAhaMoment({
        challengeId,
        itemName: activeChallengeRef.current?.itemName || '',
        amount: savedAmount,
      });
    },
  });

  // ======== pendingContext 发送器 (challengeContext/contextMessage 暂存 → 就绪后自动发送) ========
  const { pendingContextRef, pendingDisplayContentRef, setPendingContextReady, sendMessageRef } = usePendingContext({ activeChallenge, isLoading, isLoadingHistory, sendMessageLockRef });

  // 🔧 P1 fix (Bug 1): 防止 loadHistory 覆盖刚发的消息 (resumeChallenge race condition)
  const skipNextHistoryLoadRef = useRef(false);
  // 🔧 NEW-012 deeper fix: 用 nonce 替代 boolean — 防止 skip 被消费后 setActiveChallenge 触发的
  //   二次 loadHistory effect 重新加载旧消息。nonce 在 contextMessage effect 内刷新, loadHistory 消费时比对。
  const skipNonceRef = useRef(0);

  // Round 20 Frontend C1: user?.id 变化时清空所有用户相关 state (防跨用户泄露)
  useChatLifecycleCleanup({
    userId: user?.id,
    sendMessageLockRef,
    abortRef,
    demoReplyTimerRef,
    demoAuthTimerRef,
    buddyStateRefreshTimerRef,
    depositNavTimerRef,
    skipNextHistoryLoadRef,
    skipNonceRef,
    pendingContextRef,
    pendingDisplayContentRef,
    setActiveChallenge,
    setExpiredChallenge,
    setMessagesSync,
    setIsLoading,
    setHistoryLoadError,
    setPendingContextReady,
  });

  // loadHistory + challengeContext skip + contextMessage effects
  //    extracted to use-chat-history.ts hook (zero behavior change, params injected)
  useChatHistory({
    userId: user?.id,
    isDemo,
    activeChallenge,
    challengeContext,
    contextMessage,
    hourlyRate, // 🔧 P0-3: 传入用户时薪, 用于挑战 prompt 中的生命小时数计算
    historyRetryNonce,
    pageSize: PAGE_SIZE,
    sendMessageLockRef,
    skipNextHistoryLoadRef,
    skipNonceRef,
    pendingContextRef,
    pendingDisplayContentRef,
    setMessagesSync,
    setIsLoadingHistory,
    setHasMore,
    setHistoryLoadError,
    setPendingContextReady,
    setActiveChallenge,
    onContextConsumed,
    i18n: { t },
  });

  // ======== 异步保存消息到数据库 ========
  // 🔧 ARCH fix (Round 60 — 提取到 useChatPersistence hook, 减少 chat-tab 行数)
  const { saveMessage, deleteMessage, loadMoreMessages } = useChatPersistence({
    userId: user?.id,
    activeChallenge,
    messagesRef,
    setMessagesSync,
    hasMore,
    setHasMore,
    setFirstItemIndex,
    isLoadingMoreRef,
    setIsLoadingMore,
    pageSize: PAGE_SIZE,
  });

  // 🔧 C6 拆分: renderItemContent 已移到 ChatMessages 组件内部
  // 🔧 C6 拆分: clearAllMessages 已移到 ChatMessages 组件 (如有需要可重新加回)
  // 🔧 L2 fix: 删除死代码 _clearAllMessages (从未被调用)
  // activeChallenge / expiredChallenge 已上移 (BUG-334 fix)
  // pendingContextRef / pendingContextReady 已上移 (Round 65 LOW-6 fix)

  // 🔧 架构优化: 活跃/过期挑战获取提取到 use-challenge-fetch.ts
  useChallengeFetch({
    user,
    isDemo,
    authLoading,
    activeChallenge,
    justCompletedChallengeRef,
    setActiveChallenge,
    setExpiredChallenge,
  });

  // contextMessage → pendingContext effect moved to use-chat-history.ts

  // 诱导消费上下文 → 系统开场消息 (原两个 impulseContext effects — File Split Wave 1 移入 hook)
  useImpulseContext({ impulseContext, nextId, saveMessage, setMessagesSync });

  // loadMoreMessages 已提取到 useChatPersistence hook

  // 🔧 Virtuoso 接管滚动后，原 handleScrollPosition（onScroll 触发 loadMore）→ startReached 回调
  // 原滚到底 useEffect（scrollTop=scrollHeight）→ followOutput='smooth'
  // 两个逻辑均由 Virtuoso 内部处理，此处移除（行为等价或更优：流式时用户滚上看历史不会被强制拉回）

  // ======== 发送消息 + 重试 AI 回复 ========
  // sendMessage + retryAiResponse 已提取到 useChatActions hook。
  //    原两个函数 (~850 行) 现在通过 params 注入 refs/state/setters/callbacks/i18n。
  //    行为零变化: 纯函数提取, 逻辑/注释/控制流 byte-for-byte 保留。
  //    retryAiResponse 自引用 (onRetry 闭包) 通过 hook 内部的 retryAiResponseRef 处理 (避免 useCallback dep-cycle)。
  //    chat-tab.tsx 仅消费 sendMessage — retryAiResponse 仅被 sendMessage 内部 onRetry 调用, 由 hook 自管 ref。
  const { sendMessage } = useChatActions({
    state: {
      activeChallenge,
      isLoadingHistory,
      isDemo,
      impulseContext,
      locale,
    },
    refs: {
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
    },
    setters: {
      setMessagesSync,
      setIsLoading,
      setInput,
      setActiveChallenge,
    },
    callbacks: {
      nextId,
      saveMessage,
      handleMCPResults,
      addMcpNotification,
      onBuddyStateRefresh,
      onAuthPrompt,
      onToast,
      // 🔧 信任存入 fix (Round 106): 挑战完成 → 弹出 DepositDialog
      // 🔧 DM-4 fix: 用 depositShownRef 防止同一 challenge 重复弹出
      // SSE 主路径也触发 onChallengePassed (Aha Moment Step 3)
      //    旧代码: onChallengePassed 只在 useMcpNotifications (fallback) 和 useChallengeActions (giveUp) 调
      //    SSE 主路径 (useChatActions) 漏了 → 登录用户 Aha Moment Step 3 永远不显示
      onChallengeCompleted: (challengeId: string, savedAmount: number) => {
        if (depositShownRef.current === challengeId) return; // 已弹过, 不重复
        depositShownRef.current = challengeId;
        // 🔧 需求九: 先显示沉默时刻, 完成后再弹 DepositDialog
        triggerSawSilentMoment(challengeId, savedAmount, activeChallengeRef.current?.itemName || '');
        // 🔧 ARCH fix Round 75 (Finding 28): onChallengePassed 推迟到沉默时刻完成后.
        //    旧代码 (Round 33 HIGH-2): onChallengePassed 同步触发 →
        //    SilentMomentOverlay (z-[310]) + AhaMomentOnboarding (z-[300]) 同时显示, UX 冲突.
        //    根因修复: 把 onChallengePassed 参数存入 silentMoment.pendingAhaMoment,
        //    SilentMomentOverlay.onComplete 时一起触发 (仪式节奏不被打断).
        //    (与 useMcpNotifications fallback 路径 line 186 一致)
        attachPendingAhaMoment({
          challengeId,
          itemName: activeChallengeRef.current?.itemName || '',
          amount: savedAmount,
        });
      },
      // 🔧 需求九: bought 路径 (AI SSE complete_challenge + justBoughtChallengeRef) → 沉默时刻 (bought), 无存款
      onChallengeBought: (amount: number, itemName: string) => {
        triggerBoughtSilentMoment(amount, itemName);
        // 🔧 P0 fix (2026-07-10): "I choose to buy" 路径也消耗了一次挑战额度, 需要刷新 "X left" 计数器
        //   旧代码: 只有 onChallengePassed (saw it) 路径会刷新, bought 路径不刷新
        //   新代码: bought 路径也派发 challenge-completed 事件
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('symy:challenge-completed'));
        }
      },
    },
    i18n: { t },
    demo: { DEMO_FREE_MESSAGES },
  });

  // 🔧 PM3-P2-1 fix: 包装 sendMessage, 在用户发送消息时通知 page.tsx (用于今日任务清单)
  //   旧代码: sendMessage 直接调用
  //   新代码: 包装后调用 onMessageSent (mark daily chat task)
  const sendMessageWithTaskTracking = useCallback((content: string, apiContent?: string): Promise<void> => {
    onMessageSent?.();
    return sendMessage(content, apiContent);
  }, [sendMessage, onMessageSent]);

  // 🔧 S-14 fix: 将 ref 赋值放在 useLayoutEffect 中，避免 render 期间产生副作用
  // 改用 useLayoutEffect — 在 useEffect 之前同步执行,
  //    确保 pendingContext effect 读到的是当前 render 的 sendMessage,
  //    而非上一个 render 的 stale 闭包 (旧闭包 activeChallenge=undefined → mode='normal' → 挑战消息丢失)。
  // 🔧 PM3-P2-1 fix: 用 sendMessageWithTaskTracking 替代 sendMessage
  useLayoutEffect(() => {
    sendMessageRef.current = sendMessageWithTaskTracking;
    // sendMessageRef 为稳定 ref (identity 不变), 加入 deps 不改变触发时机
  }, [sendMessageWithTaskTracking, sendMessageRef]);

  // 🔧 C4 拆分: 挑战操作 handlers 提取到 useChallengeActions hook
  // 用 setMessagesSync 替代 setMessages
  //    旧代码传 setMessages (useState setter) → handleResume 清空 UI 但 messagesRef 不变
  //    → sendMessage 读 stale messagesRef → AI 收到旧对话上下文。
  //    根因修复: 传 setMessagesSync (同时更新 messagesRef)。
  const { handleGiveUp, handleChooseToBuy, handleResume, handleDismiss } = useChallengeActions({
    setActiveChallenge,
    setExpiredChallenge,
    setMessages: setMessagesSync,
    skipNextHistoryLoadRef,
    onChallengePassed,
    // 🔧 DM-5 fix: handleGiveUp 路径也触发 DepositDialog (经沉默时刻)
    onChallengeCompleted: (challengeId: string, savedAmount: number) => {
      if (depositShownRef.current === challengeId) return;
      depositShownRef.current = challengeId;
      // 🔧 需求九: handleGiveUp ("I'll pass") 路径 — 沉默时刻 (saw) → DepositDialog
      triggerSawSilentMoment(challengeId, savedAmount, activeChallengeRef.current?.itemName || '');
    },
    // 🔧 需求九: handleChooseToBuy ("I choose to buy") 路径 — 沉默时刻 (bought), 无存款
    onChallengeBought: (amount: number, itemName: string) => {
      triggerBoughtSilentMoment(amount, itemName);
      // 🔧 P0 fix (2026-07-10): "I choose to buy" 路径也消耗挑战额度, 派发事件刷新 "X left"
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('symy:challenge-completed'));
      }
    },
    sendMessage,
    onToast,
    onBuddyStateRefresh,
    t,
    locale, // 🐘 人设转型: 小象 toast 话术按 UI 语言取词 (elephant-tone.ts)
    hourlyRate, // 🔧 P0-3: 传入用户时薪, 用于 handleResume 生命小时数计算
  });


  const health = buddyState?.health || 'healthy';
  const accentClass = BUDDY_ACCENT[health];
  const gradientClass = BUDDY_GRADIENT[health];

  // 🌱 会话连续性: 上次聊到一半的绿色话题 → 一次性「上次我们聊到」回顾条
  const { recap, dismiss: dismissRecap } = useChatRecap({
    messages,
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐞 batch46-b: 到期微挑战的次日一次性回访条 (localStorage 待回访记录驱动)
  const { dueRecord: dueMicroChallenge, clear: clearMicroChallengeFollowup } = useMicroChallengeFollowup({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐘 batch48-b: 到期冷静卡的次日一次性回访条 (localStorage 待回访记录驱动;
  // 二选一后回访条内联展示祝福/成功文案, 记录已在 store 内消解)
  const { dueRecord: dueCooldown } = useCooldownFollowup({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐘 batch50-a: 买前三问选「冷静 24h」的次日一次性回访条 (localStorage 待回访
  // 记录驱动; 二选一后回访条内联展示祝福/成功文案, 记录已在 store 内消解)
  const { dueRecord: duePrepurchase, clear: clearPrepurchaseFollowup } = usePrepurchaseFollowup({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  const { due: dueDuplicateReuse, clear: clearDuplicateReuseFollowup } = useDuplicateReuseFollowup({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐘 batch60-c: 情绪守护选「先等 10 分钟」的到期待追问条 (localStorage one-shot
  // 等待记录驱动; 刷新/换会话后卡不在了, 由追问条接棒二选一)
  const { dueRecord: dueEmotionWait } = useEmotionGuardFollowup({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐘 batch51-a: 拦截失败后 1–2 天的购后复盘回访条 (health_events 派生, 一次性展示)
  const { dueReview, reviewSummary, recordReview } = usePostPurchaseReview({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐘 batch52-b: 小象引导式周复盘 — 本周有数据且未复盘时自动开一次 (一次性),
  // 固定入口随时可开 (无数据周走引导态, 已复盘周回看总结卡)
  const { derivation: weeklyReview, open: weeklyReviewOpen, openReview, closeReview, markReviewed } = useWeeklyReview({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  // 🐘 batch58-a: 守护时刻时间线 — 三类胜利时刻的倒序回看流 (固定入口随时可开)
  const { timeline: guardMoments, isLoading: guardMomentsLoading } = useGuardMoments();
  const [guardMomentsOpen, setGuardMomentsOpen] = useState(false);

  // 🐘 batch59-a 进行中守护面板 — 固定入口随时可开 (空态用最近胜利时刻激励);
  // 冷静期 pending 由组件层读 localStorage 传入 hook (hooks 层禁依赖 components)
  const pendingCooldown = getActivePendingPrepurchase();
  const { summary: activeGuards, isLoading: activeGuardsLoading } = useActiveGuards({
    cooldown: pendingCooldown
      ? { subject: pendingCooldown.subject, askedAt: pendingCooldown.askedAt, dueAt: pendingCooldown.dueAt, amount: pendingCooldown.amount }
      : null,
  });
  const [activeGuardsOpen, setActiveGuardsOpen] = useState(false);

  // 🐘 batch53-a: 绿色承诺到期回访 — 到期当天首轮对话自动开一次结算卡 (一次性)
  const { derivation: greenCommitment, open: commitmentSettlementOpen, closeSettlement, markSettled } = useGreenCommitment({
    isDemo,
    historyReady: !isLoadingHistory && !historyLoadError,
  });

  return (
    <div className="flex flex-col h-full relative bg-surface-1">
      {/* === Companion Background Layer === */}
      <CompanionBackground health={health} vitality={buddyState?.vitality || 72} />

      {/* === Header — minimal: only banners, no title/avatar/tokens === */}
      <ChatHeader
        buddyState={buddyState}
        health={health}
        accentClass={accentClass}
        gradientClass={gradientClass}
      >
        {/* Banners 嵌套在 Header 内 (与原结构一致) */}
        {/* 🔧 Bug 27 fix: Demo 模式下 challengeContext prop 可能比 activeChallenge state 先到
            (setActiveChallenge 是异步 state 更新, 首次 render 时 activeChallenge 仍为 undefined)。
            根因修复: 用 activeChallenge ?? challengeContext 作为 fallback, 保证 banner 立即显示。 */}
        <ChatBanners
          activeChallenge={activeChallenge ?? (challengeContext ? { itemName: challengeContext.itemName, amount: challengeContext.amount, challengeId: challengeContext.challengeId } : undefined)}
          expiredChallenge={expiredChallenge}
          impulseContext={impulseContext}
          historyLoadError={historyLoadError}
          onRetryLoadHistory={() => {
            // 用 nonce 触发 effect 重跑 (旧修复只设 state, effect deps 不变 → 不重跑)
            setHistoryLoadError(null);
            setIsLoadingHistory(true);
            // 触发 loadHistory effect 重跑 (nonce dep 变化)
            setHistoryRetryNonce(n => n + 1);
          }}
          onGiveUp={handleGiveUp}
          onChooseToBuy={handleChooseToBuy}
          onResume={handleResume}
          onDismiss={handleDismiss}
          isLoading={isLoading}
        />
      </ChatHeader>

      {/* 🌱 「上次我们聊到」一次性回顾条 (chat-header 之下、消息列表之上, 不侵入消息数组) */}
      {recap && (
        <ChatRecap
          topic={recap}
          onContinue={(prompt) => {
            setInput(prompt);
            inputRef.current?.focus();
            dismissRecap();
          }}
          onDismiss={dismissRecap}
        />
      )}

      {/* 🐞 batch46-b 微挑战次日回访条 — recap 条之下, 同一一次性展示语义 */}
      {dueMicroChallenge && (
        <MicroChallengeFollowup
          record={dueMicroChallenge}
          onResolved={clearMicroChallengeFollowup}
        />
      )}

      {/* 🐘 batch48-b 冷静卡次日回访条 — 微挑战回访条之下, 同一一次性展示语义 */}
      {dueCooldown && (
        <CooldownFollowup record={dueCooldown} />
      )}

      {/* 🐘 batch50-a 买前三问「冷静 24h」次日回访条 — 冷静卡回访条之下, 同一一次性展示语义 */}
      {duePrepurchase && (
        <PrepurchaseFollowup record={duePrepurchase} onResolved={clearPrepurchaseFollowup} />
      )}

      {dueDuplicateReuse && (
        <DuplicateReuseFollowup
          card={dueDuplicateReuse.card}
          decisionId={dueDuplicateReuse.decisionId}
          onResolved={clearDuplicateReuseFollowup}
        />
      )}

      {/* 🐘 batch60-c 情绪守护「先等 10 分钟」到期待追问条 — 三问回访条之下, 同一一次性展示语义 */}
      {dueEmotionWait && (
        <EmotionGuardCheckin record={dueEmotionWait} />
      )}

      {/* 🐘 batch51-a 购后复盘回访条 — 三问回访条之下, 同一一次性展示语义 */}
      {dueReview && (
        <PostPurchaseReview record={dueReview} summary={reviewSummary} onAnswered={recordReview} />
      )}

      {/* 🐘 batch53-a 承诺到期结算卡 — 到期当天开场, 看完/重启承诺后消解 */}
      {commitmentSettlementOpen && greenCommitment?.dueSettlement && (
        <CommitmentSettlement settlement={greenCommitment.dueSettlement} onSettled={markSettled} onClose={closeSettlement} />
      )}

      {/* 🐘 batch52-b 周复盘 — 固定入口常驻; 卡打开时入口让位 */}
      {!weeklyReviewOpen && <WeeklyReviewEntry onOpen={openReview} />}
      {weeklyReviewOpen && weeklyReview && (
        <WeeklyReviewCard derivation={weeklyReview} onCompleted={markReviewed} onClose={closeReview} />
      )}

      {/* 🐘 batch58-a 守护时刻时间线 — 固定入口常驻; 卡打开时入口让位 (数据未到时点击等加载) */}
      {!guardMomentsOpen && <GuardMomentsEntry onOpen={() => setGuardMomentsOpen(true)} />}
      {guardMomentsOpen && !guardMomentsLoading && guardMoments && (
        <GuardMomentsCard timeline={guardMoments} onClose={() => setGuardMomentsOpen(false)} />
      )}

      {/* 🐘 batch59-a 进行中守护面板 — 固定入口常驻; 卡打开时入口让位 (数据未到时点击等加载) */}
      {!activeGuardsOpen && <ActiveGuardsEntry onOpen={() => setActiveGuardsOpen(true)} />}
      {activeGuardsOpen && !activeGuardsLoading && activeGuards && (
        <ActiveGuardsPanel
          summary={activeGuards}
          latestWin={guardMoments?.months[0]?.moments[0] ?? null}
          onClose={() => setActiveGuardsOpen(false)}
        />
      )}

      {/* 🐘 batch48-c 深夜守护横幅 — 最顶部轻提醒, 高危用户深夜窗口内才出现 */}
      <NightGuardBanner />

      {/* 🐘 batch47-b 今日守护日记卡 — 回访条之下, ledger 数据的每日一句叙事 */}
      <GuardDiaryCard streakDays={buddyState?.streak ?? 0} isDemo={isDemo} />

      {/* === Messages (Virtuoso + indicators) === */}
      <InterceptMedalMoment streakDays={(buddyState?.streak ?? 0) > 0 ? buddyState?.streak : undefined} isDemo={isDemo} />
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        isLoadingHistory={isLoadingHistory}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        firstItemIndex={firstItemIndex}
        mcpNotifications={mcpNotifications}
        buddyState={buddyState}
        virtuosoRef={virtuosoRef}
        onLoadMore={loadMoreMessages}
        onDeleteMessage={deleteMessage}
        userAvatarUrl={user?.user_metadata?.avatar_url as string | undefined}
        onSendMessage={(content) => sendMessage(content)}
      />

      {/* === Input + Quick Replies === */}
      <ChatComposer
        input={input}
        inputRef={inputRef}
        isComposingRef={isComposingRef}
        isDemo={isDemo}
        isLoading={isLoading}
        isLoadingHistory={isLoadingHistory}
        buddyState={buddyState}
        activeChallenge={activeChallenge}
        gradientClass={gradientClass}
        messagesCount={messages.length}
        setInput={setInput}
        onSend={sendMessageWithTaskTracking}
      />

      {/* 🔧 信任存入 fix (Round 106): 挑战通过后的存入弹窗 */}
      {depositDialog && (
        <DepositDialogSection
          depositDialog={depositDialog}
          dreamFunds={buddyState?.dreamFunds}
          onClose={() => { setDepositDialog(null); depositShownRef.current = null; }}
          onDeposited={() => {
            // 存入成功后刷新 buddy state (更新 dream fund 进度 + 代币)
            onBuddyStateRefresh?.();
            // 🔧 PM-FEATURE fix (2026-07-17): 存款成功后跳转到 Me 页面梦想基金模块
            //   让用户真正看到钱进梦想基金了
            //   延迟跳转, 让庆祝动画播放完 (CELEBRATION_DURATION_MS = 4s, 这里 4.5s 后跳转)
            if (onNavigateProfile) {
              depositNavTimerRef.current = setTimeout(() => {
                onNavigateProfile();
              }, 4500);
            }
          }}
        />
      )}

      {/* 🔧 需求九: 沉默时刻 — 挑战完成后 2s 全屏仪式, 完成后弹 DepositDialog (saw) 或结束 (bought) */}
      {silentMoment && (
        <SilentMomentSection
          silentMoment={silentMoment}
          onOpenDeposit={setDepositDialog}
          onChallengePassed={onChallengePassed}
          onComplete={completeSilentMoment}
        />
      )}
    </div>
  );
}
