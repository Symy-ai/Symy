/**
 * selectChoice — extracted from use-player-actions.ts (Round 70 ARCH-DEEP-70)
 *
 * 提交选择的纯 async 函数。
 * 行为 byte-for-byte 保留自 usePlayerActions 内部实现。
 *
 * 主 hook 包装:
 *   const selectChoice = useCallback(
 *     (optionId: string) => selectChoiceImpl({ ...params, optionId }),
 *     [sessionHook],
 *   );
 */

'use client';

import type { Dispatch, MutableRefObject } from 'react';
import { raceWithTimeoutReject } from '@/lib/race-timeout';
import { logger } from '@/lib/logger';
import { apiFetchVoid } from '@/lib/api-client';
import type { ButterflySession, ChoiceOption, StoryTone } from '../../types';
import type { UseButterflySessionReturn } from '../session';
import type { NormalPhase, ChapterData } from './types';
import {
  convertStoryChapterToChapterData,
  shouldCompleteAfterSubmit,
  computeCompleteValues,
} from './helpers';
import type { NormalPlayerAction } from './reducer';

// ============================================================
// Types (本地，与 use-player-actions.ts 结构相同)
// ============================================================

/** pendingChoice / currentChoice 共用类型 */
type ChoiceData = { chapterIndex: number; prompt: string; options: ChoiceOption[] };

// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): StoryCompleteData 用 canonical type (../../types)
// eslint-disable-next-line no-duplicate-imports
import type { StoryCompleteData } from '../../types';

/** setTimeout 句柄类型 */
type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * selectChoiceImpl 参数: 调用方提供的 dispatch / refs / sessionHook + optionId
 */
export interface SelectChoiceParams {
  optionId: string;
  dispatch: Dispatch<NormalPlayerAction>;
  transitionPhase: (next: NormalPhase, reason?: string) => void;
  totalChapters: number;
  sessionHook: UseButterflySessionReturn;
  phaseRef: MutableRefObject<NormalPhase>;
  currentChapterIndexRef: MutableRefObject<number>;
  completedChaptersRef: MutableRefObject<ChapterData[]>;
  choicesRef: MutableRefObject<Record<number, string>>;
  waitingForChoiceRef: MutableRefObject<boolean>;
  userClickedForChoiceRef: MutableRefObject<boolean>;
  pendingChoiceRef: MutableRefObject<ChoiceData | null>;
  butterflyEffectRef: MutableRefObject<string | null>;
  finalToneRef: MutableRefObject<StoryTone | null>;
  storyCompleteRef: MutableRefObject<StoryCompleteData | null>;
  processedChapterIndicesRef: MutableRefObject<Set<number>>;
  preloadAfterChoiceTimeoutRef: MutableRefObject<TimeoutHandle | null>;
  sessionHookSessionRef: MutableRefObject<ButterflySession | null>;
}

// ============================================================
// 提交选择
// ============================================================

