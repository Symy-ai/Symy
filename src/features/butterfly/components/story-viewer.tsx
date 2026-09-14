/**
 * StoryViewer V3 — 真·Galgame / 视觉小说 风格
 *
 * V3 核心变化：
 * - 每个场景有自己的独立图片（sceneIllustrations[sceneIdx]）
 * - 没有场景图片时 fallback 到章节封面图（illustrationUrl）
 * - 图片随场景切换而变化，真正实现"图片为主"
 * - 场景间图片交叉淡入淡出
 * - 文字极简（每场景1句话），叠加在画面上
 * - 氛围粒子效果（根据基调变化）
 *
 * 🔧 Round 80 F4: 提取子组件到 story-viewer/ 子目录 (982 → ~350 行)
 *    - helpers.ts: TONE_COLORS + splitScenes + groupIntoScenes
 *    - use-typewriter.ts: useTypewriter hook
 *    - atmosphere-particles.tsx: AtmosphereParticles
 *    - full-screen-image.tsx: FullScreenImage
 *    - dialogue-box.tsx: DialogueBox
 *    - chapter-transition.tsx: ChapterTransition
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { StoryChapter, StoryTone } from '../types';
import { splitScenes } from './story-viewer/helpers';
import { AtmosphereParticles } from './story-viewer/atmosphere-particles';
import { FullScreenImage } from './story-viewer/full-screen-image';
import { DialogueBox } from './story-viewer/dialogue-box';
import { ChapterTransition } from './story-viewer/chapter-transition';

// ============================================================
// Props
// ============================================================

interface StoryViewerProps {
  /** 已完成的章节 */
  chapters: StoryChapter[];
  /** 当前正在流式输出的文本 */
  streamingText: string;
  /** 当前章节信息 */
  currentChapterInfo: { chapterIndex: number; title: string; tone: StoryTone; timeSpan: string; illustrationUrl?: string } | null;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 当前流式章节的插图 URL */
  streamingIllustrationUrl?: string;
  /** 重新生成指定章节的插图 */
  onRegenerateIllustration?: (chapterIndex: number) => Promise<string | null>;
  /** 正在重新生成插图的章节索引集合 */
  regeneratingChapters?: Set<number>;
  /** 正在生成场景插图的标记（chapterIndex-sceneIndex） */
  generatingSceneIllustrations?: Set<string>;
  /** V4: 流式输出期间，当前章节的场景插图（sceneIndex → 图片URL数组）
   *  Demo模式：章节开始时即从预置URL填充，无需等待章节结束
   *  正常模式：章节完成后由AI生成，此值为空 */
  streamingSceneIllustrations?: Record<number, string[]>;
  /** V19: Whether the current theme is light mode (affects SVG placeholder bg) */
  isLight?: boolean;
}

