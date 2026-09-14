/**
 * PlayingView — 故事播放/选择中的渲染视图.
 *
 * 🔧 Round 80 F7: extracted from butterfly-tab.tsx (was 843 lines, target <800).
 *    Contains: demo banner, decision review + timeline, scene player, choice overlay.
 *
 * Phase: 'playing' (watching story) or 'choosing' (choice prompt visible).
 */

'use client';

import type { DecisionType, StoryOutline, ChoiceOption } from '../../types';
import type { ChapterData } from '../../hooks/player/types';
import { ChoiceCard } from '../choice-card';
import { TimelineVisual } from '../timeline-visual';
import { DemoScenePlayer } from './demo-scene-player';
import { ChoiceLoadingState } from './choice-loading-state';
import { useI18n } from '@/i18n/provider';

export interface PlayingViewProps {
  isDemo?: boolean;
  isLight: boolean;
  isDialogueCollapsed: boolean;
  // chapter info
  chInfo: ChapterData;
  currentSceneIndex: number;
  // decision review
  decisionType: DecisionType | null;
  decisionDesc: string;
  // outline + completed chapters (for timeline)
  outline?: StoryOutline | null;
  completedChapters: ChapterData[];
  currentChapterIndex: number;
  // choice (when phase === 'choosing')
  phase: 'playing' | 'choosing';
  currentChoice?: { prompt: string; options: ChoiceOption[] } | null;
  isStreamingChapter: boolean;
  // callbacks
  onToggleDialogue: () => void;
  onAdvance: () => void;
  onSelectChoice: (optionId: string) => void;
  onRetryChoice: () => void;
  onGoToChapter: (index: number) => void;
  onAbandonStory: () => void;
}

export function PlayingView({
  isDemo,
  isLight,
  isDialogueCollapsed,
  chInfo,
  currentSceneIndex,
  decisionType,
  decisionDesc,
  outline,
  completedChapters,
  currentChapterIndex,
  phase,
  currentChoice,
  isStreamingChapter,
  onToggleDialogue,
  onAdvance,
  onSelectChoice,
  onRetryChoice,
  onGoToChapter,
  onAbandonStory,
}: PlayingViewProps) {
  const { t } = useI18n();
  const currentScene = chInfo.scenes[currentSceneIndex];
  const isLastScene = currentSceneIndex >= chInfo.scenes.length - 1;

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
      {/* 顶部：决策回顾 + 时间线 — 点击展开台词框 */}
      <div className={`flex-shrink-0 border-b ${isLight ? 'border-gray-200' : 'border-glass-border'}`}>
        <div
          className="px-4 pt-3 pb-2 cursor-pointer active:opacity-80 transition-opacity"
          onClick={() => { if (isDialogueCollapsed) onToggleDialogue(); }}
          role="button"
          tabIndex={0}
          aria-label={t('butterfly.expandStoryText')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎰</span>
              <div>
                <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
                  {decisionType === 'bought' ? t('butterfly.youBought') : t('butterfly.youResisted')}
                  {isDemo && <span className={`ml-1.5 ${isLight ? 'text-cyan-600' : 'text-cyan-400/60'}`}>· {t('butterfly.demo')}</span>}
                </div>
                <div className={`text-sm font-medium truncate max-w-[200px] ${isLight ? 'text-gray-800' : 'text-text-secondary'}`}>
                  {decisionDesc}
                </div>
              </div>
            </div>
            {/* 展开提示图标 */}
            {isDialogueCollapsed && (
              <svg viewBox="0 0 16 16" className={`w-4 h-4 ${isLight ? 'text-gray-500' : 'text-gray-500'} animate-pulse`} fill="currentColor">
                <path d="M8 3l5 5H3l5-5zM8 13l5-5H3l5 5z" />
              </svg>
            )}
            {/* 🔧 N74 fix: 上一章按钮 — 回看已完成的章节 */}
            {currentChapterIndex > 1 && completedChapters.some(ch => ch.index < currentChapterIndex) && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const prevChapters = completedChapters.filter(ch => ch.index < currentChapterIndex);
                  if (prevChapters.length > 0) {
                    const prevChapter = prevChapters.sort((a, b) => b.index - a.index)[0];
                    onGoToChapter(prevChapter.index);
                  }
                }}
                className={`ml-1 text-xs px-2 py-1 rounded-lg transition-colors ${isLight ? 'text-gray-400 hover:text-cyan-600 hover:bg-cyan-50' : 'text-text-tertiary hover:text-cyan-400 hover:bg-cyan-500/10'}`}
                aria-label={t('butterfly.previousChapter', { defaultValue: 'Previous chapter' })}
              >
                ←
              </button>
            )}
            {/* 🔧 N14 fix: 放弃故事按钮 — 让用户能退出死锁的故事页 */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm(t('butterfly.abandonConfirm'))) {
                  onAbandonStory();
                }
              }}
              className={`ml-2 text-xs px-2 py-1 rounded-lg transition-colors ${isLight ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-text-tertiary hover:text-red-400 hover:bg-red-500/10'}`}
              aria-label={t('butterfly.abandonStory')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 时间线 */}
        {outline && (
          <TimelineVisual
            outline={outline}
            completedChapters={completedChapters.map(ch => ({
              index: ch.index,
              title: ch.title,
              tone: ch.tone,
              content: ch.scenes.map(s => s.text).join('|||'),
              timeSpan: ch.timeSpan,
              hasChoice: ch.hasChoice,
              createdAt: '',
            }))}
            currentChapterIndex={currentChapterIndex - 1}
            isLight={isLight}
          />
        )}
      </div>

      {/* 场景播放区 */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* 场景图片 + 文字 — 手动点击推进 */}
        {currentScene && (
          <DemoScenePlayer
            key={`${chInfo.index}-${currentSceneIndex}`}
            sceneText={currentScene.text}
            sceneImageUrl={currentScene.imageUrl}
            chapterIndex={chInfo.index}
            chapterTitle={chInfo.title}
            tone={chInfo.tone}
            timeSpan={chInfo.timeSpan}
            sceneIndex={currentSceneIndex}
            totalScenes={chInfo.scenes.length}
            isLastSceneOfChapter={isLastScene}
            hasChoice={chInfo.hasChoice}
            onAdvance={onAdvance}
            isStreaming={isStreamingChapter}
            isLight={isLight}
            isDialogueCollapsed={isDialogueCollapsed}
            onToggleDialogue={onToggleDialogue}
          />
        )}

        {/* 选择覆盖层 */}
        {phase === 'choosing' && currentChoice && (
          <div className={`absolute inset-0 z-30 flex items-end backdrop-blur-sm ${isLight ? 'bg-white/70' : 'bg-black/70'}`}>
            <div className="w-full max-h-[70vh] overflow-y-auto">
              <ChoiceCard
                prompt={currentChoice.prompt}
                options={currentChoice.options}
                onSelect={onSelectChoice}
                isDisabled={false}
                isLight={isLight}
              />
            </div>
          </div>
        )}

        {/* V24: 选择加载状态 — 用户已点击 MAKE YOUR CHOICE 但 choice 数据尚未到达 */}
        {phase === 'choosing' && !currentChoice && (
          <ChoiceLoadingState isLight={isLight} onRetry={onRetryChoice} />
        )}
      </div>
    </div>
  );
}