export async function selectChoiceImpl(params: SelectChoiceParams) {
  const {
    optionId,
    dispatch,
    transitionPhase,
    totalChapters,
    sessionHook,
    phaseRef,
    currentChapterIndexRef,
    completedChaptersRef,
    choicesRef,
    waitingForChoiceRef,
    userClickedForChoiceRef,
    pendingChoiceRef,
    butterflyEffectRef,
    finalToneRef,
    storyCompleteRef,
    processedChapterIndicesRef,
    preloadAfterChoiceTimeoutRef,
    sessionHookSessionRef,
  } = params;

    if (phaseRef.current !== 'choosing') return;

    const chIdx = currentChapterIndexRef.current;

    // 记录选择
    choicesRef.current[chIdx] = optionId;
    dispatch({ type: 'UPDATE_CHOICES', payload: prev => ({ ...prev, [chIdx]: optionId }) });
    dispatch({ type: 'SET_CURRENT_CHOICE', payload: null });
    waitingForChoiceRef.current = false;
    userClickedForChoiceRef.current = false;

    // 检查是否已有下一章数据
    const nextChapterIndex = chIdx + 1;

    // V31: 先检查预加载分支数据，直接应用到 player 状态
    const preloadedBranch = sessionHook.preloadedBranches[optionId];
    // 🔧 ARCH fix (Round 11 C2): 验证 preloadedBranch 是下一章, 防止 stale 数据
    if (preloadedBranch && preloadedBranch.chapter.index === nextChapterIndex) {
      logger.info('[NormalPlayer] V31: Using preloaded branch data for choice', optionId);
      const { chapter, choice } = preloadedBranch;
      const converted = convertStoryChapterToChapterData(chapter);

      // 直接添加到 completedChapters 并同步 ref
      dispatch({ type: 'UPDATE_COMPLETED_CHAPTERS', payload: prev => {
        if (prev.some(c => c.index === converted.index)) return prev;
        const updated = [...prev, converted];
        completedChaptersRef.current = updated; // ★ 立即同步 ref ★
        return updated;
      } });
      processedChapterIndicesRef.current.add(chapter.index);

      // V27: 选择后进入 chapterComplete 插页
      transitionPhase('chapterComplete');

      // 🔧 choice 提交根因修复: preloadedBranch 路径用 await (不用 fire-and-forget)
      //   旧代码: sessionHook.submitChoice(chIdx, optionId).catch(...)
      //   → fire-and-forget, 如果 machine 不在 choosing 状态, SUBMIT_CHOICE 被丢弃
      //   修复: await, 确保 submitChoice 完成 (machine 在 choosing 接收 → submitting_choice → choice API 调用)
      //   如果 machine 不在 choosing, submitChoice 的 SUBMIT_CHOICE 事件被丢弃, await 永远 hang
      //   → 加 10s 超时 fallback: 直接调 choice API
      try {
        // 🔧 ARCH fix (Round 65 LOW-1): 用 raceWithTimeoutReject 替代内联 Promise.race + setTimeout
        //   旧代码手动写 Promise.race + setTimeout, 容易忘记 clearTimeout (本处虽 reject 后 GC, 但模式不统一)。
        //   根因修复: 用共享 helper, 内置 timer cleanup + rejection handling (与项目其他 8 处一致)。
        await raceWithTimeoutReject(
          sessionHook.submitChoice(chIdx, optionId),
          10_000,
          new Error('submitChoice timeout'),
        );
      } catch (err) {
        logger.warn('[NormalPlayer] preloadedBranch submitChoice failed/timeout, calling choice API directly:', err);
        // Fallback: 直接调 choice API (不经过 machine)
        try {
          const sessionId = sessionHookSessionRef.current?.id;
          if (sessionId) {
            // 🔧 ARCH fix (Round 5 AUDIT-1 M-4): 用 apiFetchVoid 替代裸 fetch — 获得 30s timeout + credentials + 统一错误处理
            await apiFetchVoid('/api/butterfly/choice', {
              method: 'POST',
              body: { sessionId, chapterIndex: chIdx, selectedOption: optionId },
            });
            logger.info('[NormalPlayer] Choice API direct call succeeded');
          }
      // safe to ignore: non-critical background operation, error already logged
        } catch (directErr) {
                              // safe to ignore: non-critical background operation, error already logged
          logger.error('[NormalPlayer] Choice API direct call also failed:', directErr);
        }
      }

      // 缓存 choice 数据（下一章的选择点）
      if (choice) {
        pendingChoiceRef.current = choice;
        dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
          prompt: choice.prompt,
          options: choice.options,
        } });
      } else {
        pendingChoiceRef.current = null;
        dispatch({ type: 'SET_CURRENT_CHOICE', payload: null });
      }

      // V33: 如果分支结果章节是最后一章（无 choice），预加载 story_complete 数据
      // 这样用户看完最后一章点击 Continue 时，butterflyEffect/finalTone 有真实数据
      // 🔧 ARCH fix (Round 11 M3): 用 === 而非 >= — >= 会为超出范围的章节触发不必要的 preload
      if (!choice && chapter.index === totalChapters) {
        // submitChoice 完成后，后台预加载 story_complete
        // 使用 setTimeout 确保 submitChoice 的 POST 请求先发出
        // 🔧 ARCH fix (Round 37 H1): 追踪 timer, 卸载/reset 时清理
        if (preloadAfterChoiceTimeoutRef.current) clearTimeout(preloadAfterChoiceTimeoutRef.current);
        preloadAfterChoiceTimeoutRef.current = setTimeout(() => {
          preloadAfterChoiceTimeoutRef.current = null;
          sessionHook.preloadNextChapter().catch(err => logger.warn("[NormalPlayer] async op failed:", err));
        }, 1500);
      }
      return;
    }

    const nextChapter = completedChaptersRef.current.find(ch => ch.index === nextChapterIndex);

    if (nextChapter) {
      // V27: 选择后进入 chapterComplete 插页，而不是直接跳到下一章
      transitionPhase('chapterComplete');
    } else if (butterflyEffectRef.current || storyCompleteRef.current || sessionHook.preloadedStoryComplete) {
      // 🔧 预加载竞态修复: 不检查 session.status === 'completed' (同 advanceToNextChapter)
      // V27: 确保 butterflyEffect 和 finalTone 有值，否则完成页不会渲染
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
    } else {
      // 需要SSE流式获取下一章
      dispatch({ type: 'SET_IS_LOADING', payload: true });

      // PM-NEW-44 fix: sessionHook.submitChoice 只是 send(XState event), 不返回 Promise
      // 旧代码 `await sessionHook.submitChoice` 立即返回 (send 是同步的),
      // 如果 XState guard canSubmitChoice 失败或 machine 不在 'choosing' 状态,
      // SUBMIT_CHOICE 被静默丢弃, choice API 永远不被调用
      // → 用户卡在 "Preparing your choice..." 60-90s → retry
      //
      // 根因修复: 直接调 choice API (不依赖 XState), 确保请求发出
      try {
        sessionHook.submitChoice(chIdx, optionId); // fire-and-forget XState 事件

        // 直接调 choice API (确保请求发出)
        const sessionId = sessionHookSessionRef.current?.id;
        if (sessionId) {
          logger.info('[NormalPlayer] Directly calling choice API (PM-NEW-44 fix)');
          // 🔧 ARCH fix (Round 5 AUDIT-1 M-4): 用 apiFetchVoid 替代裸 fetch — 获得 30s timeout + credentials + 统一错误处理
          // 🔧 ARCH fix (Round 11 ADV-REVIEW MEDIUM-1): apiFetchVoid throws on non-2xx, 但 choice API 失败
          //    不应阻断 phase transition 逻辑 — 用户仍需 UI 反馈 (5s fallback 触发 continueStory)
          //    根因修复: 用 .catch() 吞错, 让 phase transition 逻辑继续执行
          await apiFetchVoid('/api/butterfly/choice', {
            method: 'POST',
            body: { sessionId, chapterIndex: chIdx, selectedOption: optionId },
          }).catch(err => {
            logger.warn('[NormalPlayer] Choice API direct call failed (continuing to phase check):', err instanceof Error ? err.message : String(err));
          });
        }

        // ★ V25: 安全检查 — 如果 submitChoice 完成后仍在 choosing 阶段，强制切换 ★
        // 🔧 ARCH fix (Round 11 ADV-REVIEW MEDIUM-1): 此块必须执行, 即使 choice API 失败
        //    旧代码: apiFetchVoid throw → outer catch → 跳过 phase transition → 用户卡在 choosing
        //    根因修复: choice API 用 .catch() 吞错, phase transition 始终运行
        if (phaseRef.current === 'choosing') {
          const latestChapterIndex = chIdx + 1;
          const latestChapter = completedChaptersRef.current.find(ch => ch.index === latestChapterIndex);
          if (latestChapter) {
            transitionPhase('chapterComplete');
            dispatch({ type: 'SET_IS_LOADING', payload: false });
          } else if (shouldCompleteAfterSubmit({
            butterflyEffect: butterflyEffectRef.current,
            storyComplete: storyCompleteRef.current,
            preloadedStoryComplete: sessionHook.preloadedStoryComplete,
            session: sessionHook.session,
          })) {
            const { bf, ft } = computeCompleteValues({
              butterflyEffect: butterflyEffectRef.current,
              finalTone: finalToneRef.current,
              storyComplete: storyCompleteRef.current,
              preloadedStoryComplete: sessionHook.preloadedStoryComplete,
              session: sessionHook.session,
            });
            dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf });
            dispatch({ type: 'SET_FINAL_TONE', payload: ft });
            finalToneRef.current = ft;
            butterflyEffectRef.current = bf;
            sessionHook.clearPreloadedStoryComplete();
            transitionPhase('complete');
            dispatch({ type: 'SET_IS_LOADING', payload: false });
          } else {
            // PM-NEW-44 fix: choice API 已调用, 但 SSE 可能需要时间
            // 5s 后仍在 choosing, 触发 continueStory 获取下一章
            setTimeout(() => {
              if (phaseRef.current === 'choosing' && sessionHookSessionRef.current) {
                logger.info('[NormalPlayer] Still in choosing after 5s, triggering continueStory');
                sessionHook.continueStory();
              }
            }, 5000);
          }
        }
      // safe to ignore: non-critical background operation, error already logged
      } catch (_err) {
                       // safe to ignore: non-critical background operation, error already logged
        // 🔧 FIX: submitChoice 只发 XState event (send), 不返回 Promise rejection
        // 409 等错误由 XState 的 onError → error state → sessionHook.uiState.error 处理
        logger.warn('[NormalPlayer] submitChoice unexpected error (XState should handle):', _err);
      }
    }
}
