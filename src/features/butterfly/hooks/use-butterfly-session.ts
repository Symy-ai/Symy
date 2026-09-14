/**
 * useButterflySession — 蝴蝶效应会话管理 Hook（XState 重写版，层面 e/f/g）
 *
 * 职责：
 * - 启动 XState machine（唯一状态源）
 * - return 26 字段从 machine context/actor 派生（签名零变化，normal-player 依赖）
 * - 所有业务逻辑在 session/butterfly-machine.ts + machine-actions.ts + machine-services.ts
 *
 * 支持两种模式：
 * - 正常模式：需要认证，使用 Supabase + Letta Agent
 * - Demo 模式：无需认证，使用预写内容 + 预置 CDN 图片（不调用 AI 图片生成 API）
 *
 * ⚠️ 行为零变化：所有历史 BUG 修复在 machine guards/actions/services 里体现。
 */

'use client';

import { symyEvents } from '@/lib/posthog';
import { useCallback, useEffect, useMemo } from 'react';
import { useMachine } from '@xstate/react';
import { useAuth } from '@/components/auth/auth-provider';
import { useTheme } from 'next-themes';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';
import { getDemoSceneIllustrations } from '../lib/demo-content';
import type {
  ButterflyUIState,
  CreateSessionParams,
} from '../types';
// C1 拆分：类型/常量/纯辅助函数移到 ./session 子目录
// XState 完整重写：machine + actions + services/guards
import type { UseButterflySessionReturn } from './session';
// eslint-disable-next-line no-duplicate-imports
import { API, DEMO_API, butterflyMachine, type ButterflyEndpoints } from './session';

// re-export 返回类型，保持外部 import 路径不变
export type { UseButterflySessionReturn };

// ============================================================
// Hook
// ============================================================

