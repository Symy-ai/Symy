/**
 * useButterflyDemoPlayer — Demo模式专用播放器Hook
 *
 * V26: 恢复 chapterComplete 阶段（V20原有功能）
 *
 * 核心理念：Demo模式所有内容都是预设的，完全不需要SSE流！
 * 纯客户端状态机，用户手动点击推进每个场景。
 *
 * 流程：
 * 1. 用户输入决策 → 加载预设大纲+章节内容
 * 2. 逐场景展示：场景图(预设CDN URL) + 剧情文字 → 用户点击 → 下一场景
 * 3. 章节内所有场景看完 → chapterComplete 插页 → 用户点击 → 下一章
 * 4. 如果有选择 → 显示选择卡
 * 5. 用户选择 → 记录选择 → 进入下一章
 * 6. 3章看完 → 蝴蝶效应总结页
 *
 * 绝不调用AI生成图片，使用预设CDN URL
 */

'use client';

import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  type DemoLocale,
  generateDemoOutline,
  generateDemoChapterContent,
  generateDemoChoice,
  generateDemoSummary,
  getDemoSceneIllustrations,
} from '../lib/demo-content';
import type {
  DecisionType,
  CreateSessionParams,
  StoryTone,
  StoryOutline,
  ChoiceOption,
} from '../types';
import { splitScenes } from '@/features/butterfly/hooks/player';
import { DEFAULT_CHAPTER_COUNT } from '../lib/engine';
import { logger } from '@/lib/logger';
import { useI18n } from '@/i18n/provider';

// ============================================================
// 类型
// ============================================================

/** 场景数据 */
interface SceneData {
  /** 场景文本 */
  text: string;
  /** 场景插图URL */
  imageUrl: string;
}

/** 章节数据（已分割为场景） */
interface ChapterData {
  /** 章节序号（1-3） */
  index: number;
  /** 章节标题 */
  title: string;
  /** 基调 */
  tone: StoryTone;
  /** 时间跨度 */
  timeSpan: string;
  /** 该章节是否有选择 */
  hasChoice: boolean;
  /** 分割后的场景列表 */
  scenes: SceneData[];
}

/** 播放阶段 */
type DemoPhase = 'idle' | 'playing' | 'choosing' | 'chapterComplete' | 'complete';

/** Hook返回值 */
export interface UseButterflyDemoPlayerReturn {
  /** 当前阶段 */
  phase: DemoPhase;
  /** 决策类型 */
  decisionType: DecisionType | null;
  /** 决策描述 */
  decisionDescription: string;
  /** 大纲 */
  outline: StoryOutline | null;
  /** 当前章节索引（1-3） */
  currentChapterIndex: number;
  /** 当前场景索引（0-based） */
  currentSceneIndex: number;
  /** 当前章节的所有场景 */
  currentScenes: SceneData[];
  /** 当前章节信息 */
  currentChapterInfo: ChapterData | null;
  /** 所有已完成的章节（用于完成页回顾） */
  completedChapters: ChapterData[];
  /** 当前选择提示 */
  currentChoice: { prompt: string; options: ChoiceOption[] } | null;
  /** 蝴蝶效应总结 */
  butterflyEffect: string | null;
  /** 最终基调 */
  finalTone: StoryTone | null;
  /** 总章节数 */
  totalChapters: number;
  /** 用户已做出的选择 */
  choices: Record<number, string>;
  /** 是否正在加载（初始创建时短暂为true） */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  /** 开始Demo */
  startDemo: (params: CreateSessionParams) => void;
  /** 推进到下一场景/章节 */
  advance: () => void;
  /** 提交选择 */
  selectChoice: (optionId: string) => void;
  /** 重新开始 */
  reset: () => void;
  /** 是否正在流式接收章节内容（Demo 永远为 false） */
  isStreamingChapter: boolean;
  /** 是否在等待推进到下一章节（chapterComplete 阶段） */
  waitingForNextChapter: boolean;
  /** 从 chapterComplete 阶段推进到下一章节 */
  advanceToNextChapter: () => void;
  /** N74 fix: 跳转到指定章节（回看已完成的章节） */
  goToChapter: (chapterIndex: number) => void;
}

// ============================================================
// Hook
// ============================================================

