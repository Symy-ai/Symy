/**
 * advanceToNextChapter — extracted from use-player-actions.ts (Round 70 ARCH-DEEP-70)
 *
 * 从 chapterComplete 阶段推进到下一章节的纯函数。
 * 行为 byte-for-byte 保留自 usePlayerActions 内部实现。
 *
 * 主 hook 包装:
 *   const advanceToNextChapter = useCallback(
 *     () => advanceToNextChapterImpl({...params}),
 *     [sessionHook, totalChapters],
 *   );
 */

'use client';

import type { Dispatch, MutableRefObject } from 'react';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api-client';
import type { ButterflySession, ChoiceOption, StoryTone } from '../../types';
import type { UseButterflySessionReturn } from '../session';
import type { NormalPhase, ChapterData } from './types';
import { convertStoryChapterToChapterData } from './helpers';
import type { NormalPlayerAction } from './reducer';

// ============================================================
// Types (本地，与 use-player-actions.ts 结构相同)
// ============================================================

/** pendingChoice / currentChoice 共用类型 */
type ChoiceData = { chapterIndex: number; prompt: string; options: ChoiceOption[] };

// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): StoryCompleteData 用 canonical type (../../types)
// eslint-disable-next-line no-duplicate-imports
import type { StoryCompleteData } from '../../types';

/**
 * advanceToNextChapterImpl 参数: 调用方提供的 dispatch / refs / sessionHook 等
 */
export interface AdvanceToNextChapterParams {
  dispatch: Dispatch<NormalPlayerAction>;
  transitionPhase: (next: NormalPhase, reason?: string) => void;
  totalChapters: number;
  sessionHook: UseButterflySessionReturn;
  phaseRef: MutableRefObject<NormalPhase>;
  currentChapterIndexRef: MutableRefObject<number>;
  completedChaptersRef: MutableRefObject<ChapterData[]>;
  isLoadingRef: MutableRefObject<boolean>;
  butterflyEffectRef: MutableRefObject<string | null>;
  finalToneRef: MutableRefObject<StoryTone | null>;
  isStreamingChapterRef: MutableRefObject<boolean>;
  processedChapterIndicesRef: MutableRefObject<Set<number>>;
  pendingChoiceRef: MutableRefObject<ChoiceData | null>;
  storyCompleteRef: MutableRefObject<StoryCompleteData | null>;
  pollAbortedRef: MutableRefObject<boolean>;
  pollCycleRef: MutableRefObject<number>;
}

// ============================================================
// V27: 从 chapterComplete 推进到下一章节
// ============================================================

