/**
 * ChapterTransition — full-screen chapter intro overlay.
 *
 * 🔧 Round 80 F4: extracted from story-viewer.tsx (was 982 lines, target <800).
 *    Shows chapter number, title, and time span for 2.2 seconds.
 */

'use client';

import { useEffect } from 'react';
import type { StoryTone } from '../../types';
import { TONE_COLORS } from './helpers';
import { useI18n } from '@/i18n/provider';

export interface ChapterTransitionProps {
  chapterIndex: number;
  title: string;
  tone: StoryTone;
  timeSpan: string;
  onComplete: () => void;
}

export function ChapterTransition({ chapterIndex, title, tone, timeSpan, onComplete }: ChapterTransitionProps) {
  const { t } = useI18n();
  const colors = TONE_COLORS[tone] || TONE_COLORS.neutral;

  useEffect(() => {
    const timer = setTimeout(onComplete, 2200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* 基调色光晕 */}
      <div
        className="absolute w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: colors.dotColor }}
      />

      <div className="relative text-center space-y-3 animate-in fade-in duration-700">
        {/* 章节号 */}
        <span
          className="text-xs font-mono font-bold px-3 py-1 rounded-full tracking-widest"
          style={{ backgroundColor: colors.accentBg, color: colors.accentColor }}
        >
          {/* 🔧 P3-9 fix: i18n 覆盖 */}
          {t('butterfly.chapterLabel', { n: chapterIndex, defaultValue: 'CHAPTER {n}' })}
        </span>

        {/* 标题 */}
        <h2 className={`text-2xl font-bold ${colors.text}`} style={{ textShadow: colors.glowCSS }}>
          {title}
        </h2>

        {/* 时间跨度 */}
        <p className="text-sm text-gray-500 tracking-wide">
          {timeSpan}
        </p>
      </div>
    </div>
  );
}