export function useButterflyDemoPlayer(): UseButterflyDemoPlayerReturn {
  const { locale } = useI18n();
  // ---- 状态 ----
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [decisionType, setDecisionType] = useState<DecisionType | null>(null);
  const [decisionDescription, setDecisionDescription] = useState('');
  const [outline, setOutline] = useState<StoryOutline | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(1);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [completedChapters, setCompletedChapters] = useState<ChapterData[]>([]);
  const [currentChoice, setCurrentChoice] = useState<{ prompt: string; options: ChoiceOption[] } | null>(null);
  const [butterflyEffect, setButterflyEffect] = useState<string | null>(null);
  const [finalTone, setFinalTone] = useState<StoryTone | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingForNextChapter, setWaitingForNextChapter] = useState(false);

  // 🔧 Bug fix: refs for advanceToNextChapter (防 setTimeout 内 stale closure)
  const phaseRef = useRef(phase);
  const currentChapterIndexRef = useRef(currentChapterIndex);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentChapterIndexRef.current = currentChapterIndex; }, [currentChapterIndex]);

  // BUG-13 fix: Version counter to invalidate currentChapterInfo memo when choices change
  const [choicesVersion, setChoicesVersion] = useState(0);

  // 用ref追踪choices，避免闭包问题
  const choicesRef = useRef<Record<number, string>>({});
  const decisionTypeRef = useRef<DecisionType | null>(null);
  const decisionDescRef = useRef('');
  const [demoLocale, setDemoLocale] = useState<DemoLocale>(locale);

  // BUG-8: 追踪 startDemo 中的 setTimeout，组件卸载时清理
  const startDemoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔧 ARCH fix (Round 40 LOW-1 — autoAdvance setTimeout 未追踪, 卸载/reset 时泄漏):
  //    旧代码: line 313 setTimeout(() => { ... }, 800) 不保存 ref, 卸载/reset 时不清。
  //    800ms 内用户切走/reset, timer 仍触发 setState on unmounted component。
  //    根因修复: 用 autoAdvanceTimeoutRef 追踪, cleanup 和 reset 时 clearTimeout。
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 计算当前章节数据 ----

  const currentChapterInfo = useMemo<ChapterData | null>(() => {
    if (phase === 'idle' || phase === 'complete') return null;
    // chapterComplete 阶段也需要当前章节信息（用于插页显示）
    if (!outline) return null;
    const chOutline = outline.chapters.find(c => c.index === currentChapterIndex);
    if (!chOutline) return null;

    // 🔧 FIX-React19: 用 state 替代 ref (React 19 禁止 render 中读 ref)
    // 之前: decisionTypeRef.current / decisionDescRef.current / choicesRef.current
    // 现在: decisionType / decisionDescription / choices (state, 参与 useMemo deps)
    const content = generateDemoChapterContent(
      currentChapterIndex,
      decisionType || 'bought',
      decisionDescription,
      choices,
      demoLocale,
    );
    const sceneTexts = splitScenes(content);
    const sceneIllustrations = getDemoSceneIllustrations(currentChapterIndex);

    const scenes: SceneData[] = sceneTexts.map((text, idx) => {
      const imgs = sceneIllustrations[idx];
      // 🔧 ARCH fix (Round 65 LOW-5): 移除冗余 `as unknown as string` 双重断言
      //   旧代码: typeof imgs === 'string' ? (imgs as unknown as string) — TS 在 typeof === 'string'
      //   分支里已将 imgs 收窄为 string, 双重断言多余且掩盖真实类型。
      const imageUrl = Array.isArray(imgs) && imgs.length > 0
        ? imgs[0]
        : typeof imgs === 'string'
          ? imgs
          : sceneIllustrations[0]?.[0] || '';

      return { text, imageUrl };
    });

    return {
      index: chOutline.index,
      title: chOutline.title,
      tone: chOutline.tone,
      timeSpan: chOutline.timeSpan,
      hasChoice: chOutline.hasChoice,
      scenes,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [phase, outline, currentChapterIndex, choicesVersion, decisionType, decisionDescription, choices, demoLocale]);

  const currentScenes = useMemo<SceneData[]>(() => {
    return currentChapterInfo?.scenes || [];
  }, [currentChapterInfo]);

  const totalChapters = useMemo(() => {
    return outline?.chapters.length || DEFAULT_CHAPTER_COUNT;
  }, [outline]);

  // ---- 开始Demo ----

  const startDemo = useCallback((params: CreateSessionParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const dt = params.decisionType;
      const desc = params.decisionDescription;

      decisionTypeRef.current = dt;
      decisionDescRef.current = desc;
      choicesRef.current = {};

      setDecisionType(dt);
      setDecisionDescription(desc);
      setChoices({});
      setDemoLocale(locale);

      // 生成大纲
      const demoOutline = generateDemoOutline(dt, desc, locale);
      setOutline(demoOutline);

      // 从第1章开始
      setCurrentChapterIndex(1);
      setCurrentSceneIndex(0);
      setCompletedChapters([]);
      setCurrentChoice(null);
      setButterflyEffect(null);
      setFinalTone(null);
      setWaitingForNextChapter(false);

      // 短暂loading模拟大纲生成
      // BUG-8: 追踪 timeout 以便组件卸载时清理
      startDemoTimeoutRef.current = setTimeout(() => {
        startDemoTimeoutRef.current = null;
        setIsLoading(false);
        setPhase('playing');
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start demo');
      setIsLoading(false);
    }
  }, [locale]);

  // ---- 推进到下一场景/章节 ----

  // 🔧 Bug fix: advanceToNextChapterRef — 让 advance 函数能调 advanceToNextChapter (定义在后面)
  const advanceToNextChapterRef = useRef<(() => void) | null>(null);

  const advance = useCallback(() => {
    logger.info('[DemoPlayer] advance called', { phase, currentSceneIndex, hasChapterInfo: !!currentChapterInfo, chapterIndex: currentChapterIndex });
    if (phase !== 'playing' || !currentChapterInfo) return;

    const scenes = currentChapterInfo.scenes;

    // 如果还有下一个场景，推进到下一场景
    if (currentSceneIndex < scenes.length - 1) {
      logger.info('[DemoPlayer] advancing to next scene', currentSceneIndex + 1);
      setCurrentSceneIndex(prev => prev + 1);
      return;
    }

    // 当前章节所有场景都看完了
    logger.info('[DemoPlayer] all scenes viewed for chapter', currentChapterIndex, 'hasChoice:', currentChapterInfo.hasChoice);

    // 把当前章节加入已完成列表
    setCompletedChapters(prev => {
      if (prev.some(c => c.index === currentChapterInfo.index)) return prev;
      return [...prev, currentChapterInfo];
    });

    // 如果当前章节有选择，进入选择阶段
    if (currentChapterInfo.hasChoice) {
      const choiceData = generateDemoChoice(
        currentChapterIndex,
        decisionTypeRef.current || 'bought',
        decisionDescRef.current,
        demoLocale,
      );
      setCurrentChoice(choiceData);
      setPhase('choosing');
      return;
    }

    // 没有选择
    // 🔧 Bug fix (非 crossroads 章节不应弹 chapterComplete 对话框):
    //   旧代码: 所有 hasChoice:false 的章节都进 chapterComplete 插页
    //   修复:
    //   - 最后一章 (currentChapterIndex >= totalChapters): 进 chapterComplete (显示 "See Your Future")
    //   - 非最后一章 + hasChoice:false: 自动推进到下一章 (跳过 chapterComplete 插页)
    logger.info('[DemoPlayer] all scenes viewed for chapter', currentChapterIndex, 'no choice, isLastChapter:', currentChapterIndex >= totalChapters);
    if (currentChapterIndex >= totalChapters) {
      // 最后一章 → chapterComplete 插页 (显示 "See Your Future")
      setPhase('chapterComplete');
    } else {
      // 非最后一章 + 无选择 → 直接推进到下一章 (跳过 chapterComplete 插页)
      // 🔧 Bug fix: 不再先 setPhase('chapterComplete') 再调 advanceToNextChapter (stale closure)
      //   直接在这里推进到下一章, 不经过 chapterComplete 阶段
      const nextChapterIndex = currentChapterIndex + 1;
      logger.info('[DemoPlayer] auto-advancing to next chapter', nextChapterIndex, '(skipping chapterComplete)');
      // 用 setTimeout(800) 让用户看到最后一个 scene 的完整内容再推进
      // 🔧 ARCH fix (Round 40 LOW-1): 用 autoAdvanceTimeoutRef 追踪, 卸载/reset 时 clearTimeout
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        // 仍在 playing 阶段 (用户没切走), 直接推进到下一章
        if (phaseRef.current === 'playing') {
          setCurrentChapterIndex(nextChapterIndex);
          setCurrentSceneIndex(0);
          // phase 保持 'playing', 不经过 chapterComplete
        }
        autoAdvanceTimeoutRef.current = null;
      }, 800);
    }
  }, [phase, currentChapterInfo, currentSceneIndex, currentChapterIndex, totalChapters, demoLocale]);

  // ---- 从 chapterComplete 推进到下一章 ----

  const advanceToNextChapter = useCallback(() => {
    // 🔧 Bug fix: 用 ref 读最新 phase (而非闭包 phase), 防 setTimeout 内 stale closure
    if (phaseRef.current !== 'chapterComplete') return;

    const nextChapterIndex = currentChapterIndexRef.current + 1;
    logger.info('[DemoPlayer] advanceToNextChapter: from', currentChapterIndexRef.current, 'to', nextChapterIndex, 'totalChapters:', totalChapters);

    if (nextChapterIndex <= totalChapters) {
      setCurrentChapterIndex(nextChapterIndex);
      setCurrentSceneIndex(0);
      setPhase('playing');
    } else {
      // 所有章节完成，进入总结页
      const summary = generateDemoSummary(
        decisionTypeRef.current || 'bought',
        decisionDescRef.current,
        demoLocale,
      );
      const ft = outline?.chapters[outline.chapters.length - 1]?.tone || 'twist';
      setButterflyEffect(summary);
      setFinalTone(ft);
      setPhase('complete');
    }
  }, [totalChapters, outline, demoLocale]);

  // 🔧 ARCH fix (Round 65 LOW-7): 把 advanceToNextChapterRef.current = ... 从 render 阶段移到 useLayoutEffect
  //   旧代码: 在 render body 直接 `advanceToNextChapterRef.current = advanceToNextChapter;` (line 359)
  //   → React 19 Compiler / eslint react-hooks/refs 报 "Cannot access refs during render"。
  //   根因修复: 用 useLayoutEffect 在 commit 阶段同步赋值 (而非 useEffect 异步, 防止 advance()
  //   在 effect 触发前调用读到 null ref)。
  useLayoutEffect(() => {
    advanceToNextChapterRef.current = advanceToNextChapter;
  }, [advanceToNextChapter]);

  // ---- 提交选择 ----

  const selectChoice = useCallback((optionId: string) => {
    if (phase !== 'choosing') return;

    // 记录选择
    choicesRef.current[currentChapterIndex] = optionId;
    setChoices(prev => ({ ...prev, [currentChapterIndex]: optionId }));
    setChoicesVersion(v => v + 1);
    setCurrentChoice(null);

    // 进入章节完成插页
    setPhase('chapterComplete');
  }, [phase, currentChapterIndex]);

  // ---- BUG-8: 组件卸载时清理 setTimeout ----

  useEffect(() => {
    return () => {
      if (startDemoTimeoutRef.current) {
        clearTimeout(startDemoTimeoutRef.current);
        startDemoTimeoutRef.current = null;
      }
      // 🔧 ARCH fix (Round 40 LOW-1): 清理 autoAdvance timer
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
    };
  }, []);

  // ---- 重新开始 ----

  const reset = useCallback(() => {
    setPhase('idle');
    setDecisionType(null);
    setDecisionDescription('');
    setOutline(null);
    setCurrentChapterIndex(1);
    setCurrentSceneIndex(0);
    setCompletedChapters([]);
    setCurrentChoice(null);
    setButterflyEffect(null);
    setFinalTone(null);
    setChoices({});
    setIsLoading(false);
    setError(null);
    setWaitingForNextChapter(false);
    choicesRef.current = {};
    decisionTypeRef.current = null;
    decisionDescRef.current = '';
    // BUG-8: 清理 startDemo 的 pending setTimeout
    if (startDemoTimeoutRef.current) {
      clearTimeout(startDemoTimeoutRef.current);
      startDemoTimeoutRef.current = null;
    }
    // 🔧 ARCH fix (Round 40 LOW-1): 清理 autoAdvance timer
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  }, []);

  return {
    phase,
    decisionType,
    decisionDescription,
    outline,
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
    startDemo,
    advance,
    selectChoice,
    reset,
    isStreamingChapter: false, // Demo 永远不流式
    waitingForNextChapter,
    advanceToNextChapter,
    goToChapter: () => {}, // N74 fix: Demo 模式暂不支持回看
  };
}
