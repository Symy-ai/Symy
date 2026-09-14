/**
 * usePlayerActions — Player actions extracted from useButterflyNormalPlayer (Round 67B)
 *
 * 从 use-butterfly-normal-player.ts 抽出的最大函数集中到此处，行为 byte-for-byte 保留。
 * 主 hook 通过 usePlayerActions() 调用并解构返回值。
 *
 * Round 70 (ARCH-DEEP-70): advanceToNextChapter / selectChoice 抽出到独立文件
 *   - advanceToNextChapter → ./advance-chapter.ts (advanceToNextChapterImpl)
 *   - selectChoice → ./select-choice.ts (selectChoiceImpl)
 *   主 hook 用 useCallback 包装 impl 函数 (deps 与原版一致)。
 *
 * 本文件仍包含:
 * - Restoration useEffect (V17-1: 从后端加载的 session 恢复播放器状态)
 * - start: 创建新 session
 * - advance: 推进场景/章节
 * - retryChoice: 手动重试加载 choice 数据
 * - advanceToNextChapter: 包装 impl (来自 advance-chapter.ts)
 * - goToChapter: 跳转到指定章节（回看已完成的章节）
 * - selectChoice: 包装 impl (来自 select-choice.ts)
 * - reset: 重新开始
 */

'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
// eslint-disable-next-line no-duplicate-imports
import type { Dispatch, MutableRefObject } from 'react';
import { logger } from '@/lib/logger';
import type {
  CreateSessionParams,
  ChoiceOption,
  ButterflySession,
  DecisionType,
  StoryTone,
} from '../../types';
import type { UseButterflySessionReturn } from '../session';
import type { NormalPhase, ChapterData } from './types';
import { convertStoryChapterToChapterData, getFallbackChoice } from './helpers';
import { apiFetch } from '@/lib/api-client';
import type { NormalPlayerAction } from './reducer';
import { advanceToNextChapterImpl } from './advance-chapter';
import { selectChoiceImpl } from './select-choice';

// ============================================================
// Types
// ============================================================

/** pendingChoice / currentChoice 共用类型 */
type ChoiceData = { chapterIndex: number; prompt: string; options: ChoiceOption[] };
type ChoiceDisplay = { prompt: string; options: ChoiceOption[] };

// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): StoryCompleteData 用 canonical type (../../types)
// eslint-disable-next-line no-duplicate-imports
import type { StoryCompleteData } from '../../types';

/** setTimeout 句柄类型 */
type TimeoutHandle = ReturnType<typeof setTimeout>;

/** sessionHook 方法 ref 类型 */
type SessionHookResetFn = () => void;
type SessionHookCreateSessionFn = (params: CreateSessionParams) => Promise<void>;
type SessionHookContinueStoryFn = () => Promise<void>;

/**
 * usePlayerActions 参数: 所有 dispatch / refs / callbacks / sessionHook
 */
export interface UsePlayerActionsParams {
  dispatch: Dispatch<NormalPlayerAction>;
  transitionPhase: (next: NormalPhase, reason?: string) => void;
  totalChapters: number;
  sessionHook: UseButterflySessionReturn;
  t: ReturnType<typeof import('@/i18n/provider')['useI18n']>['t']; // 🔧 架构优化 Round 58: i18n for fallback choices
  refs: {
    phaseRef: MutableRefObject<NormalPhase>;
    currentChoiceRef: MutableRefObject<ChoiceDisplay | null>;
    currentChapterIndexRef: MutableRefObject<number>;
    currentSceneIndexRef: MutableRefObject<number>;
    completedChaptersRef: MutableRefObject<ChapterData[]>;
    isLoadingRef: MutableRefObject<boolean>;
    choicesRef: MutableRefObject<Record<number, string>>;
    decisionTypeRef: MutableRefObject<DecisionType | null>;
    decisionDescRef: MutableRefObject<string>;
    butterflyEffectRef: MutableRefObject<string | null>;
    finalToneRef: MutableRefObject<StoryTone | null>;
    isStreamingChapterRef: MutableRefObject<boolean>;
    processedChapterIndicesRef: MutableRefObject<Set<number>>;
    waitingForChoiceRef: MutableRefObject<boolean>;
    userClickedForChoiceRef: MutableRefObject<boolean>;
    pendingChoiceRef: MutableRefObject<ChoiceData | null>;
    choiceTimeoutRef: MutableRefObject<TimeoutHandle | null>;
    storyCompleteRef: MutableRefObject<StoryCompleteData | null>;
    hasRestoredRef: MutableRefObject<boolean>;
    restorationTimeoutRef: MutableRefObject<TimeoutHandle | null>;
    safetyNetTimeoutRef: MutableRefObject<TimeoutHandle | null>;
    preloadAfterChoiceTimeoutRef: MutableRefObject<TimeoutHandle | null>;
    autoAdvanceTimeoutRef: MutableRefObject<TimeoutHandle | null>;
    chapterAdvanceTimeoutRef: MutableRefObject<TimeoutHandle | null>;
    sessionHookResetRef: MutableRefObject<SessionHookResetFn>;
    sessionHookCreateSessionRef: MutableRefObject<SessionHookCreateSessionFn>;
    sessionHookContinueStoryRef: MutableRefObject<SessionHookContinueStoryFn>;
    sessionHookSessionRef: MutableRefObject<ButterflySession | null>;
    pollAbortedRef: MutableRefObject<boolean>;
    pollCycleRef: MutableRefObject<number>;
    lastProcessedErrorRef: MutableRefObject<string | null>;
  };
}