export function StoryViewer({
  chapters,
  streamingText,
  currentChapterInfo,
  isStreaming,
  streamingIllustrationUrl,
  onRegenerateIllustration,
  regeneratingChapters,
  generatingSceneIllustrations,
  streamingSceneIllustrations,
  isLight,
}: StoryViewerProps) {
  // ---- 状态 ----

  const [viewingChapterIdx, setViewingChapterIdx] = useState(0);
  const [viewingSceneIdx, setViewingSceneIdx] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [userIsViewingStream, setUserIsViewingStream] = useState(false);
  // 章节过渡画面
  const [showChapterTransition, setShowChapterTransition] = useState<{ index: number; title: string; tone: StoryTone; timeSpan: string } | null>(null);

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // ---- 计算场景数据 ----

  const chapterScenes = useMemo(() => {
    return chapters.map(ch => splitScenes(ch.content));
  }, [chapters]);

  const shouldShowStreaming = isStreaming && currentChapterInfo !== null && !chapters.some(c => c.index === currentChapterInfo.chapterIndex);

  const streamingScenes = useMemo(() => {
    return splitScenes(streamingText || '');
  }, [streamingText]);

  const streamingSceneIdx = useMemo(() => {
    return Math.max(0, streamingScenes.length - 1);
  }, [streamingScenes.length]);

  // 当开始流式输出时，自动切换到流式视图 + 显示章节过渡
  const prevShouldShowStreamingRef = useRef(false);
  if (shouldShowStreaming && !prevShouldShowStreamingRef.current) {
    setUserIsViewingStream(true);
    if (currentChapterInfo) {
      setShowChapterTransition({
        index: currentChapterInfo.chapterIndex,
        title: currentChapterInfo.title,
        tone: currentChapterInfo.tone,
        timeSpan: currentChapterInfo.timeSpan,
      });
    }
  }
  prevShouldShowStreamingRef.current = shouldShowStreaming;

  // 当新章节完成时，自动推进到最新章节
  const prevChapterCountRef = useRef(chapters.length);
  if (chapters.length > prevChapterCountRef.current) {
    const latestIdx = chapters.length - 1;
    setViewingChapterIdx(latestIdx);
    setViewingSceneIdx(0);
    setUserIsViewingStream(false);
  }
  prevChapterCountRef.current = chapters.length;

  if (!shouldShowStreaming && userIsViewingStream) {
    setUserIsViewingStream(false);
  }

  // ---- 推进逻辑 ----

  const handleAdvance = useCallback(() => {
    if (isTransitioning || userIsViewingStream) return;

    const currentScenes = chapterScenes[viewingChapterIdx];
    if (!currentScenes) return;

    if (viewingSceneIdx < currentScenes.length - 1) {
      setIsTransitioning(true);
      setViewingSceneIdx(prev => prev + 1);
      transitionTimerRef.current = setTimeout(() => setIsTransitioning(false), 350);
    } else {
      if (viewingChapterIdx < chapters.length - 1) {
        const nextIdx = viewingChapterIdx + 1;
        const nextChapter = chapters[nextIdx];
        setIsTransitioning(true);
        setViewingChapterIdx(nextIdx);
        setViewingSceneIdx(0);
        if (nextChapter) {
          setShowChapterTransition({
            index: nextChapter.index,
            title: nextChapter.title,
            tone: nextChapter.tone,
            timeSpan: nextChapter.timeSpan,
          });
        }
        transitionTimerRef.current = setTimeout(() => setIsTransitioning(false), 350);
      }
    }
  }, [isTransitioning, userIsViewingStream, viewingChapterIdx, viewingSceneIdx, chapterScenes, chapters]);

  // 快速跳到最新
  const handleJumpToLatest = useCallback(() => {
    if (shouldShowStreaming) {
      setUserIsViewingStream(true);
      return;
    }
    if (chapters.length > 0) {
      const latestIdx = chapters.length - 1;
      const latestScenes = chapterScenes[latestIdx];
      setViewingChapterIdx(latestIdx);
      setViewingSceneIdx(latestScenes ? latestScenes.length - 1 : 0);
      setUserIsViewingStream(false);
      setShowChapterTransition(null);
    }
  }, [shouldShowStreaming, chapters.length, chapterScenes]);

  // 关闭章节过渡画面
  const handleTransitionComplete = useCallback(() => {
    setShowChapterTransition(null);
  }, []);

  // ---- 确定当前显示的章节和图片 ----

  const currentDisplayChapter: StoryChapter | null = userIsViewingStream
    ? null
    : chapters[viewingChapterIdx] || null;

  const displayTone: StoryTone = userIsViewingStream && currentChapterInfo
    ? currentChapterInfo.tone
    : currentDisplayChapter?.tone || 'neutral';

  const displayChapterIndex: number = userIsViewingStream
    ? currentChapterInfo?.chapterIndex || 0
    : currentDisplayChapter?.index || 0;

  const displayChapterTitle: string | undefined = userIsViewingStream
    ? currentChapterInfo?.title
    : currentDisplayChapter?.title;

  // ★★★ V4 核心：每场景多张图片自动轮播 ★★★
  // sceneIllustrations[sceneIdx] 是 string[]（多张图）
  // 自动轮播：每 3 秒切换一张，循环播放
  const SHOT_CAROUSEL_INTERVAL = 3000; // 3秒切换

  const [shotCarouselIdx, setShotCarouselIdx] = useState(0);

  // 当场景或章节切换时，重置轮播索引
  useEffect(() => {
    setShotCarouselIdx(0);
  }, [viewingChapterIdx, viewingSceneIdx, userIsViewingStream]);

  const displayIllustrationUrl: string | undefined = useMemo(() => {
    if (userIsViewingStream) {
      // V4: 流式输出阶段 — 优先使用场景专属插图
      if (streamingSceneIllustrations) {
        const sceneImgs = streamingSceneIllustrations[streamingSceneIdx];
        if (Array.isArray(sceneImgs) && sceneImgs.length > 0) {
          const idx = shotCarouselIdx % sceneImgs.length;
          return sceneImgs[idx];
        }
        // 兼容旧格式：单 URL string
        if (typeof sceneImgs === 'string') return sceneImgs as unknown as string;
      }
      // Fallback 到章节封面图
      return currentChapterInfo?.illustrationUrl || streamingIllustrationUrl;
    }
    // 已完成章节：检查是否有场景专属插图（数组）
    if (currentDisplayChapter?.sceneIllustrations) {
      const sceneImgs = currentDisplayChapter.sceneIllustrations[viewingSceneIdx];
      if (Array.isArray(sceneImgs) && sceneImgs.length > 0) {
        // 轮播：根据 shotCarouselIdx 选择当前显示的图片
        const idx = shotCarouselIdx % sceneImgs.length;
        return sceneImgs[idx];
      }
      // 兼容旧格式：如果不是数组（单 URL string），直接用
      if (typeof sceneImgs === 'string') return sceneImgs as unknown as string;
    }
    // Fallback 到章节封面图
    return currentDisplayChapter?.illustrationUrl;
  }, [userIsViewingStream, streamingSceneIllustrations, streamingSceneIdx, shotCarouselIdx, currentChapterInfo, streamingIllustrationUrl, currentDisplayChapter, viewingSceneIdx]);

  // 自动轮播定时器
  useEffect(() => {
    // 已完成章节的多图轮播
    if (!userIsViewingStream) {
      if (!currentDisplayChapter?.sceneIllustrations) return;
      const sceneImgs = currentDisplayChapter.sceneIllustrations[viewingSceneIdx];
      if (!Array.isArray(sceneImgs) || sceneImgs.length <= 1) return;

      const timer = setInterval(() => {
        setShotCarouselIdx(prev => prev + 1);
      }, SHOT_CAROUSEL_INTERVAL);

      return () => clearInterval(timer);
    }
    // V4: 流式阶段的多图轮播
    if (streamingSceneIllustrations) {
      const sceneImgs = streamingSceneIllustrations[streamingSceneIdx];
      if (!Array.isArray(sceneImgs) || sceneImgs.length <= 1) return;

      const timer = setInterval(() => {
        setShotCarouselIdx(prev => prev + 1);
      }, SHOT_CAROUSEL_INTERVAL);

      return () => clearInterval(timer);
    }
  }, [userIsViewingStream, currentDisplayChapter, viewingSceneIdx, streamingSceneIllustrations, streamingSceneIdx]);

  const displaySceneText: string = useMemo(() => {
    if (userIsViewingStream) {
      return streamingScenes[streamingSceneIdx] || streamingText || '';
    }
    const scenes = chapterScenes[viewingChapterIdx];
    return scenes ? scenes[viewingSceneIdx] || '' : '';
  }, [userIsViewingStream, streamingScenes, streamingSceneIdx, streamingText, chapterScenes, viewingChapterIdx, viewingSceneIdx]);

  const displayTotalScenes: number = useMemo(() => {
    if (userIsViewingStream) {
      return Math.max(streamingScenes.length, 1);
    }
    const scenes = chapterScenes[viewingChapterIdx];
    return scenes ? scenes.length : 1;
  }, [userIsViewingStream, streamingScenes.length, chapterScenes, viewingChapterIdx]);

  const isLastScene: boolean = useMemo(() => {
    if (userIsViewingStream) return false;
    const scenes = chapterScenes[viewingChapterIdx];
    if (!scenes) return true;
    return viewingSceneIdx >= scenes.length - 1 && viewingChapterIdx >= chapters.length - 1;
  }, [userIsViewingStream, chapterScenes, viewingChapterIdx, viewingSceneIdx, chapters.length]);

  const showJumpToLatest = !userIsViewingStream && !isStreaming && chapters.length > 0 && (
    viewingChapterIdx < chapters.length - 1 ||
    (viewingChapterIdx === chapters.length - 1 && viewingSceneIdx < (chapterScenes[viewingChapterIdx]?.length || 1) - 1)
  );

  // 是否正在生成当前场景的插图
  const isGeneratingCurrentScene = generatingSceneIllustrations?.has(`${displayChapterIndex}-${viewingSceneIdx}`) || false;

  // ---- 渲染 ----

  return (
    <div className={`relative flex-1 overflow-hidden ${isLight ? 'bg-gray-50' : 'bg-gray-950'}`}>
      {/* 全屏背景图 — 每场景可变化 */}
      <FullScreenImage
        key={displayIllustrationUrl || `fallback-${displayChapterIndex}-${viewingSceneIdx}`}
        illustrationUrl={displayIllustrationUrl}
        tone={displayTone}
        onRegenerate={
          currentDisplayChapter && onRegenerateIllustration
            ? () => onRegenerateIllustration(currentDisplayChapter.index)
            : undefined
        }
        isRegenerating={currentDisplayChapter ? regeneratingChapters?.has(currentDisplayChapter.index) : false}
        isGeneratingScene={isGeneratingCurrentScene}
        isLight={isLight}
      />

      {/* 氛围粒子 */}
      <AtmosphereParticles tone={displayTone} />

      {/* 台词框 — 场景文字 */}
      <div
        className={`absolute inset-0 z-10 transition-opacity duration-300 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {(displaySceneText || (userIsViewingStream && isStreaming)) && !showChapterTransition && (
          <DialogueBox
            key={`${displayChapterIndex}-${userIsViewingStream ? streamingSceneIdx : viewingSceneIdx}`}
            sceneText={displaySceneText}
            tone={displayTone}
            chapterIndex={displayChapterIndex}
            sceneIndex={userIsViewingStream ? streamingSceneIdx : viewingSceneIdx}
            totalScenes={displayTotalScenes}
            isLastScene={isLastScene}
            onAdvance={handleAdvance}
            isLiveStreaming={userIsViewingStream && isStreaming}
            chapterTitle={displayChapterTitle}
            shotCount={(() => {
              // 已完成章节的场景插图
              if (!userIsViewingStream && currentDisplayChapter?.sceneIllustrations) {
                const imgs = currentDisplayChapter.sceneIllustrations[viewingSceneIdx];
                return Array.isArray(imgs) ? imgs.length : undefined;
              }
              // V4: 流式阶段的场景插图
              if (userIsViewingStream && streamingSceneIllustrations) {
                const imgs = streamingSceneIllustrations[streamingSceneIdx];
                return Array.isArray(imgs) ? imgs.length : undefined;
              }
              return undefined;
            })()}
            currentShot={shotCarouselIdx}
          />
        )}

        {/* 流式输出中但还没有文本 */}
        {userIsViewingStream && isStreaming && !streamingText && !showChapterTransition && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-500">Weaving your story...</span>
            </div>
          </div>
        )}
      </div>

      {/* 章节过渡画面 */}
      {showChapterTransition && (
        <ChapterTransition
          chapterIndex={showChapterTransition.index}
          title={showChapterTransition.title}
          tone={showChapterTransition.tone}
          timeSpan={showChapterTransition.timeSpan}
          onComplete={handleTransitionComplete}
        />
      )}

      {/* 跳到最新按钮 */}
      {showJumpToLatest && (
        <button
          onClick={handleJumpToLatest}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/10 text-gray-300 hover:text-white text-xs transition-all cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          Skip to latest
        </button>
      )}
    </div>
  );
}
