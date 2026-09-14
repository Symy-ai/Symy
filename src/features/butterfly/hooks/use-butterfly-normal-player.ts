/**
 * useButterflyNormalPlayer — 正常模式蝴蝶效应播放器 Hook
 *
 * V39 重构（2026-06-30）：19 个 useState → 1 个 useReducer（playerState 集中管理）
 * 保留 refs 供 timeout/callback 同步读取（render 阶段 `ref.current = state`）
 * transitionPhase 保留独立函数（含日志）
 *
 * 职责：
 * 1. 协调 session hook（XState machine）和 UI（butterfly-tab）之间的状态同步
 * 2. 管理播放器自身的状态（phase/currentChapterIndex/currentSceneIndex 等）
 * 3. 处理用户交互（advance/selectChoice/start/reset/advanceToNextChapter/goToChapter）
 *
 * V29: 修复 chapterComplete → advanceToNextChapter 后 chapter_start effect 被跳过的 bug
 *      （continueStory 使用 preloaded data 时 isLoading 被重置为 false，导致 effect 不响应）
 *      放宽 chapter_start effect 条件：在 isLoading 或 chapterComplete phase 时都响应
 *
 * V28: 修复完成页消失 + chapterComplete卡住 + SSR主题
 *
 * 修复：
 * 1. 完成页条件改为只检查 phase==='complete'，butterflyEffect/finalTone 使用 fallback
 * 2. storyComplete 到达时强制进入 complete phase（无论当前在 playing/choosing/chapterComplete）
 * 3. advanceToNextChapter 优先检查故事是否已完成
 * 4. use-butterfly-session 中 isLight 添加 mounted 检查防止 SSR 不匹配
 */

'use client';

import { useCallback, useRef, useEffect, useMemo, useReducer } from 'react';
import { useButterflySession } from './use-butterfly-session';
import type {
  ChoiceOption,
  ButterflySession,
} from '../types';
// C2 拆分：类型/纯辅助函数移到 ./player 子目录
import type {
  SceneData,
  ChapterData,
  NormalPhase,
  UseButterflyNormalPlayerReturn,
} from './player';
// eslint-disable-next-line no-duplicate-imports
import { convertStoryChapterToChapterData, normalPlayerReducer, initialNormalPlayerState, splitScenes } from './player';
import { usePlayerActions } from './player/use-player-actions';
import { DEFAULT_CHAPTER_COUNT } from '../lib/engine';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';

// re-export 类型，保持外部 import 路径不变
export type { SceneData, ChapterData, UseButterflyNormalPlayerReturn };

// ============================================================
// Hook
// ============================================================