// ============================================================
// Hook
// ============================================================

export function usePlayerActions(params: UsePlayerActionsParams) {
  const { dispatch, transitionPhase, totalChapters, sessionHook, t } = params;
  const {
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
  } = params.refs;

  // ============================================================
  // V17-1: 进度恢复 — 从后端加载的 session 恢复播放器状态
  // ============================================================

  useEffect(() => {
    if (hasRestoredRef.current) return;
    const session = sessionHook.session;
    if (!session) return;
    // 只在 idle 状态且没有决策信息时恢复（说明是刚挂载，不是新建会话）
    if (phaseRef.current !== 'idle' || decisionTypeRef.current !== null) {
      return;
    }

    hasRestoredRef.current = true;
    logger.info('[NormalPlayer] Restoring session from backend, status:', session.status, 'chapters:', session.chapters.length);

    // 设置决策信息
    dispatch({ type: 'SET_DECISION_TYPE', payload: session.decisionType });
    dispatch({ type: 'SET_DECISION_DESCRIPTION', payload: session.decisionDescription });
    decisionTypeRef.current = session.decisionType;
    decisionDescRef.current = session.decisionDescription;

    // 标记所有已有章节为已处理
    for (const ch of session.chapters) {
      processedChapterIndicesRef.current.add(ch.index);
    }

    // 转换章节
    const converted = session.chapters.map(convertStoryChapterToChapterData);
    dispatch({ type: 'SET_COMPLETED_CHAPTERS', payload: converted });
    // ★ V23: 立即同步 ref，避免 advance() 找不到章节 ★
    completedChaptersRef.current = converted;

    // 提取选择
    const sessionChoices: Record<number, string> = {};
    for (const c of session.choices) {
      if (c.selectedOption) {
        sessionChoices[c.chapterIndex] = c.selectedOption;
      }
    }
    dispatch({ type: 'SET_CHOICES', payload: sessionChoices });
    choicesRef.current = sessionChoices;

    // ★ V23: 确保流式状态已清除 ★
    dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: false });
    isStreamingChapterRef.current = false;
    dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: null });
    dispatch({ type: 'SET_IS_LOADING', payload: false });
    isLoadingRef.current = false;

    if (session.status === 'completed') {
      // V31: 已完成会话 → 不直接跳完成页！保持 idle 让用户选择开始新故事
      // 之前的行为是直接跳完成页，导致用户一进 Gacha Tab 就看到完成页，误以为是 bug
      logger.info('[NormalPlayer] V31: Found completed session, staying in idle to let user start fresh');
      // 重置恢复标记，让 start() 能正常工作
      hasRestoredRef.current = false;
      // 清除已加载的 session 数据（保持 idle 状态干净）
      dispatch({ type: 'SET_DECISION_TYPE', payload: null });
      dispatch({ type: 'SET_DECISION_DESCRIPTION', payload: '' });
      decisionTypeRef.current = null;
      decisionDescRef.current = '';
      dispatch({ type: 'SET_COMPLETED_CHAPTERS', payload: [] });
      completedChaptersRef.current = [];
      dispatch({ type: 'SET_CHOICES', payload: {} });
      choicesRef.current = {};
      // 保持 idle 阶段 — 用户点击 "Start a New Future Gacha" 时会创建新会话
      // 旧的已完成会话会在 reset() 中被删除
    } else if (session.status === 'active') {
      // 活跃会话 → 恢复到合适的位置
      const pendingChoice = session.choices.find(c => !c.selectedOption);
      if (pendingChoice) {
        // 🔧 BUG-248 fix: 验证选择对应的章节确实在 completedChapters 中
        // 如果章节还没生成完（比如 SSE 中断），不应该进入 choosing 阶段
        const choiceChapter = converted.find(ch => ch.index === pendingChoice.chapterIndex);
        // 🔧 Bug 26 fix (crossroads UI 不渲染): 旧代码要求 choiceChapter.scenes.length > 0 && scenes[0].text
        //   但章节 content 可能为空 (SSE 中断时 choice_prompt 已到但 chapter content 未流式完成)。
        //   这种情况下, choice 数据是完整的 (prompt + options), 用户应该能做选择。
        //   根因修复: 放宽条件 — 只要 choiceChapter 存在 (章节标题已生成), 就进入 choosing 阶段。
        //   如果章节内容为空, ChoiceCard 会正常显示, 用户选择后继续故事。
        if (choiceChapter) {
          // 有未完成的选择 + 对应章节已创建 (标题已有, content 可能为空) → 进入选择阶段
          dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: pendingChoice.chapterIndex });
          dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
          dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
            prompt: pendingChoice.prompt,
            options: pendingChoice.options,
          } });
          pendingChoiceRef.current = {
            chapterIndex: pendingChoice.chapterIndex,
            prompt: pendingChoice.prompt,
            options: pendingChoice.options,
          };
          transitionPhase('choosing');
        } else {
          // 🔧 BUG-248 fix: 章节未完成 → 进入 playing 阶段显示最后一个完成的章节
          // 然后自动继续故事获取缺失的章节
          if (converted.length > 0) {
            const lastChapter = converted[converted.length - 1];
            dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: lastChapter.index });
            dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
            transitionPhase('playing');

            // 延迟自动继续故事
            restorationTimeoutRef.current = setTimeout(() => {
              restorationTimeoutRef.current = null;
              // 🔧 ARCH fix (Round 26 R25-5 — restoration setTimeout 用 stale sessionHook 闭包):
              //    旧代码直接读 sessionHook.session/continueStory (effect 闭包, 可能过期)。
              //    若旧 setTimeout 在新 session 创建后才 fire, 会在新 session 上误调 continueStory。
              //    根因修复: 用 ref (sessionHookSessionRef/sessionHookContinueStoryRef) 读最新值。
              if (sessionHookSessionRef.current?.status === 'completed') {
                const bf = sessionHookSessionRef.current.butterflyEffect || 'Your butterfly effect story is complete.';
                const ft = sessionHookSessionRef.current.finalTone || 'twist';
                dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf });
                dispatch({ type: 'SET_FINAL_TONE', payload: ft });
                finalToneRef.current = ft;
                butterflyEffectRef.current = bf;
                transitionPhase('complete');
                return;
              }
              dispatch({ type: 'SET_IS_LOADING', payload: true });
              sessionHookContinueStoryRef.current().catch(err => {
                logger.error('[NormalPlayer] Auto-continue after restoration (pending choice chapter missing) failed:', err);
                dispatch({ type: 'SET_IS_LOADING', payload: false });
              });
            }, 2000);
          } else {
            // 没有完成章节 → 保持 idle
            logger.info('[NormalPlayer] No completed chapters in active session with pending choice, staying idle');
          }
        }
      } else if (converted.length > 0) {
        // 有已完成章节 → 找到正确的恢复位置
        // ★ V25: 如果最后一个章节的选择已经被做出，应该继续到下一章 ★
        const lastChapter = converted[converted.length - 1];
        const lastChapterChoice = session.choices.find(c => c.chapterIndex === lastChapter.index);

        const lastChoiceOption = lastChapterChoice?.selectedOption ?? null;
        if (lastChapter.hasChoice && lastChoiceOption) {
          // ★ V25: 最后章节的选择已做出 → 需要继续到下一章 ★
          const nextChapterIdx = lastChapter.index + 1;
          const nextChapter = converted.find(ch => ch.index === nextChapterIdx);

          if (nextChapter) {
            // 下一章已经存在 → 直接播放
            dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIdx });
            dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
            transitionPhase('playing');

            // 缓存下一章的 choice 数据（如果有）
            if (nextChapter.hasChoice) {
              const nextChoice = session.choices.find(c => c.chapterIndex === nextChapterIdx);
              if (nextChoice) {
                pendingChoiceRef.current = {
                  chapterIndex: nextChoice.chapterIndex,
                  prompt: nextChoice.prompt,
                  options: nextChoice.options,
                };
              }
            }
          } else {
            // 下一章不存在 → 需要流式获取
            // 先显示当前最后一个章节（让用户看到上下文），然后自动获取下一章
            dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: lastChapter.index });
            dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
            transitionPhase('playing');

            // 记录选择已经做出
            choicesRef.current[lastChapter.index] = lastChoiceOption;
            dispatch({ type: 'UPDATE_CHOICES', payload: prev => ({ ...prev, [lastChapter.index]: lastChoiceOption }) });

            // V26: 延迟自动获取下一章，避免与正在进行的 SSE 流冲突
            // 等待 2 秒确保任何进行中的操作完成
            // BUG-6: 追踪 timeout 以便组件卸载时清理
            // 🔧 ARCH fix (Round 26 R25-5): 用 ref 替代闭包, 防 stale sessionHook
            restorationTimeoutRef.current = setTimeout(() => {
              restorationTimeoutRef.current = null;
              // 再次检查：如果 session 已经完成，不需要 continueStory
              if (sessionHookSessionRef.current?.status === 'completed') {
                const bf = sessionHookSessionRef.current.butterflyEffect || 'Your butterfly effect story is complete.';
                const ft = sessionHookSessionRef.current.finalTone || 'twist';
                dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf });
                dispatch({ type: 'SET_FINAL_TONE', payload: ft });
                finalToneRef.current = ft;
                butterflyEffectRef.current = bf;
                transitionPhase('complete');
                return;
              }
              dispatch({ type: 'SET_IS_LOADING', payload: true });
              sessionHookContinueStoryRef.current().catch(err => {
                logger.error('[NormalPlayer] Auto-continue after restoration failed:', err);
                // V26: 如果 continueStory 失败，检查是否是因为故事已完成
                if (sessionHookSessionRef.current?.status === 'completed') {
                  const bf2 = sessionHookSessionRef.current.butterflyEffect || 'Your butterfly effect story is complete.';
                  const ft2 = sessionHookSessionRef.current.finalTone || 'twist';
                  dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: bf2 });
                  dispatch({ type: 'SET_FINAL_TONE', payload: ft2 });
                  finalToneRef.current = ft2;
                  butterflyEffectRef.current = bf2;
                  transitionPhase('complete');
                } else {
                  // 清除错误，让用户可以重试
                  dispatch({ type: 'SET_ERROR', payload: null });
                  lastProcessedErrorRef.current = null;
                }
                dispatch({ type: 'SET_IS_LOADING', payload: false });
              });
            }, 2000);
          }
        } else {
          // 最后章节没有已做出的选择，或者没有选择 → 播放最后一个章节
          dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: lastChapter.index });
          dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
          transitionPhase('playing');

          // ★ V23: 如果最后一个章节有选择，缓存 choice 数据 ★
          if (lastChapter.hasChoice) {
            const existingChoice = session.choices.find(c => c.chapterIndex === lastChapter.index);
            if (existingChoice) {
              pendingChoiceRef.current = {
                chapterIndex: existingChoice.chapterIndex,
                prompt: existingChoice.prompt,
                options: existingChoice.options,
              };
            } else {
              // 该章节有选择但 session 中没有 choice 数据 → 需要从后端获取
              waitingForChoiceRef.current = true;
            }
          }
        }
      }
      // 如果没有任何章节（只有大纲），保持 idle 让用户点击开始
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [sessionHook.session]);

  // ============================================================
  // 开始新会话
  // ============================================================

  const start = useCallback(async (params: CreateSessionParams): Promise<boolean> => {
    // 🔧 P0-B fix: 返回 boolean 表示成功/失败, 让调用方判断是否扣减 gacha count
    //   旧代码: 返回 Promise<void>, 内部 catch 所有错误 → 调用方无法判断是否成功
    //   → butterfly-tab.tsx 用 closure errorP (stale) 判断 → 永远 truthy → 即使失败也扣减 gacha count
    //   修复: 返回 true=成功 (streamStoryService 启动), false=失败 (catch 块)
    // 🔧 429 fix (Round 40): 客户端 guard — 如果已经在 loading (generating outline),
    //   直接 return, 防止双击/快速重试触发第二个 POST (服务端 lock 会 429)。
    //   NormalPhase 没有 'generating_outline' 状态, 用 isLoadingRef 判断。
    // 🔧 2026-07-15 P0 fix (Gacha UI stuck v3, architecture-level): isLoadingRef guard 在 v3 修复后
    //   不再需要 (streamStoryService 流结束时 sendBack STREAM_DONE, machine 自动转 idle, isLoading=false).
    //   但保留 if 分支作日志, 万一未来又出现 stale streaming 状态可快速定位.
    if (isLoadingRef.current) {
      logger.info('[NormalPlayer] start() called while loading — machine on.CREATE_SESSION will resetContext first');
      // 不 return, 直接继续走 CREATE_SESSION 流程 (machine 全局 on.CREATE_SESSION 会先 resetContext)
    }
    // 标记已恢复（防止恢复逻辑干扰新会话）
    hasRestoredRef.current = true;

    // BUG-002 fix: 不再先调 reset（send RESET + DELETE），避免竞态条件
    // machine 的全局 CREATE_SESSION 会先 resetContext 清旧数据
    // reset 只在用户明确点 Abandon 时调

    // 保存决策信息（必须在 createSession 之前设置，供 chapter_start effect 检测）
    dispatch({ type: 'SET_DECISION_TYPE', payload: params.decisionType });
    dispatch({ type: 'SET_DECISION_DESCRIPTION', payload: params.decisionDescription });
    decisionTypeRef.current = params.decisionType;
    decisionDescRef.current = params.decisionDescription;

    // 重置所有状态
    dispatch({ type: 'SET_IS_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    lastProcessedErrorRef.current = null;
    dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 1 });
    dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
    dispatch({ type: 'SET_COMPLETED_CHAPTERS', payload: [] });
    dispatch({ type: 'SET_CURRENT_CHOICE', payload: null });
    dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: null });
    dispatch({ type: 'SET_FINAL_TONE', payload: null });
    finalToneRef.current = null;
    dispatch({ type: 'SET_CHOICES', payload: {} });
    choicesRef.current = {};
    processedChapterIndicesRef.current.clear();
    waitingForChoiceRef.current = false;
    userClickedForChoiceRef.current = false;
    pendingChoiceRef.current = null;
    dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: false });
    isStreamingChapterRef.current = false;
    dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: null });

    try {
      // SSE 流式获取（chapter_start effect 会自动切换到 playing）
      // V35: 使用 ref 调用，避免依赖不稳定的 sessionHook 对象
      await sessionHookCreateSessionRef.current(params);

      // BUG-026 fix: 移除过时的 phase 安全检查
      // send CREATE_SESSION 是同步的，machine 进 generating_outline 但 POST 异步未完成，
      // phase 此时还是 idle 是正常的（不是 bug）。chapter_start effect 会自动触发 phase→playing。
      // 之前的检查会误判"createSession 失败"并调 continueStory，导致竞态条件。
      // 如果生成失败，machine 进 error 状态，UI 会显示 Try Again。
      return true;  // 🔧 P0-B fix: 成功
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to start session' });
      dispatch({ type: 'SET_IS_LOADING', payload: false });
      return false;  // 🔧 P0-B fix: 失败
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []); // V35: 使用 refs 调用 sessionHook 方法，不再依赖 sessionHook 对象

  // 🔧 Bug fix: advanceToNextChapterRef — 让 advance 函数能调 advanceToNextChapter (定义在后面)
  // 用 ref 避免 "used before declaration" 错误, advanceToNextChapter 定义后立即赋值
  const advanceToNextChapterRef = useRef<(() => void) | null>(null);

  const advance = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    if (isLoadingRef.current) return;

    // 流式模式下不允许推进（章节还在生成中）
    if (isStreamingChapterRef.current) return;

    const currentChapter = completedChaptersRef.current.find(ch => ch.index === currentChapterIndexRef.current);
    if (!currentChapter) return;

    // 如果还有下一个场景
    if (currentSceneIndexRef.current < currentChapter.scenes.length - 1) {
      dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: currentSceneIndexRef.current + 1 });
      return;
    }

    // 当前章节所有场景都看完了
    if (currentChapter.hasChoice) {
      // 🔧 BUG-250 fix: 检查当前章节的选择是否已经做出
      // 如果选择已做（从 choicesRef 中能找到），直接进入 chapterComplete 而非 choosing
      const existingChoice = choicesRef.current[currentChapterIndexRef.current];
      if (existingChoice) {
        // 选择已做 → 进入 chapterComplete 插页，然后可以推进到下一章
        transitionPhase('chapterComplete');
        return;
      }

      const pendingChoice = pendingChoiceRef.current;
      if (pendingChoice && pendingChoice.chapterIndex === currentChapterIndexRef.current) {
        dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
          prompt: pendingChoice.prompt,
          options: pendingChoice.options,
        } });
        transitionPhase('choosing');
      } else {
        // ★ V24: 进入 choosing 阶段，即使 pendingChoice 还没到 ★
        // 用户点击了「MAKE YOUR CHOICE」→ 立即过渡到 choosing
        // 如果 choice 数据尚未到达 → currentChoice=null → 显示加载状态
        dispatch({ type: 'SET_CURRENT_CHOICE', payload: null });
        userClickedForChoiceRef.current = true;
        transitionPhase('choosing');
        // 注意：不再调用 continueStory()。choice 数据通过 SSE choice_prompt 事件到达，
        // pendingChoice effect 会在数据到达时自动更新 currentChoice

        // 🔧 BUG-327 fix: 超时 fallback — 如果 15 秒内 choice 数据没到，
        // N69 fix: 延长到 35s（后端 choice 生成最多 20s + buffer），先尝试 DB reload，再 fallback 默认选项
        // 🔧 Bug 26 fix: 缩短到 20s (后端最多 20s + buffer 已经足够), 让用户更早看到 fallback
        if (choiceTimeoutRef.current) clearTimeout(choiceTimeoutRef.current);
        choiceTimeoutRef.current = setTimeout(async () => {
          choiceTimeoutRef.current = null;
          // 仍在 choosing 且 currentChoice 仍为空
          if (phaseRef.current === 'choosing' && !currentChoiceRef.current) {
            logger.warn('[NormalPlayer] Choice data timeout (20s) — reloading session to fetch choice');
            try {
              // 先尝试从 DB 重新加载 session 获取 choice 数据
              // 🔧 ARCH fix (Round 11 H2): 传 sessionId 防止加载错误的 session
              const currentSessionId = sessionHookSessionRef.current?.id;
              const sessionUrl = currentSessionId
                ? `/api/butterfly/session?sessionId=${currentSessionId}`
                : '/api/butterfly/session';
              // 🔧 架构优化 Round 59: 用 apiFetch 替代 raw fetch (Finding 8)
              const data = await apiFetch<{ session?: ButterflySession | null }>(sessionUrl);
              const sess = data.session;
              if (sess && sess.choices && sess.choices.length > 0) {
                const pendingChoiceForSession = sess.choices.find((c: { selectedOption: string | null }) => !c.selectedOption);
                if (pendingChoiceForSession) {
                  logger.info('[NormalPlayer] Choice data found in DB after timeout');
                  pendingChoiceRef.current = {
                    chapterIndex: pendingChoiceForSession.chapterIndex,
                    prompt: pendingChoiceForSession.prompt,
                    options: pendingChoiceForSession.options,
                  };
                  dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
                    prompt: pendingChoiceForSession.prompt,
                    options: pendingChoiceForSession.options,
                  } });
                  return;
                }
              }
      // safe to ignore: non-critical background operation, error already logged
            } catch (e) {
                          // safe to ignore: non-critical background operation, error already logged
              logger.warn('[NormalPlayer] DB reload for choice failed:', e);
            }
            // DB 也没有 → fallback 默认选项，让用户能继续
            logger.warn('[NormalPlayer] Using fallback choice options');
            const fallbackChoice = getFallbackChoice(t);
            pendingChoiceRef.current = {
              chapterIndex: currentChapterIndexRef.current,
              ...fallbackChoice,
            };
            dispatch({ type: 'SET_CURRENT_CHOICE', payload: fallbackChoice });
          }
        }, 20_000);
      }
      return;
    }

    // 没有选择
    // 🔧 Bug fix (非 crossroads 章节不应弹 chapterComplete 对话框):
    //   旧代码: 所有 hasChoice:false 的章节都进 chapterComplete 插页 (显示 "Continue to Next Chapter" + "Abandon")
    //   用户反馈: 只有 crossroads 才需要弹选择, 其他章节应直接推进
    //   修复:
    //   - 最后一章 (currentChapterIndex >= totalChapters): 进 chapterComplete (显示 "See Your Future")
    //   - 非最后一章 + hasChoice:false: 自动推进到下一章 (跳过 chapterComplete 插页)
    const isLastChapter = currentChapterIndexRef.current >= totalChapters;
    if (isLastChapter) {
      // 最后一章 → chapterComplete 插页 (显示 "See Your Future")
      transitionPhase('chapterComplete');
    } else {
      // 非最后一章 + 无选择 → 直接推进到下一章 (跳过 chapterComplete 插页)
      // 🔧 Bug fix: 不再先 transitionPhase('chapterComplete') 再调 advanceToNextChapter (stale closure)
      //   直接在这里推进到下一章, 不经过 chapterComplete 阶段
      const nextChapterIndex = currentChapterIndexRef.current + 1;
      logger.info(`[NormalPlayer] auto-advancing to next chapter ${nextChapterIndex} (skipping chapterComplete)`);
      // 🔧 ARCH fix (Round 40 LOW-2): 用 autoAdvanceTimeoutRef 追踪 800ms timer
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'playing') {
          // 仍在 playing 阶段 (用户没切走), 直接推进到下一章
          // 检查下一章是否已在 completedChapters 中 (已生成)
          const nextChapter = completedChaptersRef.current.find(ch => ch.index === nextChapterIndex);
          if (nextChapter) {
            // 下一章已存在 → 直接播放
            dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIndex });
            dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
            // phase 保持 'playing'
          } else {
            // 下一章不存在 → 需要 SSE 流式获取
            // 先设 chapterComplete + isLoading, 让 advanceToNextChapter 处理
            dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: nextChapterIndex });
            dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
            dispatch({ type: 'SET_IS_LOADING', payload: true });
            transitionPhase('chapterComplete');
            // 🔧 ARCH fix (Round 40 LOW-2): 用 chapterAdvanceTimeoutRef 追踪 100ms timer
            if (chapterAdvanceTimeoutRef.current) clearTimeout(chapterAdvanceTimeoutRef.current);
            chapterAdvanceTimeoutRef.current = setTimeout(() => {
              advanceToNextChapterRef.current?.();
              chapterAdvanceTimeoutRef.current = null;
            }, 100);
          }
        }
        autoAdvanceTimeoutRef.current = null;
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []); // V35: advance 只使用 refs，不需要 sessionHook 依赖

  // ============================================================
  // 🔧 Bug 26 fix: retryChoice — 用户手动重试加载 choice 数据
  //   场景: 20s timeout 内用户已等不及, 主动点 "Retry" 按钮
  //   逻辑: 立即清掉 timeout + 调 DB reload + fallback (复用 timeout 内的逻辑)
  // ============================================================
  const retryChoice = useCallback(async () => {
    // 只在 choosing 阶段且 currentChoice 为空时生效
    if (phaseRef.current !== 'choosing' || currentChoiceRef.current) return;
    logger.info('[NormalPlayer] retryChoice: user-triggered choice reload');

    // 清掉 pending timeout (防 double-fire)
    if (choiceTimeoutRef.current) {
      clearTimeout(choiceTimeoutRef.current);
      choiceTimeoutRef.current = null;
    }

    try {
      const currentSessionId = sessionHookSessionRef.current?.id;
      const sessionUrl = currentSessionId
        ? `/api/butterfly/session?sessionId=${currentSessionId}`
        : '/api/butterfly/session';
      // 🔧 架构优化 Round 59: 用 apiFetch 替代 raw fetch (Finding 8)
      const data = await apiFetch<{ session?: ButterflySession | null }>(sessionUrl);
      const sess = data.session;
      if (sess && sess.choices && sess.choices.length > 0) {
        const pendingChoiceForSession = sess.choices.find((c: { selectedOption: string | null }) => !c.selectedOption);
        if (pendingChoiceForSession) {
          logger.info('[NormalPlayer] retryChoice: choice data found in DB');
          pendingChoiceRef.current = {
            chapterIndex: pendingChoiceForSession.chapterIndex,
            prompt: pendingChoiceForSession.prompt,
            options: pendingChoiceForSession.options,
          };
          dispatch({ type: 'SET_CURRENT_CHOICE', payload: {
            prompt: pendingChoiceForSession.prompt,
            options: pendingChoiceForSession.options,
          } });
          return;
        }
      }
    } catch (e) {
      logger.warn('[NormalPlayer] retryChoice DB reload failed:', e);
    }

    // DB 没有 → 直接用 fallback
    logger.warn('[NormalPlayer] retryChoice: using fallback choice options');
    const fallbackChoice = getFallbackChoice(t);
    pendingChoiceRef.current = {
      chapterIndex: currentChapterIndexRef.current,
      ...fallbackChoice,
    };
    dispatch({ type: 'SET_CURRENT_CHOICE', payload: fallbackChoice });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []);

  // ============================================================
  // V27: 从 chapterComplete 推进到下一章节
  // ============================================================

  const advanceToNextChapter = useCallback(() => advanceToNextChapterImpl({
    dispatch, transitionPhase, totalChapters, sessionHook, phaseRef,
    currentChapterIndexRef, completedChaptersRef, isLoadingRef,
    butterflyEffectRef, finalToneRef, isStreamingChapterRef,
    processedChapterIndicesRef, pendingChoiceRef, storyCompleteRef,
    pollAbortedRef, pollCycleRef,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }), [sessionHook, totalChapters]);

  // 🔧 ARCH fix (Round 65 LOW-7): 把 advanceToNextChapterRef.current = ... 从 render 阶段移到 useLayoutEffect
  //   旧代码: 在 render body 直接 `advanceToNextChapterRef.current = advanceToNextChapter;` (line 1361)
  //   → React 19 Compiler / eslint react-hooks/refs 报 "Cannot access refs during render"。
  //   根因修复: 用 useLayoutEffect 在 commit 阶段同步赋值 (而非 useEffect 异步, 防止 advance()
  //   在 effect 触发前调用读到 null ref)。useLayoutEffect 保证在任何用户事件前完成 ref 写入。
  useLayoutEffect(() => {
    advanceToNextChapterRef.current = advanceToNextChapter;
  }, [advanceToNextChapter]);

  // ============================================================
  // N74 fix: 跳转到指定章节（回看已完成的章节）
  // ============================================================

  const goToChapter = useCallback((chapterIndex: number) => {
    // 只允许跳转到已完成的章节
    const targetChapter = completedChaptersRef.current.find(ch => ch.index === chapterIndex);
    if (!targetChapter) return;

    // 如果正在流式或加载中，不允许跳转
    if (isStreamingChapterRef.current || isLoadingRef.current) return;

    dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: chapterIndex });
    dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
    transitionPhase('playing');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []);

  // ============================================================
  // 提交选择
  // ============================================================

  const selectChoice = useCallback((optionId: string) => selectChoiceImpl({
    optionId, dispatch, transitionPhase, totalChapters, sessionHook, phaseRef,
    currentChapterIndexRef, completedChaptersRef, choicesRef,
    waitingForChoiceRef, userClickedForChoiceRef, pendingChoiceRef,
    butterflyEffectRef, finalToneRef, storyCompleteRef,
    processedChapterIndicesRef, preloadAfterChoiceTimeoutRef,
    sessionHookSessionRef,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }), [sessionHook]);

  // ============================================================
  // 重新开始
  // ============================================================

  const reset = useCallback(() => {
    sessionHookResetRef.current(); // V35: 使用 ref 调用
    transitionPhase('idle');
    dispatch({ type: 'SET_DECISION_TYPE', payload: null });
    dispatch({ type: 'SET_DECISION_DESCRIPTION', payload: '' });
    dispatch({ type: 'SET_CURRENT_CHAPTER_INDEX', payload: 1 });
    dispatch({ type: 'SET_CURRENT_SCENE_INDEX', payload: 0 });
    dispatch({ type: 'SET_COMPLETED_CHAPTERS', payload: [] });
    dispatch({ type: 'SET_CURRENT_CHOICE', payload: null });
    dispatch({ type: 'SET_BUTTERFLY_EFFECT', payload: null });
    dispatch({ type: 'SET_FINAL_TONE', payload: null });
    finalToneRef.current = null;
    dispatch({ type: 'SET_CHOICES', payload: {} });
    choicesRef.current = {};
    dispatch({ type: 'SET_IS_LOADING', payload: false });
    dispatch({ type: 'SET_ERROR', payload: null });
    lastProcessedErrorRef.current = null;
    decisionTypeRef.current = null;
    decisionDescRef.current = '';
    processedChapterIndicesRef.current.clear();
    waitingForChoiceRef.current = false;
    userClickedForChoiceRef.current = false;
    pendingChoiceRef.current = null;
    dispatch({ type: 'SET_IS_STREAMING_CHAPTER', payload: false });
    isStreamingChapterRef.current = false;
    dispatch({ type: 'SET_STREAMING_CHAPTER_META', payload: null });
    // 🔧 BUG-252 fix: 中止 pollAndFetch 递归轮询
    pollAbortedRef.current = true;
    // 重置恢复标记，让下次挂载时可以重新恢复
    hasRestoredRef.current = false;
    // BUG-6/7: 清理所有 pending 的 setTimeout
    if (restorationTimeoutRef.current) {
      clearTimeout(restorationTimeoutRef.current);
      restorationTimeoutRef.current = null;
    }
    if (safetyNetTimeoutRef.current) {
      clearTimeout(safetyNetTimeoutRef.current);
      safetyNetTimeoutRef.current = null;
    }
    // 🔧 Round 37 H1: reset 时清理 preloadAfterChoice timer
    if (preloadAfterChoiceTimeoutRef.current) {
      clearTimeout(preloadAfterChoiceTimeoutRef.current);
      preloadAfterChoiceTimeoutRef.current = null;
    }
    // 🔧 ARCH fix (Round 40 LOW-2): reset 时清理 autoAdvance + chapterAdvance timers
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    if (chapterAdvanceTimeoutRef.current) {
      clearTimeout(chapterAdvanceTimeoutRef.current);
      chapterAdvanceTimeoutRef.current = null;
    }
    // 🔧 BUG-327 fix: 清理 choice 超时
    if (choiceTimeoutRef.current) {
      clearTimeout(choiceTimeoutRef.current);
      choiceTimeoutRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, []); // V35: 使用 ref 调用 sessionHook.reset()，不再依赖 sessionHook 对象

  return {
    start,
    advance,
    selectChoice,
    advanceToNextChapter,
    retryChoice,
    goToChapter,
    reset,
  };
}
