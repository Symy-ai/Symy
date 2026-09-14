/**
 * DialogueBox — Galgame-style bottom text area for StoryViewer.
 *
 * 🔧 Round 80 F4: extracted from story-viewer.tsx (was 982 lines, target <800).
 *    Shows scene text with typewriter effect, scene progress dots, and chapter label.
 */

'use client';

import { useCallback } from 'react';
import type { StoryTone } from '../../types';
import { TONE_COLORS } from './helpers';
import { useTypewriter } from './use-typewriter';
import { useI18n } from '@/i18n/provider';

export interface DialogueBoxProps {
  sceneText: string;
  tone: StoryTone;
  chapterIndex: number;
  sceneIndex: number;
  totalScenes: number;
  isLastScene: boolean;
  onAdvance: () => void;
  isLiveStreaming?: boolean;
  chapterTitle?: string;
  /** 当前场景的图片数量（用于显示镜头指示器） */
  shotCount?: number;
  /** 当前显示的镜头索引 */
  currentShot?: number;
}

export function DialogueBox({
  sceneText,
  tone,
  chapterIndex,
  sceneIndex,
  totalScenes,
  isLastScene,
  onAdvance,
  isLiveStreaming,
  chapterTitle,
  shotCount,
  currentShot,
}: DialogueBoxProps) {
  const { t } = useI18n();
  const colors = TONE_COLORS[tone] || TONE_COLORS.neutral;

  const { displayedText, isComplete, skipToEnd } = useTypewriter(
    sceneText,
    25, // V3: 更快的打字速度，因为文字更短
    !isLiveStreaming
  );

  const handleClick = useCallback(() => {
    if (!isComplete && !isLiveStreaming) {
      skipToEnd();
      return;
    }
    onAdvance();
  }, [isComplete, isLiveStreaming, skipToEnd, onAdvance]);

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col justify-end cursor-pointer select-none"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      aria-label={t('storyViewer.tapToContinue')}
    >
      {/* 台词框区域 */}
      <div className="px-4 pb-8 pt-24">
        {/* 台词框容器 */}
        <div
          className="rounded-2xl px-5 py-4 backdrop-blur-md"
          style={{
            backgroundColor: 'rgba(0,0,0,0.65)',
            border: `1px solid ${colors.borderColor}`,
            boxShadow: `0 0 20px ${colors.borderColor}`,
          }}
        >
          {/* 顶部：章节标签 + 场景进度 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: colors.accentBg, color: colors.accentColor }}
              >
                {t('butterfly.chapterLabelShort', { n: chapterIndex, defaultValue: 'CH.{n}' })}
              </span>
              {chapterTitle && (
                <span className="text-[11px] text-gray-400 truncate max-w-[160px]">
                  {chapterTitle}
                </span>
              )}
            </div>
            {/* 场景点状进度条 */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalScenes }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === sceneIndex ? '8px' : '4px',
                    height: '4px',
                    backgroundColor: i <= sceneIndex ? colors.dotColor : 'rgba(255,255,255,0.15)',
                    boxShadow: i === sceneIndex ? colors.glowCSS : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 镜头指示器（多图轮播时显示） */}
          {(shotCount && shotCount > 1) ? (
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: shotCount }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: (currentShot !== undefined && i === currentShot % shotCount) ? '6px' : '3px',
                    height: '3px',
                    backgroundColor: (currentShot !== undefined && i <= currentShot % shotCount)
                      ? colors.accentColor
                      : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
          ) : null}

          {/* 场景文本 — 大字，清晰 */}
          <div className="min-h-[2rem]">
            <p className={`text-gray-100 leading-relaxed text-[17px] whitespace-pre-wrap font-light ${colors.text}`}>
              {displayedText}
              {/* 流式输出光标 */}
              {isLiveStreaming && !isComplete && (
                <span
                  className="inline-block w-0.5 h-5 ml-0.5 align-text-bottom animate-pulse"
                  style={{ backgroundColor: colors.accentColor }}
                />
              )}
            </p>
          </div>

          {/* 推进指示器 */}
          {isComplete && !isLiveStreaming && (
            <div className="flex items-center justify-center mt-2">
              <div className="flex items-center gap-1.5 animate-pulse">
                <span className="text-[10px] text-gray-500 tracking-wider">
                  {/* 🔧 P3-9 fix: i18n 覆盖 — 不再硬编码英文 */}
                  {isLastScene ? t('butterfly.endOfChapter', { defaultValue: 'END OF CHAPTER' }) : t('butterfly.tap', { defaultValue: 'TAP' })}
                </span>
                <svg viewBox="0 0 16 16" className="w-3 h-3 text-gray-500" fill="currentColor">
                  <path d="M6 3l5 5-5 5V3z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
