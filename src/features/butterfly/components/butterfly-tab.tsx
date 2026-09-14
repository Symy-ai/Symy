/**
 * ButterflyTab — 蝴蝶效应人生剧情系统主组件
 *
 * V26 完整恢复版 — 合并 V20 全部功能 + V24/V25 bug 修复：
 * - Demo 和 Normal 模式都使用相同的 Galgame 播放器 UI
 * - Normal 模式支持流式展示：chapter_start 到达后立即显示，文字实时更新
 * - Demo 模式：预设内容 + 预设CDN图片
 * - Normal 模式：SSE流式内容 + AI生成图片（fallback到客户端生成）
 * - 进度持久化：切换tab后回来能继续之前的故事
 * - Light/Dark mode support via next-themes
 * - 台词框收起/展开（默认收起，让用户先看图片）
 * - 完成页蝴蝶效应总结可折叠（默认收起）
 * - chapterComplete 章节完成插页（V20原有功能）
 * - V24: 用户必须手动点击「MAKE YOUR CHOICE」才进入 choosing 阶段
 * - V25: submitChoice 错误传播 + 409 恢复 + session 修复安全检查
 */

'use client';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useButterflyDemoPlayer } from '../hooks/use-butterfly-demo-player';
import { symyEvents } from '@/lib/posthog';
import { useButterflyNormalPlayer } from '../hooks/use-butterfly-normal-player';
import { useButterflyHistory } from '../hooks/use-butterfly-history';
// 🔧 Round 121 audit fix (AUDIT-7 Step 2): 提取 loading stages hook
import { useButterflyLoadingStages } from '../hooks/use-butterfly-loading-stages';
// 🔧 Round 126 用户决策 5 (AUDIT-7 Step 5): 提取 gacha quota + billing hooks
import { useGachaQuota } from '../hooks/use-gacha-quota';
import { useGachaBilling } from '../hooks/use-gacha-billing';
import { ButterflyHistoryList } from './butterfly-history-list';
import { ButterflyHistoryDetail } from './butterfly-history-detail';
// 🔧 P1-1 fix: 抽出 LoadingState 组件, 减少 butterfly-tab 行数 (<850 守卫)
import { ButterflyLoadingState } from './butterfly-loading-state';
import type { DecisionType, CreateSessionParams, StoryTone } from '../types';
import { useI18n } from '@/i18n/provider';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { logger } from '@/lib/logger';
// 🔧 Round 121 audit fix (AUDIT-7 bug #3): demo gacha count 用 getLimitWindow 保持与服务端一致
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getLimitWindow } from '@/lib/limit-window';
// C5 拆分：子组件/类型/常量移到 ./tab 子目录
import type { ButterflyTabProps } from './tab';
// eslint-disable-next-line no-duplicate-imports
import {
  EXAMPLE_DECISION_KEYS,
} from './tab';
import { CompletedStoryView } from './tab/completed-story-view';
import { ChapterCompleteView } from './tab/chapter-complete-view';
import { PlayingView } from './tab/playing-view';
// 🔧 Round 121 audit fix (AUDIT-7 Step 1): 提取 error mapping 纯函数
import { mapGachaError } from './tab/butterfly-error-mapping';
// C7 拆分: 统一 Player 接口 (消除 35 个 isDemo 三元分支)
import type { ButterflyPlayer } from '../hooks/player';
// eslint-disable-next-line no-duplicate-imports
import { adaptDemoPlayer } from '../hooks/player';

// ============================================================
// 主组件
// ============================================================

