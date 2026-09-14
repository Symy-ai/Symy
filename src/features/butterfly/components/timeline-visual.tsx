/**
 * TimelineVisual — 剧情时间线可视化
 *
 * 显示大纲中的所有章节，用视觉方式展示剧情走向。
 * 已完成的章节亮显，当前章节有动画，未来章节暗淡。
 */

'use client';

import type { StoryOutline, StoryChapter, StoryTone } from '../types';

// ============================================================
// Props
// ============================================================

interface TimelineVisualProps {
  /** 大纲 */
  outline: StoryOutline | null;
  /** 已完成的章节 */
  completedChapters: StoryChapter[];
  /** 当前章节序号 */
  currentChapterIndex: number;
  /** 是否为亮色模式 */
  isLight?: boolean;
}

// ============================================================
// 基调颜色
// ============================================================

const TONE_DOT_COLORS: Record<StoryTone, string> = {
  hopeful: 'bg-emerald-400',
  neutral: 'bg-gray-400',
  dark: 'bg-red-400',
  twist: 'bg-purple-400',
};

const TONE_GLOW_COLORS: Record<StoryTone, string> = {
  hopeful: 'shadow-emerald-400/50',
  neutral: 'shadow-gray-400/30',
  dark: 'shadow-red-400/50',
  twist: 'shadow-purple-400/50',
};

// ============================================================
// 组件
// ============================================================

export function TimelineVisual({
  outline,
  completedChapters,
  currentChapterIndex,
  isLight = false,
}: TimelineVisualProps) {
  if (!outline || outline.chapters.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-0.5">
        {outline.chapters.map((chapter, i) => {
          const isCompleted = completedChapters.some(c => c.index === chapter.index);
          const isCurrent = chapter.index === currentChapterIndex + 1;
          const isFuture = chapter.index > currentChapterIndex + 1;

          return (
            <div key={chapter.index} className="flex items-center flex-1">
              {/* 章节点 */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`
                    w-3 h-3 rounded-full transition-all duration-500
                    ${isCompleted
                      ? `${TONE_DOT_COLORS[chapter.tone]} shadow-md ${TONE_GLOW_COLORS[chapter.tone]}`
                      : isCurrent
                        ? `${TONE_DOT_COLORS[chapter.tone]} shadow-lg ${TONE_GLOW_COLORS[chapter.tone]} animate-pulse scale-125`
                        : isFuture
                          ? isLight ? 'bg-gray-300' : 'bg-gray-700'
                          : isLight ? 'bg-gray-300' : 'bg-gray-600'
                    }
                  `}
                  title={`${chapter.title} (${chapter.tone})`}
                />
              </div>

              {/* 连接线 */}
              {i < outline.chapters.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-1 transition-colors duration-500
                    ${isCompleted ? (isLight ? 'bg-gray-400' : 'bg-gray-600') : (isLight ? 'bg-gray-200' : 'bg-gray-800')}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 结局暗示 */}
      <div className="mt-2 text-center">
        <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-400'} italic`}>
          {outline.endingHint}
        </span>
      </div>
    </div>
  );
}