export function useButterflyNormalPlayer(): UseButterflyNormalPlayerReturn {
  const { t } = useI18n();
  // ---- SSE 数据源 ----
  const sessionHook = useButterflySession(false);

  // ---- Reducer（集中状态管理，替代 19 个 useState）----
  const [playerState, dispatch] = useReducer(normalPlayerReducer, initialNormalPlayerState);

  // 派生变量（从 reducer state 读取，替代旧 useState 变量）
  const {
    phase,
    decisionType,
    decisionDescription,
    currentChapterIndex,
    currentSceneIndex,
    completedChapters,
    currentChoice,
    butterflyEffect,
    finalTone,
    choices,
    isLoading,
    error,
    isStreamingChapter,
    streamingChapterMeta,
  } = playerState;

  // transitionPhase（保留独立函数，含日志）
  // 🔧 ARCH fix (Round 27 R25-24 — transitionPhase 闭包 phase 过期 → 短路逻辑失效):
  //    旧代码 deps [playerState.phase] → effect 依赖不含 transitionPhase 时用旧闭包。
  //    根因修复: 用 phaseRef (已存在) 读最新值, 无 deps 永远 stable。
  const transitionPhase = useCallback((next: NormalPhase, reason?: string) => {
    if (phaseRef.current === next) return;  // 无变化，跳过 (用 ref 读最新值)
    logger.info(`[NormalPlayer] phase: ${phaseRef.current} → ${next}${reason ? ` (${reason})` : ''}`);
    // 🔧 Bug fix: 同步更新 phaseRef (而非等 useEffect), 防 setTimeout 内 stale closure
    // React 19 禁止 render 中改 ref, 但 transitionPhase 是 callback (不在 render 中), 可以改
    phaseRef.current = next;
    dispatch({ type: 'SET_PHASE', payload: next });
  }, []);  // 无依赖, 永远 stable (phaseRef 保证最新值)

  // ---- Refs ----
  // 🔧 FIX-React19: 所有 ref 同步放到 useEffect 里 (React 19 禁止 render 中改 ref.current)
  // 之前: 在 render 中 `phaseRef.current = phase` (13 处, Compiler 报错)
  // 现在: 用 useEffect 集中同步, ref 落后一拍但 React 19 Compiler 兼容
  // 注意: ref 落后一拍只在 "effect 内读 ref" 场景有问题, 但本 hook 的 ref 主要给
  // callback (start/advance/selectChoice/reset) 用, 这些 callback 在 effect 之后才执行
  const phaseRef = useRef(phase);
  // 🔧 BUG-327 fix: 跟踪 currentChoice 供超时回调读取
  const currentChoiceRef = useRef(currentChoice);
  const currentChapterIndexRef = useRef(currentChapterIndex);
  const currentSceneIndexRef = useRef(currentSceneIndex);
  const completedChaptersRef = useRef(completedChapters);
  const isLoadingRef = useRef(isLoading);
  const choicesRef = useRef(choices);
  const decisionTypeRef = useRef(decisionType);
  const decisionDescRef = useRef(decisionDescription);
  const butterflyEffectRef = useRef(butterflyEffect);
  const finalToneRef = useRef(finalTone);
  const isStreamingChapterRef = useRef(isStreamingChapter);
  // 🔧 BUG-249 fix: streamingChapterMeta ref 同步，避免 effect 中读到过期值
  const streamingChapterMetaRef = useRef(streamingChapterMeta);

  // 🔧 架构优化 Round 63: 拆分 ref-sync 为独立 effects (Finding 17)
  //    旧代码: 单个 useEffect (无 deps) 在每次 render 执行 13 个 ref 赋值
  //    修复: 每个 ref 只在对应 state 变化时更新 — 减少不必要的 ref 赋值
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentChoiceRef.current = currentChoice; }, [currentChoice]);
  useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);
  useEffect(() => { currentSceneIndexRef.current = currentSceneIndex; }, [currentSceneIndex]);
  useEffect(() => { completedChaptersRef.current = completedChapters; }, [completedChapters]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { choicesRef.current = choices; }, [choices]);
  useEffect(() => { decisionTypeRef.current = decisionType; }, [decisionType]);
  useEffect(() => { decisionDescRef.current = decisionDescription; }, [decisionDescription]);
  useEffect(() => { butterflyEffectRef.current = butterflyEffect; }, [butterflyEffect]);
  useEffect(() => { finalToneRef.current = finalTone; }, [finalTone]);
  useEffect(() => { isStreamingChapterRef.current = isStreamingChapter; }, [isStreamingChapter]);
  useEffect(() => { streamingChapterMetaRef.current = streamingChapterMeta; }, [streamingChapterMeta]);

  // 已处理的章节索引集合（避免重复添加）
  const processedChapterIndicesRef = useRef<Set<number>>(new Set());

  // 等待选择标记
  const waitingForChoiceRef = useRef(false);

  // 用户手动点击了「MAKE YOUR CHOICE」标记（V24: 区分自动过渡和手动点击）
  const userClickedForChoiceRef = useRef(false);

  // pendingChoice 的 ref
  const pendingChoiceRef = useRef<{ chapterIndex: number; prompt: string; options: ChoiceOption[] } | null>(null);

  // 🔧 BUG-327 fix: choice 超时 ref
  const choiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // storyComplete 的 ref
  const storyCompleteRef = useRef(sessionHook.storyComplete);

  // 恢复标记（防止重复恢复）
  const hasRestoredRef = useRef(false);

  // loadActiveSession 的 ref（避免 useEffect 依赖不稳定引用）
  const loadActiveSessionRef = useRef(sessionHook.loadActiveSession);

  // BUG-6/7: 追踪 setTimeout 的 ref，组件卸载或 reset 时清理
  const restorationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyNetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔧 ARCH fix (Round 37 H1 — selectChoice 1500ms setTimeout 未追踪, 卸载/reset 时泄漏)
  const preloadAfterChoiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔧 ARCH fix (Round 40 LOW-2 — autoAdvance 800ms + chapterAdvance 100ms setTimeout 未追踪):
  //    旧代码: line 995 + 1012 的 setTimeout 不保存 ref, 卸载/reset 时不清。
  //    根因修复: 用 ref 追踪, cleanup 和 reset 时 clearTimeout (与其它 4 个 timer 一致)。
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapterAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // V35: sessionHook 方法 refs（避免 start/advance 等 callback 依赖不稳定的 sessionHook 对象）
  const sessionHookResetRef = useRef(sessionHook.reset);
  const sessionHookCreateSessionRef = useRef(sessionHook.createSession);
  const sessionHookContinueStoryRef = useRef(sessionHook.continueStory);
  const sessionHookSessionRef = useRef(sessionHook.session);

  // 🔧 FIX-React19: 集中同步 sessionHook 相关 refs (effect 内, Compiler 兼容)
  useEffect(() => {
    storyCompleteRef.current = sessionHook.storyComplete;
    loadActiveSessionRef.current = sessionHook.loadActiveSession;
    sessionHookResetRef.current = sessionHook.reset;
    sessionHookCreateSessionRef.current = sessionHook.createSession;
    sessionHookContinueStoryRef.current = sessionHook.continueStory;
    sessionHookSessionRef.current = sessionHook.session;
  });

  // ============================================================
  // BUG-6/7: 组件卸载时清理所有 setTimeout
  // ============================================================

  useEffect(() => {
    return () => {
      if (restorationTimeoutRef.current) {
        clearTimeout(restorationTimeoutRef.current);
        restorationTimeoutRef.current = null;
      }
      if (safetyNetTimeoutRef.current) {
        clearTimeout(safetyNetTimeoutRef.current);
        safetyNetTimeoutRef.current = null;
      }
      // 🔧 Round 37 H1: 卸载时清理 preloadAfterChoice timer
      if (preloadAfterChoiceTimeoutRef.current) {
        clearTimeout(preloadAfterChoiceTimeoutRef.current);
        preloadAfterChoiceTimeoutRef.current = null;
      }
      // 🔧 H4 fix: 卸载时清理 choiceTimeoutRef (之前遗漏, 20s timer 在卸载后触发 setState)
      if (choiceTimeoutRef.current) {
        clearTimeout(choiceTimeoutRef.current);
        choiceTimeoutRef.current = null;
      }
      // 🔧 ARCH fix (Round 40 LOW-2): 清理 autoAdvance + chapterAdvance timers
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
      if (chapterAdvanceTimeoutRef.current) {
        clearTimeout(chapterAdvanceTimeoutRef.current);
        chapterAdvanceTimeoutRef.current = null;
      }
      // 🔧 BUG-252 fix: 组件卸载时中止 pollAndFetch 轮询
      pollAbortedRef.current = true;
    };
  }, []);

  // ============================================================
  // V17-1: 进度恢复 — 组件挂载时加载活跃会话
  // 🔧 ARCH fix (Round 28 — loadActiveSession 只在 mount 调用, login 后不恢复):
  //    旧代码: useEffect([]) 只在 mount 运行。用户未登录打开 app → mount 时 userId=null →
  //    machine idle → 登录后 userId 变化但 LOAD_ACTIVE 不触发 → 已有 session 不恢复。
  //    根因修复: 加 userId 变化检测, login 后若 machine idle 则 LOAD_ACTIVE。
  // ============================================================

  const prevUserIdRef = useRef<string | null>(null);
  // 🔧 ARCH fix (Round 65 LOW-2): 合并 mount + login 检测到一个 useEffect, 避免重复 loadActiveSession
  //   旧代码: 两个 useEffect — Effect A deps=[sessionHook.userId], Effect B deps=[]。
  //   mount 时若 userId 已存在, 两个 effect 都触发 → 2 个并行 loadActiveSession GET 请求 (浪费 + race)。
  //   根因修复: 只保留 Effect A (deps=[sessionHook.userId])。React 保证 mount 时 dep 触发一次,
  //   后续 userId 变化 (null→非 null 登录 / 非 null→null 登出) 再各触发一次。Effect B 完全冗余。
  useEffect(() => {
    if (hasRestoredRef.current) return;
    const currentUserId = sessionHook.userId;
    // 🔧 Round 28: userId 从 null 变为非 null (login 或 mount 时已登录), 若 machine idle 则恢复
    if (currentUserId && prevUserIdRef.current !== currentUserId) {
      prevUserIdRef.current = currentUserId;
      loadActiveSessionRef.current().catch(err => logger.warn("[NormalPlayer] loadActiveSession on login/mount failed:", err));
    } else if (!currentUserId) {
      prevUserIdRef.current = null;
    }
  }, [sessionHook.userId]);

  // ============================================================
  // V17-2: 流式展示 — chapter_start 到达时立即开始播放
  // ============================================================

  useEffect(() => {
    const info = sessionHook.currentChapterInfo;
    if (!info) return;
    // V30: 更宽松的响应条件 — 只要在 loading/chapterComplete/idle+刚启动 状态都响应
    // 修复：当 start() 被调用后 isLoading 可能在 React 批处理中尚未更新，
    // 但 currentChapterInfo 已经变化的竞态条件
    const shouldRespond =
      isLoadingRef.current ||
      phaseRef.current === 'chapterComplete' ||
      (phaseRef.current === 'idle' && decisionTypeRef.current !== null); // idle + 有决策信息 = 刚刚 start() 过
    if (!shouldRespond) {
      return;
    }
    // 避免重复触发（同一章节已在流式播放中）
    if (isStreamingChapterRef.current && streamingChapterMetaRef.current?.index === info.chapterIndex) {
      return;
    }

    logger.info('[NormalPlayer] chapter_start received, starting streaming play for chapter', info.chapterIndex);

    // 创建流式章节（单场景，文本会实时更新）
    // V24: Normal模式不再fallback到demo图片
    const illustrationUrl = info.illustrationUrl || '';

    dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: {
      index: info.chapterIndex,
      title: info.title,
      tone: info.tone,
      timeSpan: info.timeSpan,
      illustrationUrl,
    } });

    dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: info.chapterIndex });
    dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
    dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: true });
    isStreamingChapterRef.current = true;
    transitionPhase('playing');
    dispatch({ type: 'SET_IS_LOADING', payload: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [sessionHook.currentChapterInfo]);

  // ============================================================
  // V17-2: 流式展示 — 监听 SSE 新章节完成
  // ============================================================

  useEffect(() => {
    const sessionChapters = sessionHook.completedChapters;
    if (sessionChapters.length === 0) return;

    // 找出新章节（尚未被 Player 处理的）
    const newSessionChapters = sessionChapters.filter(
      ch => !processedChapterIndicesRef.current.has(ch.index)
    );

    if (newSessionChapters.length > 0) {
      // 标记为已处理
      for (const ch of newSessionChapters) {
        processedChapterIndicesRef.current.add(ch.index);
      }

      // 转换为 ChapterData
      const converted = newSessionChapters.map(convertStoryChapterToChapterData);
      dispatch({ type: 'UPDATE_COMPLETED_CHAPTERS', payload: prev => [...prev, ...converted] });

      // V17: 如果正在流式播放，章节完成后处理后续逻辑
      if (isStreamingChapterRef.current) {
        const completedChapter = newSessionChapters[0];
        logger.info('[NormalPlayer] Streaming chapter complete:', completedChapter?.index, 'hasChoice:', completedChapter?.hasChoice);

        // 清除流式状态
        dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: false });
        isStreamingChapterRef.current = false;
        dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: null });

        if (completedChapter?.hasChoice) {
          // V24: 不自动过渡到 choosing 阶段！用户必须手动点击「MAKE YOUR CHOICE」
          // 缓存 pendingChoice（如果已到达），但保持 playing 阶段
          const pendingChoice = sessionHook.pendingChoice;
          if (pendingChoice && pendingChoice.chapterIndex === completedChapter.index) {
            pendingChoiceRef.current = pendingChoice;
            dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
              prompt: pendingChoice.prompt,
              options: pendingChoice.options,
            } });
          }
          // 🔧 ARCH fix (Round 65 ESLint): 删除空 else 块 (no-empty warning) — 无需 else 分支。
          // 保持 playing 阶段 — 用户点击「MAKE YOUR CHOICE」时由 advance() 处理过渡
        } else {
          // V36 fix: 没有选择的章节也保持 playing 阶段，让用户看完故事内容后
          // 手动点击「NEXT CHAPTER」按钮（advance()）才进入 chapterComplete 插页
          // 之前 V27 自动 transitionPhase('chapterComplete') 导致用户没机会看完内容
          logger.info('[NormalPlayer] Streaming chapter complete (no choice), staying in playing phase for user to read');

          // V34: 如果这是最后一章，并且 storyComplete 还没到达，
          // 设置一个安全网：3秒后如果还在 playing，主动从DB加载完成数据
          const chapterIdx = completedChapter?.index;
          const total = sessionHook.session?.outline?.chapters.length || DEFAULT_CHAPTER_COUNT;
          if (chapterIdx && chapterIdx >= total && !storyCompleteRef.current) {
            const sessionId = sessionHook.session?.id;
            // BUG-7: 追踪 timeout 以便组件卸载时清理
            // 🔧 ARCH fix (Round 11 H1): clearTimeout 旧 timer 防止孤儿 timer 在 reset 后触发
            if (safetyNetTimeoutRef.current) {
              clearTimeout(safetyNetTimeoutRef.current);
            }
            safetyNetTimeoutRef.current = setTimeout(() => {
              safetyNetTimeoutRef.current = null;
              // 如果 storyComplete 在3秒内到达了，就不需要主动获取
              if (storyCompleteRef.current || phaseRef.current === 'complete') return;
              logger.info('[NormalPlayer] V34: storyComplete not received after 3s, fetching from DB');
              if (sessionId) {
                // 🔧 ARCH fix (Round 5 AUDIT-1 M-4): 用 apiFetch 替代裸 fetch — 获得 30s timeout + credentials + 统一错误处理
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
                apiFetch<{ session: ButterflySession | null }>(`/api/butterfly/session?sessionId=${sessionId}`)
                  .then((data) => {
                    const s = data?.session;
                    if (s?.status === 'completed' && s.butterflyEffect) {
                      dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: s.butterflyEffect });
                      dispatch({ type: 'SET_FINAL_TONE', payload: s.finalTone || 'twist' });
                      finalToneRef.current = s.finalTone || 'twist';
                      butterflyEffectRef.current = s.butterflyEffect;
                      transitionPhase('complete');
                    }
                  })
                  .catch(err => logger.warn("[NormalPlayer] async op failed:", err));
              }
            }, 3000);
          }
        }
      } else if (isLoadingRef.current) {
        // 非流式模式下的旧逻辑（兼容）
        const nextChapter = converted[0];
        if (nextChapter) {
          dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapter.index });
          dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
          transitionPhase('playing');
          dispatch({ type: 'SET_IS_LOADING', payload: false });
        }
      }
    }

    // 同时检查已有章节的场景插图更新
    dispatch({ type: 'UPDATE_COMPLETED_CHAPTERS', payload: prev => {
      let changed = false;
      const updated = prev.map(pc => {
        const sessionCh = sessionChapters.find(sc => sc.index === pc.index);
        if (!sessionCh) return pc;

        let sceneChanged = false;
        const updatedScenes = pc.scenes.map((scene, idx) => {
          // Priority 1: scene-level illustrations (per-scene AI-generated images)
          if (sessionCh.sceneIllustrations) {
            const imgs = sessionCh.sceneIllustrations[idx];
            // 🔧 ARCH fix (Round 65 LOW-5): 移除冗余 `as unknown as string` 双重断言
            //   旧代码: typeof imgs === 'string' ? (imgs as unknown as string) — TS 在 typeof === 'string'
            //   分支里已将 imgs 收窄为 string, 双重断言多余且掩盖真实类型。
            const newUrl = Array.isArray(imgs) && imgs.length > 0
              ? imgs[0]
              : typeof imgs === 'string'
                ? imgs
                : null;

            if (newUrl && newUrl !== scene.imageUrl) {
              sceneChanged = true;
              return { ...scene, imageUrl: newUrl };
            }
            return scene;
          }

          // Priority 2 (N7 fix): chapter-level illustrationUrl as fallback
          // When sceneIllustrations aren't available (e.g., rate limit fallback),
          // use illustrationUrl for scenes that currently have no image
          if (sessionCh.illustrationUrl && !scene.imageUrl) {
            sceneChanged = true;
            return { ...scene, imageUrl: sessionCh.illustrationUrl };
          }

          return scene;
        });

        if (sceneChanged) {
          changed = true;
          return { ...pc, scenes: updatedScenes };
        }
        return pc;
      });

      return changed ? updated : prev;
    } });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [sessionHook.completedChapters, sessionHook.pendingChoice, sessionHook.session?.outline?.chapters.length]);

  // ============================================================
  // 监听 pendingChoice（SSE choice_prompt 事件）
  // ============================================================

  useEffect(() => {
    if (sessionHook.pendingChoice) {
      pendingChoiceRef.current = sessionHook.pendingChoice;
      // 🔧 BUG-327 fix: choice 数据到达 → 清除超时
      if (choiceTimeoutRef.current) {
        clearTimeout(choiceTimeoutRef.current);
        choiceTimeoutRef.current = null;
      }

      if (sessionHook.pendingChoice.chapterIndex === currentChapterIndexRef.current) {
        // 🔧 架构优化 Round 59: 合并相同分支 (Finding 18) — 旧代码 if/else 分支 dispatch 相同 action
        // 唯一区别是 if 分支清 userClickedForChoiceRef, 现在提前清
        userClickedForChoiceRef.current = false;
        dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
          prompt: sessionHook.pendingChoice.prompt,
          options: sessionHook.pendingChoice.options,
        } });
      }
    }
  }, [sessionHook.pendingChoice]);

  // ============================================================
  // 监听 storyComplete
  // ============================================================

  useEffect(() => {
    if (sessionHook.storyComplete) {
      // V35: 如果当前处于 idle 阶段且没有决策信息，说明 storyComplete 是从
      // loadActiveSession 加载的已完成旧会话，而非当前故事刚完成。
      // V31 逻辑已经处理了这种情况（保持 idle 让用户开始新故事），
      // 不应该再强制跳到 complete 页面。
      if (phaseRef.current === 'idle' && decisionTypeRef.current === null) {
        logger.info('[NormalPlayer] V35: storyComplete arrived during idle+no-decision (loaded from old session), skipping phase transition to complete');
        // 仍然保存数据，以便用户之后需要时可以使用
        butterflyEffectRef.current = sessionHook.storyComplete.butterflyEffect || 'Your butterfly effect story is complete.';
        return;
      }

      // V26: 添加安全 fallback，确保 butterflyEffect 和 finalTone 不为 null
      dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: sessionHook.storyComplete.butterflyEffect || 'Your butterfly effect story is complete.' });
      dispatch({ type: 'SET_FINAL_TONE', payload: sessionHook.storyComplete.finalTone || 'twist' });
      finalToneRef.current = sessionHook.storyComplete.finalTone || 'twist';
      butterflyEffectRef.current = sessionHook.storyComplete.butterflyEffect || 'Your butterfly effect story is complete.';
      // 如果还在流式播放或加载中，直接跳到完成页
      if (isStreamingChapterRef.current) {
        dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: false });
        isStreamingChapterRef.current = false;
        dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: null });
      }
      if (isLoadingRef.current) {
        dispatch({ type: 'SET_IS_LOADING', payload: false });
        isLoadingRef.current = false;
      }
      // V28: 无论当前是什么 phase（playing/choosing/chapterComplete），都强制进入 complete
      // 之前如果卡在 chapterComplete，storyComplete 不会将其覆盖
      transitionPhase('complete');
      logger.info('[NormalPlayer] storyComplete received, transitioning to complete phase (was:', phaseRef.current, ')');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [sessionHook.storyComplete]);

  // ============================================================
  // 监听错误
  // ============================================================

  // V26: 记录上一个已处理的错误，避免重复处理同一个错误
  const lastProcessedErrorRef = useRef<string | null>(null);
  // 🔧 BUG-252 fix: pollAndFetch abort 标记，防止组件卸载/reset后仍执行 setState
  const pollAbortedRef = useRef(false);
  // 🔧 ARCH fix (Round 11 C1): per-cycle token — 防止旧 pollAndFetch 在新 cycle 中执行
  const pollCycleRef = useRef(0);

  useEffect(() => {
    if (sessionHook.uiState.error) {
      // V30: 如果已经在 complete 阶段，忽略错误（避免完成页被错误覆盖）
      if (phaseRef.current === 'complete') {
        logger.info('[NormalPlayer] Ignoring error during complete phase:', sessionHook.uiState.error);
        return;
      }
      // V26: 跳过已处理的错误（例如旧session的409错误在新建session后仍然触发）
      if (lastProcessedErrorRef.current === sessionHook.uiState.error && phaseRef.current === 'idle') {
        logger.info('[NormalPlayer] Skipping already-processed error during idle phase:', sessionHook.uiState.error);
        return;
      }
      lastProcessedErrorRef.current = sessionHook.uiState.error;
      dispatch({ type: 'SET_ERROR', payload: sessionHook.uiState.error });
      dispatch({ type: 'SET_IS_LOADING', payload: false });
      if (isStreamingChapterRef.current) {
        dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: false });
        isStreamingChapterRef.current = false;
        dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: null });
      }
    } else {
      // 🔧 ARCH fix (Round 23 H1 — machine 清 error 后 player 未同步, 旧 error overlay 残留):
      //    旧代码无 else 分支 → RETRY 后 machine 清 error (assignRetryStream/clearError),
      //    但 player 的 error state 不清 → 用户看到旧 error overlay。
      //    根因修复: machine error 为 null 时, 清 player error + 重置 ref。
      if (lastProcessedErrorRef.current !== null) {
        dispatch({ type: 'SET_ERROR', payload: null });
        lastProcessedErrorRef.current = null;
      }
    }
  }, [sessionHook.uiState.error]);

  // ============================================================
  // 计算当前章节信息
  // ============================================================

  const currentChapterInfo = useMemo<ChapterData | null>(() => {
    if (phase === 'idle' || phase === 'complete') return null;

    // V27: chapterComplete 阶段也需要当前章节信息（用于插页显示）
    // 流式模式：返回流式章节数据
    // 🔧 Bug fix (流式不分场景): 旧代码流式期间把所有 streamingText 放在 1 个 scene 里
    //   → 用户看到 "1/1" 而非 "1/5", 且全部文本一次性显示
    //   修复: 流式期间也用 splitScenes 按 ||| 分割, 实时显示已到达的场景数
    //   场景数会随 ||| 到达而增加 (1/5 → 2/5 → ... → 5/5)
    if (isStreamingChapter && streamingChapterMeta) {
      const rawText = sessionHook.streamingText || '';
      const scenes = splitScenes(rawText);
      return {
        index: streamingChapterMeta.index,
        title: streamingChapterMeta.title,
        tone: streamingChapterMeta.tone,
        timeSpan: streamingChapterMeta.timeSpan,
        hasChoice: false, // 流式期间不知道是否有选择
        scenes: scenes.length > 0 ? scenes.map(text => ({
          text,
          imageUrl: streamingChapterMeta.illustrationUrl,
        })) : [{ text: '', imageUrl: streamingChapterMeta.illustrationUrl }],
      };
    }

    // 正常模式：从 completedChapters 获取
    return completedChapters.find(ch => ch.index === currentChapterIndex) || null;
  }, [phase, isStreamingChapter, streamingChapterMeta, sessionHook.streamingText, completedChapters, currentChapterIndex]);

  const currentScenes = useMemo<SceneData[]>(() => {
    return currentChapterInfo?.scenes || [];
  }, [currentChapterInfo]);

  const totalChapters = useMemo(() => {
    return sessionHook.session?.outline?.chapters.length || DEFAULT_CHAPTER_COUNT;
  }, [sessionHook.session?.outline?.chapters.length]);

  // ============================================================
  // Player actions (extracted to use-player-actions.ts — Round 67B)
  // 行为 byte-for-byte 保留: 所有逻辑搬到 usePlayerActions hook,
  // 通过 params 注入 dispatch/transitionPhase/totalChapters/sessionHook + 33 个 refs.
  // 包含: restoration useEffect + start/advance/retryChoice/advanceToNextChapter/
  //       goToChapter/selectChoice/reset + advanceToNextChapterRef + useLayoutEffect.
  // ============================================================

  const {
    start,
    advance,
    selectChoice,
    advanceToNextChapter,
    retryChoice,
    goToChapter,
    reset,
  } = usePlayerActions({
    dispatch,
    transitionPhase,
    totalChapters,
    sessionHook,
    t,
    refs: {
      phaseRef,
      currentChoiceRef,
      currentChapterIndexRef,
      currentSceneIndexRef,
      completedChaptersRef,
      isLoadingRef,
      choicesRef,
      decisionTypeRef,
      decisionDescRef,
      butterflyEffectRef,
      finalToneRef,
      isStreamingChapterRef,
      processedChapterIndicesRef,
      waitingForChoiceRef,
      userClickedForChoiceRef,
      pendingChoiceRef,
      choiceTimeoutRef,
      storyCompleteRef,
      hasRestoredRef,
      restorationTimeoutRef,
      safetyNetTimeoutRef,
      preloadAfterChoiceTimeoutRef,
      autoAdvanceTimeoutRef,
      chapterAdvanceTimeoutRef,
      sessionHookResetRef,
      sessionHookCreateSessionRef,
      sessionHookContinueStoryRef,
      sessionHookSessionRef,
      pollAbortedRef,
      pollCycleRef,
      lastProcessedErrorRef,
    },
  });


  return {
    phase,
    decisionType,
    decisionDescription,
    outline: sessionHook.session?.outline || null,
    sessionId: sessionHook.session?.id, // 🔧 2026-07-17: for share link
    currentChapterIndex,
    currentSceneIndex,
    currentScenes,
    currentChapterInfo,
    completedChapters,
    currentChoice,
    butterflyEffect,
    finalTone,
    totalChapters,
    choices,
    isLoading,
    error,
    isStreamingChapter,
    streamingText: isStreamingChapter ? sessionHook.streamingText : '',
    start,
    advance,
    selectChoice,
    reset,
    advanceToNextChapter,
    goToChapter, // N74 fix: 回看已完成的章节
    retryChoice, // 🔧 Bug 26 fix: 手动重试加载 choice 数据
  };
}