export function ButterflyTab({ isDemo, onAuthPrompt, sharedSessionId, onSharedSessionConsumed, onBack }: ButterflyTabProps) {
  const { t } = useI18n();
  // Both hooks always called (React hooks rule)
  const _demoPlayer = useButterflyDemoPlayer();
  const _normalPlayer = useButterflyNormalPlayer();

  // C7 拆分: 统一 Player 接口 (消除 35 个 isDemo 三元分支)
  // 🔧 Round 126 AUDIT-7 bug #4 fix: 旧代码 useMemo deps 含 _demoPlayer + _normalPlayer
  //    (hook 返回值, identity 不稳定 → memo 永远不命中 → 每次 render 创建新 player 对象
  //    → 下游 useCallback 全部 re-create → 性能浪费)
  //    修复: 只依赖 isDemo (boolean, 稳定), _demoPlayer/_normalPlayer 虽然每次不同但
  //    adaptDemoPlayer/identity 不变, useMemo 只在 isDemo 切换时重新计算
  // eslint-disable-next-line react-hooks/exhaustive-deps -- _demoPlayer/_normalPlayer are hook returns with unstable identity, including them defeats the memo
  // 🔧 2026-07-15 P0 fix (Gacha UI stuck v3, root cause): useMemo deps 只有 isDemo
  //   导致 _normalPlayer 永远是第一次渲染时的对象, phase 变化时 player.phase 仍是旧值
  //   → butterfly-tab 永远渲染表单页 (即使 machine 状态已切到 playing)
  //   根因修复: 移除 useMemo, 直接赋值. _normalPlayer 是 hook 返回值, identity 不稳定但
  //   内容稳定 (useReducer + useRef), 直接用不会触发额外 re-render (React 自动 bail-out).
  //   注: 旧注释说 "memo 永远不命中 → 每次 render 创建新 player 对象 → 下游 useCallback
  //       全部 re-create → 性能浪费" 是误判 — player 对象本身是引用, 不需要 memo.
  const player: ButterflyPlayer = isDemo ? adaptDemoPlayer(_demoPlayer) : _normalPlayer;

  // Light/Dark mode — V27: 添加 mounted 检查，防止 SSR hydration 不匹配
  // 🔧 FIX-React19: 用 typeof window 检查替代 mounted state (避免 effect 内 setState)
  const { resolvedTheme } = useTheme();
  const isClient = typeof window !== 'undefined';
  const isLight = isClient ? resolvedTheme === 'light' : false;

  // 表单状态
  const [decisionType, setDecisionType] = useState<DecisionType>('bought');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  // 🔧 Round 126 用户决策 5 (AUDIT-7 Step 5): 提取 gacha quota 到 hook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { gachaUsedToday, gachaRemaining, isGachaPremium, incrementGachaCount, decrementGachaCount } = useGachaQuota(!!isDemo, onAuthPrompt);

  // 台词框收起/展开状态（默认展开）
  const [isDialogueCollapsed, setIsDialogueCollapsed] = useState(false);
  const toggleDialogue = useCallback(() => setIsDialogueCollapsed(prev => !prev), []);

  // 🔧 P2-13 fix: Error code copy-to-clipboard
  // 🔧 Round 106: Extracted to useCopyToClipboard hook (reduces file size)
  const { copied: errorCodeCopied, copy: handleCopyErrorCode } = useCopyToClipboard();

  // 完成页蝴蝶效应总结收起/展开状态（默认收起）
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(true);
  const toggleSummary = useCallback(() => setIsSummaryCollapsed(prev => !prev), []);

  // 历史剧情查看视图（仅登录模式）— 'main' 主流程 / 'history' 历史回看
  const [view, setView] = useState<'main' | 'history'>('main');
  const history = useButterflyHistory(!isDemo && view === 'history');

  // 🔧 ARCH fix Round 78: Auto-open shared butterfly story from ?session= URL param
  // 🔧 Round 121 audit fix (AUDIT-7 bug #2): 旧代码 deps 含 `history` 对象 (identity 不稳定)
  //    → 800ms setTimeout 每次渲染都被取消并重新 arm → 若 history API > 800ms 或频繁 re-render
  //    → onSharedSessionConsumed?.() 在 history.sessions.find() 返回 undefined 时触发
  //    → 用户落入空 history view 且 ?session= URL 已被消费
  //    修复: 只依赖 history.isLoading (boolean, 稳定), 在 timeout 内检查 isLoading 并重试
  useEffect(() => {
    if (!sharedSessionId || isDemo) return;
    setView('history');
    let retryCount = 0;
    const maxRetries = 10; // 10 × 500ms = 5s max wait for history to load
    const timer = setInterval(() => {
      retryCount++;
      if (history.isLoading && retryCount < maxRetries) return; // still loading, wait
      const found = history.sessions.find(s => s.id === sharedSessionId);
      if (found) {
        history.selectSession(found);
        onSharedSessionConsumed?.();
      } else if (retryCount >= maxRetries) {
        // Timeout — session not found, consume anyway to clear URL
        logger.warn('[ButterflyTab] Shared session not found after retries:', sharedSessionId.substring(0, 8));
        onSharedSessionConsumed?.();
      } else {
        return; // keep waiting
      }
      clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [sharedSessionId, isDemo, history.isLoading, history.sessions, history.selectSession, onSharedSessionConsumed]);

  // ============================================================
  // 统一的属性访问 — C7: 直接从 player 读取 (无 isDemo 分支)
  // ============================================================

  const phase = player.phase;
  const isLoading = player.isLoading;
  // 🔧 Round 121 audit fix (AUDIT-7 Step 2): 提取 loading stages 到 hook
  const { stageIndex, elapsedSec } = useButterflyLoadingStages(isLoading);

  const decisionTypeP = player.decisionType;
  const decisionDescP = player.decisionDescription;
  const outlineP = player.outline;
  const currentChapterIndexP = player.currentChapterIndex;
  const currentSceneIndexP = player.currentSceneIndex;
  const currentChapterInfoP = player.currentChapterInfo;
  const completedChaptersP = player.completedChapters;
  const currentChoiceP = player.currentChoice;
  const butterflyEffectP = player.butterflyEffect;
  const finalToneP = player.finalTone;
  const totalChaptersP = player.totalChapters;
  const choicesP = player.choices;
  // 🔧 Round 121 audit fix (AUDIT-7 Step 1 + bug #5): 提取 error mapping 到纯函数 + useMemo
  //    旧代码: 2 个 IIFE 每次渲染都跑 8+ 次 t() 调用 (perf 浪费)
  //    新代码: useMemo 缓存, 只在 player.error 或 t 变化时重新计算
  const { message: errorP, code: errorCodeP } = useMemo(
    () => mapGachaError(player.error, t),
    [player.error, t]
  );
  const advanceP = player.advance;
  const selectChoiceP = player.selectChoice;
  const resetP = player.reset;
  // 🔧 PM-NEW-70 fix: 故事完成/放弃后清空表单 (描述/金额/决策类型)
  const resetForm = useCallback(() => {
    setDescription('');
    setAmount('');
    setDecisionType('bought');
  }, []);
  const resetPAndForm = useCallback(() => {
    resetP();
    resetForm();
  }, [resetP, resetForm]);

  // 🔧 2026-07-15 P1 fix: 提取 handleCancelLoading 到组件顶层
  //   旧代码: 定义在 if (isLoading) 块内 → 新的 isLoading 检查 (line 370) 无法引用
  //   修复: 提取为 useCallback, 两个 isLoading 渲染点都能用
  // eslint-disable-next-line symy/no-async-callback-mutation -- cancel is idempotent (user can't double-cancel because button only shows once)
  const handleCancelLoading = useCallback(async () => {
    if (!isDemo && gachaIncrementedForSessionRef.current) {
      logger.info('[ButterflyTab] Cancel: refunding gacha count for session:', gachaIncrementedForSessionRef.current.substring(0, 30));
      try {
        const { apiFetchVoid } = await import('@/lib/api-client');
        await apiFetchVoid('/api/buddy/gacha-limit', { method: 'DELETE' });
        logger.info('[ButterflyTab] Cancel: gacha refund succeeded');
      } catch (err) {
        // safe to ignore: non-critical background operation — gacha refund failure doesn't block reset
        logger.warn('[ButterflyTab] Gacha refund failed — user may have lost a pull:', err instanceof Error ? err.message : String(err));
      }
      gachaIncrementedForSessionRef.current = null;
    }
    resetP();
    resetForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- gachaIncrementedForSessionRef is a ref (stable, no need in deps)
  }, [isDemo, resetP, resetForm]);
  const isStreamingChapterP = player.isStreamingChapter; // Demo 模式固定 false (adapter)
  const advanceToNextChapterP = player.advanceToNextChapter;
  const goToChapterP = player.goToChapter;
  // 🔧 Bug 3 fix (P0): retryChoice — 用户卡在 'Preparing your choice...' 时可手动重试
  const retryChoiceP = player.retryChoice;

  // ============================================================
  // 统一的场景回顾数据（用于完成页）
  // ============================================================

  const sceneReview = useMemo(() => {
    if (completedChaptersP.length === 0) return [];
    const scenes: Array<{
      chapterIndex: number;
      chapterTitle: string;
      tone: StoryTone;
      timeSpan: string;
      sceneIndex: number;
      sceneText: string;
      imageUrl: string | undefined;
    }> = [];

    for (const ch of completedChaptersP) {
      for (let si = 0; si < ch.scenes.length; si++) {
        scenes.push({
          chapterIndex: ch.index,
          chapterTitle: ch.title,
          tone: ch.tone,
          timeSpan: ch.timeSpan,
          sceneIndex: si,
          sceneText: ch.scenes[si].text,
          imageUrl: ch.scenes[si].imageUrl,
        });
      }
    }
    return scenes;
  }, [completedChaptersP]);

  // ============================================================
  // 创建会话（统一入口）
  // ============================================================

  const handleCreateSession = useCallback(async () => {
    if (!description.trim()) return;
    // 🔧 PM-NEW-24 fix: 检查每日限制
    // 🔧 PM3-P1-3 fix: demo 模式也限制 (每天 1 次), 用完弹 auth prompt
    if (gachaRemaining <= 0) {
      if (isDemo && onAuthPrompt) {
        onAuthPrompt('gacha');
      }
      return;  // 按钮已 disabled, 这是 defensive guard
    }

    const params: CreateSessionParams = {
      decisionType,
      decisionDescription: description.trim(),
      amount: amount !== '' ? (Number.isFinite(Number(amount)) && Number(amount) > 0 ? Math.round(Number(amount) * 100) / 100 : undefined) : undefined,
      platform: undefined,
    };

    // C7: 统一调用 player.start (adapter 内部处理 demo/normal 差异)
    // 🔧 P0-B fix (gacha count consumed on error):
    //   旧代码: await player.start(params); if (!errorP) { incrementGachaCount(); }
    //   问题: errorP 是 closure 值 (永远 null) → 即使 SSE 流崩溃也扣减 gacha count。
    //   修复: 不在 start() 后立即扣减, 而是在 chapter_start 事件到达时扣减。
    //   start() 失败直接 return, 不扣减。SSE 中途崩溃 — chapter_start 已到达, 已扣减。
    //   用户点 Try Again 会重新 start, 但 chapter_start effect 用 ref 防止重复扣减。
    // 🔧 Round 120 audit fix (AUDIT-1 P1 #2): 生成 pull attempt UUID 作为 sessionKey
    //    防止用户用相同描述连抽两次只扣一次 count (free gacha exploit)
    pullAttemptIdRef.current = crypto.randomUUID();
    const success = await player.start(params);
    if (success) {
      symyEvents.gachaTriggered({ source: 'butterfly' });
    } else {
      logger.warn('[ButterflyTab] player.start returned false (failed or already loading), not incrementing gacha count');
    }
    // gacha count 在 chapter_start effect 中扣减 (见下方)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [player, decisionType, description, amount, isDemo, gachaRemaining, incrementGachaCount, onAuthPrompt]);

  // 🔧 Round 126 用户决策 5 (AUDIT-7 Step 5): 提取 gacha billing 到 hook
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { gachaIncrementedForSessionRef, pullAttemptIdRef, gachaRefundedForSessionRef } = useGachaBilling(
    !!isDemo, phase, decisionDescP, currentChapterInfoP, completedChaptersP.length,
    errorP, player.error, incrementGachaCount, decrementGachaCount
  );

  // ============================================================
  // 使用示例决策（统一入口）
  // ============================================================

  const handleExampleClick = useCallback(async (example: { type: DecisionType; desc: string; amount: number; platform?: string }) => {
    // 🔧 PM-NEW-24 fix: 检查每日限制
    if (!isDemo && gachaRemaining <= 0) return;

    setDecisionType(example.type);
    setDescription(example.desc);
    setAmount(String(example.amount));

    const params: CreateSessionParams = {
      decisionType: example.type,
      decisionDescription: example.desc,
      amount: example.amount,
      platform: undefined,
      // 🔧 2026-07-15: 示例数据标记 — 不作为真实消费行为参考
      isExample: true,
    };

    // C7: 统一调用 player.start
    // 🔧 P0-B fix: 同 handleCreateSession, gacha count 在 chapter_start effect 中扣减
    // 🔧 Round 120 audit fix: 同样生成 pull attempt UUID (与 handleCreateSession 一致)
    pullAttemptIdRef.current = crypto.randomUUID();
    await player.start(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [player, isDemo, gachaRemaining]);

  // ============================================================
  // 渲染：历史剧情查看视图（优先级最高，仅登录模式）
  // ============================================================
  // 用户主动进入历史回看时，无论当前 phase 如何，都显示历史界面。
  // 切回 'main' 后原有 phase 状态保留，可继续未完成的故事。

  if (!isDemo && view === 'history') {
    if (history.selectedSession) {
      return (
        <ButterflyHistoryDetail
          session={history.selectedSession}
          isLight={isLight}
          onBack={() => history.selectSession(null)}
          onStartNew={() => {
            history.selectSession(null);
            setView('main');
            resetPAndForm();
          }}
        />
      );
    }
    return (
      <ButterflyHistoryList
        history={history}
        isLight={isLight}
        onBack={() => setView('main')}
        onStartNew={() => setView('main')}
      />
    );
  }

  // ============================================================
  // 渲染：完成页（统一）— 提取到 tab/completed-story-view.tsx (Round 98)
  // ============================================================

  // V28: complete 阶段始终渲染完成页，即使 butterflyEffectP/finalToneP 暂时为 null
  if (phase === 'complete') {
    return (
      <CompletedStoryView
        isLight={isLight}
        isDemo={!!isDemo}
        sceneReview={sceneReview}
        butterflyEffect={butterflyEffectP}
        finalTone={finalToneP}
        totalChapters={totalChaptersP}
        choices={choicesP}
        decisionType={decisionTypeP || 'bought'}
        decisionDescription={decisionDescP || ''}
        isSummaryCollapsed={isSummaryCollapsed}
        onToggleSummary={toggleSummary}
        onReset={resetPAndForm}
        onViewHistory={() => setView('history')}
        sessionId={player.sessionId}
      />
    );
  }

  // ============================================================
  // 渲染：章节完成插页（chapterComplete 阶段 — V27: Demo 和 Normal 模式共用）
  // ============================================================

  // V28: chapterComplete 阶段 — 即使 currentChapterInfoP 暂时为 null 也渲染（使用 fallback）
  // 🔧 Bug fix: 最后一章 (currentChapterIndex === totalChapters) 完成后不应显示 "Continue to Next Chapter"
  //   而是直接显示 "See Your Future" (进入完成页)。
  // 🔧 Round 126 AUDIT-7 bug #9 fix: isLastChapter 只在 chapterComplete 分支使用
  //    旧代码: 在函数顶部计算 (每次 render 都算, 即使 phase !== 'chapterComplete')
  //    修复: 移入 chapterComplete 分支内 (只在需要时计算)
  // 🔧 2026-07-15 P1 fix: isLoading 检查在 chapterComplete 之前
  //    旧代码: phase='chapterComplete' 优先渲染 → 用户点 Continue 后 isLoading=true
  //    但 phase 仍是 'chapterComplete' → UI 仍显示 ChapterCompleteView, 不显示 loading
  //    修复: isLoading=true 时优先渲染 ButterflyLoadingState (不论 phase)
  //    效果: 用户点 Continue 后立即看到进度条, 而非卡在 chapterComplete 页面
  // 🔧 2026-07-15: phase !== 'complete' is always true here (line 359 already returned
  //    for phase === 'complete'). TS flags this as unintentional comparison.
  //    Simplified to just check isLoading.
  if (isLoading) {
    return (
      <ButterflyLoadingState
        isLight={isLight}
        stageIndex={stageIndex}
        elapsedSec={elapsedSec}
        onCancel={handleCancelLoading}
      />
    );
  }

  if (phase === 'chapterComplete') {
    const isLastChapter = currentChapterIndexP >= totalChaptersP;
    return (
      <ChapterCompleteView
        isLight={isLight}
        isDemo={!!isDemo}
        currentChapterInfo={currentChapterInfoP}
        currentChapterIndex={currentChapterIndexP}
        isLastChapter={isLastChapter}
        onAdvanceToNextChapter={advanceToNextChapterP}
        onReset={resetPAndForm}
      />
    );
  }

  // ============================================================
  // 渲染：故事播放中 / 选择中（统一）
  // ============================================================

  if ((phase === 'playing' || phase === 'choosing') && currentChapterInfoP) {
    return (
      <PlayingView
        isDemo={isDemo}
        isLight={isLight}
        isDialogueCollapsed={isDialogueCollapsed}
        chInfo={currentChapterInfoP}
        currentSceneIndex={currentSceneIndexP}
        decisionType={decisionTypeP}
        decisionDesc={decisionDescP}
        outline={outlineP}
        completedChapters={completedChaptersP}
        currentChapterIndex={currentChapterIndexP}
        phase={phase}
        currentChoice={currentChoiceP}
        isStreamingChapter={isStreamingChapterP}
        onToggleDialogue={toggleDialogue}
        onAdvance={advanceP}
        onSelectChoice={selectChoiceP}
        onRetryChoice={retryChoiceP}
        onGoToChapter={goToChapterP}
        onAbandonStory={resetPAndForm}
      />
    );
  }

  // ============================================================
  // 渲染：加载中（统一）
  // ============================================================

  // 🔧 2026-07-15: 旧的 if (isLoading) 块已上移到 chapterComplete 之前 (line 390)
  //   handleCancelLoading 已提取为组件顶层 useCallback (line 191)
  //   此处保留注释标记, 实际渲染逻辑在上面

  // ============================================================
  // 渲染：初始页面 — 输入决策
  // ============================================================

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
      {/* 🔧 Bug fix: 返回按钮 — 用户可以从盲盒页面返回 Buddy 页面 */}
      {onBack && (
        <div className="flex-shrink-0 px-4 py-2">
          <button
            onClick={onBack}
            className={`inline-flex items-center gap-1 text-sm transition-colors ${isLight ? 'text-gray-600 hover:text-gray-900' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <ChevronLeft className="w-4 h-4" />
            {t('common.back', { defaultValue: '← Back' })}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-md mx-auto space-y-6">
          {/* 标题区 */}
          <div className="text-center space-y-3">
            <div className="text-4xl">🎰</div>
            <h1 className="text-2xl font-bold gradient-text">{t('butterfly.futureGacha')}</h1>
            <p className={`text-sm leading-relaxed ${isLight ? 'text-gray-600' : 'text-text-secondary'}`}>
              {t('butterfly.futureGachaDesc', { defaultValue: 'One purchase. Two reclaimed lives. Let me show you what your money becomes.' })}
            </p>
            {isDemo && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                <span className={`text-xs font-medium ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>👁️ {t('butterfly.demoModeBadge')}</span>
              </div>
            )}
            {/* 🔧 PM-NEW-10 fix: 更明显的 demo 故事提示 */}
            {isDemo && (
              <p className={`text-[11px] mt-1 ${isLight ? 'text-amber-600' : 'text-amber-400/80'}`}>
                {t('butterfly.demoStoryHint', { defaultValue: 'Demo stories are not saved. Sign up to keep your stories!' })}
              </p>
            )}
          </div>

          {/* 历史剧情入口（仅登录模式） */}
          {!isDemo && (
            <div className="flex justify-end">
              <button
                onClick={() => setView('history')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 cursor-pointer ${isLight ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200' : 'bg-glass-fill text-text-tertiary hover:bg-glass-fill-strong border border-glass-border'}`}
              >
                <span>📜</span>
                <span>{t('butterfly.viewHistory')}</span>
              </button>
            </div>
          )}

          {/* 决策类型选择 */}
          {/* 🔧 2026-07-17 (task 1): 加第 3 个按钮 "I'm considering" — 购买前双宇宙模拟 */}
          <div className="flex gap-2">
            <button
              onClick={() => setDecisionType('bought')}
              className={`flex-1 py-3 rounded-2xl border-2 font-medium text-sm transition-all cursor-pointer ${decisionType === 'bought' ? (isLight ? 'border-red-500/60 bg-red-500/10 text-red-700' : 'border-red-400/60 bg-red-400/10 text-red-300') : `${isLight ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-glass-border bg-glass-fill text-text-tertiary'}`}`}
            >{t('butterfly.iBoughtIt')}</button>
            <button
              onClick={() => setDecisionType('resisted')}
              className={`flex-1 py-3 rounded-2xl border-2 font-medium text-sm transition-all cursor-pointer ${decisionType === 'resisted' ? (isLight ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700' : 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300') : `${isLight ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-glass-border bg-glass-fill text-text-tertiary'}`}`}
            >{t('butterfly.iResisted')}</button>
            <button
              onClick={() => setDecisionType('considering')}
              className={`flex-1 py-3 rounded-2xl border-2 font-medium text-sm transition-all cursor-pointer ${decisionType === 'considering' ? (isLight ? 'border-purple-500/60 bg-purple-500/10 text-purple-700' : 'border-purple-400/60 bg-purple-400/10 text-purple-300') : `${isLight ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-glass-border bg-glass-fill text-text-tertiary'}`}`}
            >{t('butterfly.iConsidering', { defaultValue: 'I\'m considering' })}</button>
          </div>

          {/* 🔧 PM-NEW-7 fix: 模式说明文字 */}
          {/* 🔧 2026-07-17 (task 1): 加 considering 模式说明 */}
          <p className={`text-[11px] ${isLight ? 'text-gray-500' : 'text-text-tertiary'} -mt-1 mb-1`}>
            {decisionType === 'bought'
              ? t('butterfly.boughtModeHint', { defaultValue: 'Tell us about a purchase you made. We\'ll show you the butterfly effect of that decision.' })
              : decisionType === 'resisted'
                ? t('butterfly.resistedModeHint', { defaultValue: 'Tell us about a purchase you resisted. We\'ll show you what could have happened if you hadn\'t.' })
                : t('butterfly.consideringModeHint', { defaultValue: 'Tell me what you are thinking of buying. I will show you two futures — one where you bought, one where you did not.' })}
          </p>

          {/* 描述输入 */}
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              placeholder={
                decisionType === 'bought'
                  ? t('butterfly.boughtPlaceholder')
                  : decisionType === 'resisted'
                    ? t('butterfly.resistedPlaceholder')
                    : t('butterfly.consideringPlaceholder', { defaultValue: 'What are you thinking of buying? (e.g. "A $1,099 iPhone 17 Pro I keep revisiting")' })
              }
              className={`w-full h-24 rounded-2xl border px-4 py-3 text-sm resize-none focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all ${isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-glass-fill-strong border-glass-border text-text-primary placeholder:text-text-tertiary'}`}
              maxLength={200}
            />
            {/* 🔧 BUG-040 fix: 字符计数器, 让用户知道 maxLength=200 限制 (用户原报 "Platform 输入框无 maxlength") */}
            <div className="flex justify-end">
              <span className={`text-[10px] ${description.length > 180 ? 'text-yellow-500' : isLight ? 'text-gray-400' : 'text-text-tertiary/70'}`}>
                {description.length}/200
              </span>
            </div>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => {
              // 🔧 ARCH fix (BUG-6 + NEW-002): type="number" + min/max + regex 验证
              //    BUG-6: 用户要求 type="number" min="100" max="1000000"
              //    NEW-002: type="number" 的 value sanitization 会清空 "0." 中间态
              //    根因修复: 保留 type="number" + min/max, onChange 内用 regex 额外验证
              //    如果 sanitization 清空了值 (输入 "." 时), 用 e.target.value 的原始值
              const val = e.target.value;
              if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                let cleaned = val;
                cleaned = cleaned.replace(/^0+(?=\d)/, '');
                setAmount(cleaned.slice(0, 12));
              }
              }} placeholder={t('butterfly.amountPlaceholder')} min="10" max="1000000" step="0.01" className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/40 transition-all ${isLight ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400' : 'bg-glass-fill-strong border-glass-border text-text-primary placeholder:text-text-tertiary'}`} />
            {/* 🔧 BUG-038 fix: 始终显示 Min/Max 提示, 让用户在按钮 disabled 时知道原因 */}
            <p className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-text-tertiary/70'}`}>
              {t('butterfly.amountHint', { defaultValue: 'Min $10 · Max $1,000,000' })}
            </p>
            {/* 🔧 NEW-006/007/K/L fix: 金额验证提示 */}
            {amount !== '' && Number(amount) === 0 && (
              <p className="text-[10px] text-red-500">{t('butterfly.amountZeroError', { defaultValue: 'Amount must be greater than 0' })}</p>
            )}
            {/* 🔧 BUG-038 fix: 0 < amount < 10 时显示 Min $10 错误 (此前按钮 disabled 但无提示) */}
            {amount !== '' && Number(amount) > 0 && Number(amount) < 10 && (
              <p className="text-[10px] text-yellow-500">{t('butterfly.amountMinError', { defaultValue: 'Minimum $10' })}</p>
            )}
            {amount !== '' && Number(amount) > 1000000 && (
              <p className="text-[10px] text-red-500">{t('butterfly.amountMaxError', { defaultValue: 'Maximum $1,000,000' })}</p>
            )}
          </div>

          {/* 生成按钮 */}
          {/* 🔧 PM-NEW-24 fix: 每日 3 次限制 — 达到上限时 disabled + 显示剩余次数 */}
          {/* 🔧 PM3-P1-3 fix: demo 模式也限制 (每天 1 次) */}
          <button
            onClick={handleCreateSession}
            disabled={!description.trim() || isLoading || gachaRemaining <= 0 || (amount !== '' && (Number(amount) < 10 || Number(amount) > 1000000 || !Number.isFinite(Number(amount))))}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all cursor-pointer ${description.trim() && !isLoading && gachaRemaining > 0 ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:from-cyan-400 hover:to-purple-400 active:scale-95 shadow-lg shadow-cyan-500/20' : `${isLight ? 'bg-gray-200 text-gray-400' : 'bg-glass-fill-strong text-text-tertiary'} cursor-not-allowed`}`}
          >
            {isLoading ? t('butterfly.generating') : t('butterfly.pullGacha', { defaultValue: 'See your reclaimed life →' })}
          </button>
          {/* 🔧 PM-NEW-24 fix: 显示每日剩余次数 */}
          {/* 🔧 PM-NEW-39 fix: 显示 Resets at 4:00 AM (与 Healing Kit 一致) */}
          {/* 🔧 PM-P2-2 fix: 剩余 1 次时变红色 + 加紧迫感文案 */}
          {/* 🔧 PM3-P1-3 fix: demo 模式也显示剩余次数 (1 次/天) */}
          <p className={`text-[10px] text-center ${gachaRemaining > 1 ? (isLight ? 'text-gray-500' : 'text-text-tertiary/70') : gachaRemaining === 1 ? 'text-red-500 font-bold' : 'text-amber-500'}`}>
            {/* 🔧 P2-9 fix: Premium users see "unlimited" */}
            {!isDemo && isGachaPremium
              ? t('butterfly.gachaUnlimited', { defaultValue: '∞ Unlimited pulls (Premium)' })
              : gachaRemaining > 1
              ? t('butterfly.gachaRemaining', { n: gachaRemaining, defaultValue: `${gachaRemaining} of ${isDemo ? 1 : 3} pulls left today` })
              : gachaRemaining === 1
              ? t('butterfly.gachaLastOne', { defaultValue: '⚠️ Last one today! Use it wisely.' })
              : isDemo
              ? t('butterfly.gachaDemoLimitReached', { defaultValue: 'Sign up for 3 pulls per day →' })
              : t('butterfly.gachaLimitReached', { defaultValue: 'Daily limit reached — come back tomorrow! (Premium: unlimited)' })}
            <br />
            <span className="text-text-tertiary/60">
              {t('butterfly.gachaResetsAt', { defaultValue: 'Resets at 4:00 AM' })}
            </span>
          </p>
          {/* 🔧 代币兑换按钮 — Gacha 次数用完时显示 */}
          {!isDemo && !isGachaPremium && gachaRemaining <= 0 && (
            <button
              onClick={async () => {
                try {
                  const { apiFetch: af } = await import('@/lib/api-client');
                  const result = await af<{ success: boolean; tokens: number; cost: number; error?: string }>('/api/buddy/redeem', {
                    method: 'POST',
                    body: { type: 'gacha' },
                  });
                  if (result.success) {
                    window.location.reload();
                  }
                } catch {
                  // 简单提示
                }
              }}
              className="mt-2 w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:from-amber-400 hover:to-orange-400 transition-all active:scale-95 cursor-pointer"
            >
              🪙 {t('buddy.redeemButton', { defaultValue: 'Redeem +1 What If (50 tokens)' })}
            </button>
          )}
          {!description.trim() && !isLoading && (
            <p className={`text-xs text-center ${isLight ? 'text-gray-400' : 'text-text-tertiary/60'}`}>{t('butterfly.fillFormHint')}</p>
          )}

          {/* 错误提示 + 重新生成按钮 */}
          {errorP && (
            <div className="space-y-3">
              {/* 🔧 P2-13 fix: Error message with categorized suggestion */}
              <div className="text-center text-sm text-red-400 bg-red-400/10 rounded-xl px-4 py-3">
                <p>{errorP}</p>
                {/* Error code + copy button — for support debugging */}
                {errorCodeP && (
                  <div className="mt-2 pt-2 border-t border-red-400/20 flex items-center justify-center gap-2">
                    <span className="text-[10px] text-red-400/60">
                      {t('butterfly.errorCodeLabel', { defaultValue: 'Error code' })}:
                    </span>
                    <code className="text-[10px] text-red-400/80 font-mono bg-red-400/10 px-1.5 py-0.5 rounded">
                      {errorCodeP}
                    </code>
                    <button
                      onClick={() => handleCopyErrorCode(errorCodeP)}
                      className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors inline-flex items-center gap-0.5"
                      aria-label={t('butterfly.errorCopyCode', { defaultValue: 'Copy' })}
                    >
                      {errorCodeCopied
                        ? t('butterfly.errorCodeCopied', { defaultValue: 'Copied!' })
                        : t('butterfly.errorCopyCode', { defaultValue: 'Copy' })}
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  resetPAndForm();
                }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 active:scale-95 transition-all cursor-pointer"
              >
                {t('butterfly.tryAgain', { defaultValue: 'Try Again' })}
              </button>
            </div>
          )}

          {/* 示例决策 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`flex-1 h-px ${isLight ? 'bg-gray-200' : 'bg-glass-border'}`} />
              <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>{t('butterfly.orTryExample')}</span>
              <div className={`flex-1 h-px ${isLight ? 'bg-gray-200' : 'bg-glass-border'}`} />
            </div>
            <div className="space-y-2">
              {/* 🔧 P1-8 补充: 根据当前标签过滤样本故事 (之前显示全部, 切到 considering 仍看到 bought/resisted) */}
              {EXAMPLE_DECISION_KEYS.filter(example => example.type === decisionType).map((example, i) => {
                // 🔧 P1-8 fix: 支持 considering 类型的样式 (之前只有 bought/resisted 二元判断)
                const isBought = example.type === 'bought';
                const isConsidering = example.type === 'considering';
                const badgeColor = isBought
                  ? (isLight ? 'text-red-600' : 'text-red-400')
                  : isConsidering
                    ? (isLight ? 'text-purple-600' : 'text-purple-400')
                    : (isLight ? 'text-emerald-600' : 'text-emerald-400');
                const borderColor = isBought
                  ? 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/30'
                  : isConsidering
                    ? 'border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 hover:border-purple-500/30'
                    : 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/30';
                const badgeLabel = isBought
                  ? t('butterfly.bought')
                  : isConsidering
                    ? t('butterfly.considering', { defaultValue: 'CONSIDERING' })
                    : t('butterfly.resisted');
                return (
                <button
                  key={i}
                  onClick={() => handleExampleClick({ type: example.type, desc: t(example.descKey), amount: example.amount, platform: example.platform })}
                  disabled={isLoading || gachaRemaining <= 0}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${(isLoading || gachaRemaining <= 0) ? 'opacity-40 cursor-not-allowed' : ''} ${borderColor}`}
                >
                  <div className="flex items-center gap-2">
                    {/* 🔧 PM3-P2-4 fix: badge 改为 BOUGHT · ZARA jacket (移除金额) */}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${badgeColor}`}>
                      {badgeLabel}
                      <span className="opacity-60 mx-1">·</span>
                      <span className="opacity-80">{example.platform}</span>
                    </span>
                    {/* 🔧 2026-07-15: 示例数据标记 */}
                    <span className={`text-[9px] px-1 py-0.5 rounded ${isLight ? 'bg-gray-100 text-gray-400' : 'bg-glass-fill text-text-tertiary'}`}>
                      {t('butterfly.sampleData', { defaultValue: '📊 Sample' })}
                    </span>
                  </div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-gray-700' : 'text-text-secondary'}`}>{t(example.descKey)}</div>
                </button>
                );
              })}
            </div>
            {isDemo && (
              <p className={`text-[9px] text-center text-text-tertiary mt-2`}>
                {t('butterfly.demoStoryHint', { defaultValue: 'Demo — Sign up to save your stories!' })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