export function advanceToNextChapterImpl(params: AdvanceToNextChapterParams) {
  const {
    dispatch,
    transitionPhase,
    totalChapters,
    sessionHook,
    phaseRef,
    currentChapterIndexRef,
    completedChaptersRef,
    isLoadingRef,
    butterflyEffectRef,
    finalToneRef,
    isStreamingChapterRef,
    processedChapterIndicesRef,
    pendingChoiceRef,
    storyCompleteRef,
    pollAbortedRef,
    pollCycleRef,
  } = params;

    if (phaseRef.current !== 'chapterComplete') return;

    // V28: 如果故事已完成，直接进入完成页（不尝试获取下一章）
    // 🔧 预加载竞态修复: 不检查 session.status === 'completed'
    //   原因: preloadNextChapter 预加载最后一章时, story API 会把 session.status 设为 'completed'
    //   → player 从 session reload 中看到 completed → 跳过 crossroads 直接进完成页
    //   修复: 只检查 storyCompleteRef.current (由 STORY_COMPLETE SSE 事件设置, 只在正式流式时触发)
    //   preloadedStoryComplete (由 PRELOAD_STORY_COMPLETE_DONE 设置) 不触发强制完成
    if (storyCompleteRef.current) {
      // V32: 优先使用预加载的 storyComplete 数据
      const preloadedComplete = sessionHook.preloadedStoryComplete;
      const bf = butterflyEffectRef.current
        || preloadedComplete?.butterflyEffect
        || storyCompleteRef.current?.butterflyEffect
        || sessionHook.session?.butterflyEffect
        || 'Your butterfly effect story is complete.';
      const ft = finalToneRef.current
        || preloadedComplete?.finalTone
        || storyCompleteRef.current?.finalTone
        || sessionHook.session?.finalTone
        || 'twist';
      dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf });
      dispatch({ type: 'SET_FINAL_TONE', payload: ft });
      finalToneRef.current = ft;
      butterflyEffectRef.current = bf;
      sessionHook.clearPreloadedStoryComplete();
      transitionPhase('complete');
      return;
    }

    const nextChapterIndex = currentChapterIndexRef.current + 1;

    if (nextChapterIndex <= totalChapters) {
      // V31: 先检查预加载数据，直接应用到 player 状态，避免触发错误的 streaming 路径
      const preloaded = sessionHook.preloadedChapterData;
      if (preloaded && preloaded.chapter.index === nextChapterIndex) {
        logger.info('[NormalPlayer] V31: Using preloaded chapter data for chapter', nextChapterIndex);
        const converted = convertStoryChapterToChapterData(preloaded.chapter);

        // 直接添加到 completedChapters 并同步 ref
        dispatch({ type: 'UPDATE_COMPLETED_CHAPTERS', payload: prev => {
          if (prev.some(c => c.index === converted.index)) return prev;
          const updated = [...prev, converted];
          completedChaptersRef.current = updated; // ★ 立即同步 ref ★
          return updated;
        } });
        processedChapterIndicesRef.current.add(preloaded.chapter.index);

        // 设置章节索引和播放阶段
        dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIndex });
        dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
        transitionPhase('playing');
        // ★ 不设 isLoading=true，避免触发 chapter_start effect 的 streaming 路径 ★
        dispatch({ type: 'SET_IS_LOADING', payload: false });
        isLoadingRef.current = false;

        // 缓存 choice 数据
        if (preloaded.choice) {
          pendingChoiceRef.current = preloaded.choice;
          dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
            prompt: preloaded.choice.prompt,
            options: preloaded.choice.options,
          } });
        } else {
          pendingChoiceRef.current = null;
          dispatch({ type: 'SET_CURRENT_CHOICE', payload: null });
        }

        // 更新 outline
        if (preloaded.outline && sessionHook.session) {
          // outline 已通过 preloading 更新
        }

        // V32: 使用 preloadNextChapter 代替 continueStory！
        // continueStory() 会启动完整 SSE 流并通过 handleSSEEvent 处理事件，
        // 包括 story_complete，导致用户还在看当前章节时就被强制跳到完成页（BUG-241）
        // preloadNextChapter() 静默读取 SSE 流，story_complete 数据存入 preloadedStoryComplete，
        // 不会触发 storyComplete effect 的强制 phase 过渡
        sessionHook.preloadNextChapter().catch(err => logger.warn("[NormalPlayer] async op failed:", err));
        return;
      }

      const nextChapter = completedChaptersRef.current.find(ch => ch.index === nextChapterIndex);
      if (nextChapter) {
        // 下一章已经存在 → 直接播放
        dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIndex });
        dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
        transitionPhase('playing');

        // 缓存下一章的 choice 数据（如果有）
        if (nextChapter.hasChoice) {
          const nextChoice = sessionHook.session?.choices?.find(c => c.chapterIndex === nextChapterIndex);
          if (nextChoice) {
            pendingChoiceRef.current = {
              chapterIndex: nextChoice.chapterIndex,
              prompt: nextChoice.prompt,
              options: nextChoice.options,
            };
          }
        }

        // V33: 预加载下一章节，确保 story_complete 数据被静默捕获
        // 之前缺少此调用导致最后一章完成后 butterflyEffect/finalTone 使用 fallback 文字
        sessionHook.preloadNextChapter().catch(err => logger.warn("[NormalPlayer] async op failed:", err));
      } else {
        // 下一章不存在 → 需要SSE流式获取
        // 🔧 ARCH fix (Round 17 audit #13 — Player calls continueStory() while machine already streaming):
        //    旧代码无条件调 sessionHook.continueStory()。
        //    若 machine 正在 streaming (用户在 chapterComplete 阶段停留太久, 自动 preload 已触发 streaming,
        //    或用户快速点 Next Chapter), machine 处于 streaming 状态, CONTINUE 事件让它 transition 到
        //    continuing → 重新 streamStoryService → 中止当前 SSE → 重新生成 chapter (LLM cost 翻倍)。
        //    根因修复: 若 isStreamingChapterRef=true, 跳过 continueStory (machine 已在工作)。
        //    注意: 这是 Round 12 C1 fix 的精细化 — Round 12 C1 加了 streaming.on.CONTINUE handler
        //    防"silent drop infinite spinner", 但接受了"重生成"的代价。此修复消除"重生成"场景。
        if (isStreamingChapterRef.current) {
          logger.info('[NormalPlayer] advanceToNextChapter: machine is already streaming chapter, skipping continueStory');
          // 仍更新 UI 指示 loading, machine 完成后会触发 chapter_start effect
          dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIndex });
          dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
          dispatch({ type: 'SET_IS_LOADING', payload: true });
          return;
        }
        dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIndex });
        dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
        dispatch({ type: 'SET_IS_LOADING', payload: true });
        sessionHook.continueStory().catch((err) => {
          logger.error('[NormalPlayer] continueStory failed from chapterComplete:', err);
          // 检查是否故事已完成
          if (sessionHook.session?.status === 'completed' || storyCompleteRef.current) {
            const bf = storyCompleteRef.current?.butterflyEffect || sessionHook.session?.butterflyEffect || 'Your butterfly effect story is complete.';
            const ft = storyCompleteRef.current?.finalTone || sessionHook.session?.finalTone || 'twist';
            dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf });
            dispatch({ type: 'SET_FINAL_TONE', payload: ft });
            finalToneRef.current = ft;
            butterflyEffectRef.current = bf;
            transitionPhase('complete');
          }
          dispatch({ type: 'SET_IS_LOADING', payload: false });
        });
      }
    } else {
      // 所有章节完成 → 进入完成页
      // V32: 优先使用预加载的 storyComplete 数据（由 preloadNextChapter 捕获）
      const getCompletionData = () => {
        const preloadedComplete = sessionHook.preloadedStoryComplete;
        const bf = butterflyEffectRef.current
          || preloadedComplete?.butterflyEffect
          || storyCompleteRef.current?.butterflyEffect
          || sessionHook.session?.butterflyEffect
          || null;
        const ft = finalToneRef.current
          || preloadedComplete?.finalTone
          || storyCompleteRef.current?.finalTone
          || sessionHook.session?.finalTone
          || null;
        return { bf, ft, preloadedComplete };
      };

      const { bf, ft } = getCompletionData();

      // V34: 如果 butterflyEffect 还没有真实数据，先显示完成页（fallback文字），
      // 然后从数据库重新加载 session 获取真实的 butterflyEffect/finalTone
      // 之前的轮询方案不可靠，因为 preloadNextChapter 可能被 isStreamingRef 阻止，
      // 或者后端 session.status 已经是 completed 导致 preloadNextChapter 直接返回
      if (!bf || bf === 'Your butterfly effect story is complete.') {
        // 立即设置 phase='complete' 让用户看到完成页
        dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf || 'Your butterfly effect story is complete.' });
        dispatch({ type: 'SET_FINAL_TONE', payload: ft || 'twist' });
        finalToneRef.current = ft || 'twist';
        butterflyEffectRef.current = bf || 'Your butterfly effect story is complete.';
        sessionHook.clearPreloadedStoryComplete();
        transitionPhase('complete');

        // V34: 从数据库重新加载 session，获取真实的 butterflyEffect
        // 轮询间隔 1s，最多 15s（后端需要时间生成总结并保存到数据库）
        const maxWait = 15000;
        const interval = 1000;
        let elapsed = 0;
        const sessionId = sessionHook.session?.id;
        // 🔧 BUG-252 fix: 重置 abort 标记
        pollAbortedRef.current = false;
        // 🔧 ARCH fix (Round 11 C1): per-cycle token — 旧 cycle 的 setTimeout 不会在新 cycle 中执行
        const myCycle = ++pollCycleRef.current;
        const pollAndFetch = async () => {
          if (elapsed >= maxWait) return;
          // 🔧 BUG-252 fix: 检查 abort 标记，防止卸载/reset后继续执行
          if (pollAbortedRef.current) return;
          // 🔧 Round 11 C1: 检查 cycle token — 防止旧 cycle 的 timer 在新 cycle 中执行
          if (pollCycleRef.current !== myCycle) return;
          // 先检查 preloadedStoryComplete（preloadNextChapter 可能已经拿到数据）
          const latestPreloaded = sessionHook.preloadedStoryComplete;
          if (latestPreloaded?.butterflyEffect && latestPreloaded.butterflyEffect !== 'Your butterfly effect story is complete.') {
            dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: latestPreloaded.butterflyEffect });
            dispatch({ type: 'SET_FINAL_TONE', payload: latestPreloaded.finalTone || 'twist' });
            finalToneRef.current = latestPreloaded.finalTone || 'twist';
            butterflyEffectRef.current = latestPreloaded.butterflyEffect;
            sessionHook.clearPreloadedStoryComplete();
            return;
          }
          // 从数据库重新加载 session
          if (sessionId) {
            try {
              // 🔧 ARCH fix (Round 5 AUDIT-1 M-4): 用 apiFetch 替代裸 fetch — 获得 30s timeout + credentials + 统一错误处理
              const data = await apiFetch<{ session: ButterflySession | null }>(`/api/butterfly/session?sessionId=${sessionId}`);
              // 🔧 ARCH fix (reset race): await 后再检查 abort — 否则 dispatch/setState 会写入已重置的 reducer,
              //    且 sessionHook.loadActiveSession() 会重新加载刚被用户 abandon 的会话, 导致完成页闪回。
              if (pollAbortedRef.current) return;
              if (pollCycleRef.current !== myCycle) return;  // 🔧 Round 11 C1
              const refreshedSession = data?.session;
              if (refreshedSession?.butterflyEffect && refreshedSession.butterflyEffect !== 'Your butterfly effect story is complete.') {
                // 🔧 ARCH fix: 第二次 await 后再次检查 (apiFetch 内部已 await, 无需二次检查)
                dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: refreshedSession.butterflyEffect });
                dispatch({ type: 'SET_FINAL_TONE', payload: refreshedSession.finalTone || 'twist' });
                finalToneRef.current = refreshedSession.finalTone || 'twist';
                butterflyEffectRef.current = refreshedSession.butterflyEffect;
                // 同步更新 session 状态
                sessionHook.loadActiveSession().catch(err => logger.warn("[NormalPlayer] async op failed:", err));
                return;
              }
            } catch {
              // 忽略错误，继续轮询
            }
          }
          elapsed += interval;
          setTimeout(pollAndFetch, interval);
        };
        // 先等 2 秒给后端时间生成总结
        setTimeout(pollAndFetch, 2000);
      } else {
        // 已有真实数据，直接使用
        dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf });
        dispatch({ type: 'SET_FINAL_TONE', payload: ft || 'twist' });
        finalToneRef.current = ft || 'twist';
        butterflyEffectRef.current = bf;
        sessionHook.clearPreloadedStoryComplete();
        transitionPhase('complete');
      }
    }
}