export function useButterflySession(demoMode?: boolean): UseButterflySessionReturn {
  const { user, signOut } = useAuth();
  const isDemo = !!demoMode;
  const { locale } = useI18n();

  // V19: Detect light/dark theme for SVG illustration generation
  // V28: 添加 mounted 检查防止 SSR hydration 不匹配
  const { resolvedTheme } = useTheme();
  // machine input 只需 isLight 布尔值，mounted 检查在 useTheme 内部处理
  // SSR 时 resolvedTheme 为 undefined → isLight=false（与原逻辑一致）
  const isLight = resolvedTheme === 'light';

  // API endpoints based on mode
  const endpoints: ButterflyEndpoints = isDemo ? DEMO_API : API;

  // ── 启动 XState machine（唯一状态源）──
  // input 在启动时传入，machine context 初始化用
  const [state, send] = useMachine(butterflyMachine, {
    input: {
      isDemo,
      endpoints,
      userId: user?.id || null,
      isLight,
      locale,
    } as Partial<import('./session').ButterflyMachineContext>,
  });

  // 🔧 ARCH fix (C3 — useMachine input not synced after mount):
  //    XState v5 useMachine input 只用于初始化 context。user 登录后/主题切换后,
  //    context.userId/isLight 不更新 → canCreateSession guard 返回 false → 用户无法创建会话。
  //    根因修复: useEffect 监听变化, 发 SYNC_CONTEXT 事件让 machine 更新 context。
  useEffect(() => {
    send({ type: 'SYNC_CONTEXT', userId: user?.id || null, isLight, endpoints, locale });
  }, [user?.id, isLight, endpoints, locale, send]);

  const ctx = state.context;

  // 🔧 ARCH fix (Round 13 BUG-8): 401 auth expired → 自动 signOut
  //    machine 的 assignAuthExpired 设 errorDetail='AUTH_EXPIRED_401', 此 effect 监听并触发 signOut
  useEffect(() => {
    if (ctx.errorDetail === 'AUTH_EXPIRED_401' && !isDemo) {
      logger.warn('[useButterflySession] Auth expired (401), signing out');
      signOut();
    }
  }, [ctx.errorDetail, signOut, isDemo]);

  // 🔧 架构优化 Round 60: 日志 errorDetail (Finding 6) — 旧代码只写不读, 现在记录到日志供调试
  useEffect(() => {
    if (ctx.errorDetail && ctx.errorDetail !== 'AUTH_EXPIRED_401') {
      logger.warn('[useButterflySession] Machine error detail:', ctx.errorDetail);
    }
  }, [ctx.errorDetail]);

  // ============================================================
  // return 26 字段从 context/actor 派生（签名零变化）
  // ============================================================

  // ── uiState：从 machine state + context 构造 ButterflyUIState ──
  // phase 由 machine 状态名映射（state.matches 或 state.value）
  const uiState = useMemo<ButterflyUIState>(() => {
    // machine state → ButterflyUIState.phase 映射
    let phase: ButterflyUIState['phase'] = 'idle';
    const sv = state.value as string;
    if (sv === 'generating_outline') phase = 'generating_outline';
    else if (sv === 'streaming') phase = 'streaming';
    else if (sv === 'choosing' || sv === 'submitting_choice') phase = 'choosing';
    else if (sv === 'continuing') phase = 'streaming';  // continuing 视为 streaming（等预加载/fallback）
    else if (sv === 'complete') phase = 'complete';
    else if (sv === 'regenerating') phase = 'complete';  // regenerating 从 complete 进入，保持 complete
    else if (sv === 'error') phase = 'idle';  // error → idle（原逻辑 error 时 phase idle）
    else phase = 'idle';

    return {
      phase,
      isLoading: ctx.isLoading,
      streamingText: ctx.streamingText,
      currentChapterIndex: ctx.currentChapterIndex,
      error: ctx.error,
      outlineVisible: ctx.outlineVisible,
    };
  }, [state.value, ctx.isLoading, ctx.streamingText, ctx.currentChapterIndex, ctx.error, ctx.outlineVisible]);

  // ── streamingSceneIllustrations：Demo 模式流式期间场景插图 ──
  // V4: Demo模式 — 流式输出期间，立即提供场景插图（预置CDN URL）
  const streamingSceneIllustrations = useMemo(() => {
    if (!isDemo || !ctx.currentChapterInfo) return undefined;
    return getDemoSceneIllustrations(ctx.currentChapterInfo.chapterIndex);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [isDemo, ctx.currentChapterInfo?.chapterIndex]);

  // ── regeneratingChapters/generatingSceneIllustrations：数组转 Set ──
  // machine context 用 number[]/string[]，return 类型是 Set（向后兼容 normal-player）
  const regeneratingChapters = useMemo(() => new Set(ctx.regeneratingChapters), [ctx.regeneratingChapters]);
  const generatingSceneIllustrations = useMemo(() => new Set(ctx.generatingSceneIllustrations), [ctx.generatingSceneIllustrations]);

  // ── 用户动作 handlers（send 薄壳）──
  // eslint-disable-next-line require-await -- async for API consistency
  const createSession = useCallback(async (params: CreateSessionParams) => {
    send({ type: 'CREATE_SESSION', params });
    symyEvents.butterflySessionStarted({ isDemo });
  }, [send, isDemo]);

  // eslint-disable-next-line require-await -- async for API consistency
  const continueStory = useCallback(async () => {
    send({ type: 'CONTINUE' });
  }, [send]);

  // eslint-disable-next-line require-await -- async for API consistency
  const submitChoice = useCallback(async (chapterIndex: number, selectedOption: string) => {
    send({ type: 'SUBMIT_CHOICE', chapterIndex, selectedOption });
    symyEvents.butterflyChoiceSelected({ chapterIndex, choiceId: selectedOption });
  }, [send]);

  const toggleOutline = useCallback(() => {
    send({ type: 'TOGGLE_OUTLINE' });
  }, [send]);

  const reset = useCallback(() => {
    // 🔧 NEW-SSS fix: 只在有活跃 session 时才发 DELETE, 防止页面加载时误删
    // 🔧 ARCH fix (Round 11 C4 — DELETE fire-and-forget race):
    //    旧代码 fetch(endpoints.session, { method: 'DELETE' }) 不传 sessionId →
    //    DELETE route abandon ALL active sessions。若用户点 "Abandon" 后立即点
    //    "Start New", POST /session 创建新会话, 然后 fire-and-forget DELETE 完成 →
    //    新会话被误标 abandoned, 用户开始新盲盒后立即看到 "session not active" 错误。
    //    根因修复: 传当前 sessionId 到 DELETE body, route 只 abandon 该 session。
    //    仍保持 fire-and-forget (不阻塞 RESET), 但即使 DELETE 后完成也不会误伤新会话。
    if (!isDemo && ctx.userId && ctx.session) {
      fetch(endpoints.session, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: ctx.session.id }),
      }).catch(() => {
        // 静默失败 — 不影响客户端重置 (即使 DELETE 失败, abandoned session 下次 LOAD_ACTIVE 会被忽略)
      });
    }
    send({ type: 'RESET' });
  }, [send, isDemo, ctx.userId, endpoints.session, ctx.session]);

  // eslint-disable-next-line require-await -- async for API consistency
  const loadActiveSession = useCallback(async () => {
    send({ type: 'LOAD_ACTIVE' });
  }, [send]);

  // eslint-disable-next-line require-await -- async for API consistency
  const regenerateIllustration = useCallback(async (chapterIndex: number): Promise<string | null> => {
    send({ type: 'REGENERATE_ILLUSTRATION', chapterIndex });
    // 注意：regenerateService 是 fromPromise，结果通过 REGENERATE_DONE 事件更新 context
    // 返回 null（实际 URL 通过 ctx.completedChapters 更新，normal-player 不依赖返回值）
    return null;
  }, [send]);

  // eslint-disable-next-line require-await -- async for API consistency
  const preloadNextChapter = useCallback(async () => {
    send({ type: 'PRELOAD_NEXT_CHAPTER' });
  }, [send]);

  const clearPreloadedStoryComplete = useCallback(() => {
    send({ type: 'CLEAR_PRELOADED_STORY_COMPLETE' });
  }, [send]);

  // 🔧 ARCH fix (Round 6 XState H6): retry — 从 error 状态恢复, 不丢进度
  const retry = useCallback(() => {
    send({ type: 'RETRY' });
  }, [send]);

  // ============================================================
  // return 26 字段（签名零变化，normal-player 依赖）
  // ============================================================
  return {
    session: ctx.session,
    uiState,
    streamingText: ctx.streamingText,
    currentChapterInfo: ctx.currentChapterInfo,
    pendingChoice: ctx.pendingChoice,
    storyComplete: ctx.storyComplete,
    completedChapters: ctx.completedChapters,
    outlineVisible: ctx.outlineVisible,
    createSession,
    continueStory,
    submitChoice,
    toggleOutline,
    reset,
    loadActiveSession,
    regenerateIllustration,
    regeneratingChapters,
    generatingSceneIllustrations,
    streamingSceneIllustrations,
    // V19: Pre-loading
    preloadedChapterData: ctx.preloadedChapterData,
    isPreloading: ctx.isPreloading,
    preloadedBranches: ctx.preloadedBranches,
    preloadNextChapter,
    // V32: Pre-loaded story complete data
    preloadedStoryComplete: ctx.preloadedStoryComplete,
    clearPreloadedStoryComplete,
    retry,  // 🔧 Round 6 H6: 从 error 状态恢复
    userId: user?.id || null,  // 🔧 Round 28: 暴露 userId 让 player 检测登录
  };
}


