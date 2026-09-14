/**
 * Chapter Complete View — 章节完成插页
 *
 * 提取自 src/features/butterfly/components/butterfly-tab.tsx (Round 98 拆分)
 * 显示: 最后场景图片 + 章节完成卡片 + Continue/Abandon 按钮
 */

'use client';

import { useI18n } from '@/i18n/provider';
import type { StoryTone } from '../../types';
import type { ChapterData } from '../../hooks/player/types';
import {
  TONE_ACCENT_COLORS,
  TONE_ACCENT_COLORS_LIGHT,
  TONE_BORDER_COLORS,
  TONE_BORDER_COLORS_LIGHT,
  TONE_EMOJI,
} from '../tab';

interface ChapterCompleteViewProps {
  isLight: boolean;
  isDemo: boolean;
  currentChapterInfo: ChapterData | null;
  currentChapterIndex: number;
  isLastChapter: boolean;
  onAdvanceToNextChapter: () => void;
  onReset: () => void;
}

export function ChapterCompleteView({
  isLight,
  isDemo,
  currentChapterInfo,
  currentChapterIndex,
  isLastChapter,
  onAdvanceToNextChapter,
  onReset,
}: ChapterCompleteViewProps) {
  const { t } = useI18n();

  const chInfo = currentChapterInfo || {
    index: currentChapterIndex || 1,
    title: t('butterfly.chapterComplete'),
    tone: 'neutral' as StoryTone,
    timeSpan: '',
    hasChoice: false,
    scenes: [{ text: '', imageUrl: '' }],
  };
  const lastScene = chInfo.scenes[chInfo.scenes.length - 1];
  const accentColor = isLight ? (TONE_ACCENT_COLORS_LIGHT[chInfo.tone] || '#6b7280') : (TONE_ACCENT_COLORS[chInfo.tone] || '#d1d5db');
  const borderColor = isLight ? (TONE_BORDER_COLORS_LIGHT[chInfo.tone] || 'rgba(107,114,128,0.25)') : (TONE_BORDER_COLORS[chInfo.tone] || 'rgba(156,163,175,0.25)');
  const toneEmoji = TONE_EMOJI[chInfo.tone] || '🎰';

  const overlayBg = isLight ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  const cardBg = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.7)';
  const titleClass = isLight ? 'text-gray-900' : 'text-white';
  const subtitleClass = isLight ? 'text-gray-600' : 'text-gray-300';

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-gray-100' : 'bg-gray-950'}`}>
      <div className="relative flex-1 overflow-hidden">
        {lastScene?.imageUrl ? (
          <>
            <img
              src={lastScene.imageUrl}
              alt={`Chapter ${chInfo.index} complete`}
              className="w-full h-full object-cover"
              style={{ filter: isLight ? 'brightness(1.15) saturate(0.85)' : 'none' }}
            />
            <div className="absolute inset-0 pointer-events-none" style={{
              background: isLight
                ? 'linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.75) 15%, rgba(255,255,255,0.35) 35%, transparent 55%)'
                : 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 15%, rgba(0,0,0,0.35) 35%, rgba(0,0,0,0.08) 45%, transparent 55%)'
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{
              background: isLight
                ? 'linear-gradient(to bottom, rgba(255,255,255,0.35) 0%, transparent 15%)'
                : 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 15%)'
            }} />
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: isLight ? 'inset 0 0 100px rgba(255,255,255,0.4)' : 'inset 0 0 100px rgba(0,0,0,0.6)' }} />
          </>
        ) : (
          <div className="w-full h-full" style={{
            background: isLight
              ? 'radial-gradient(ellipse at center, rgba(220,225,235,0.8) 0%, rgba(245,247,250,1) 70%)'
              : 'radial-gradient(ellipse at center, rgba(30,30,50,0.8) 0%, rgba(10,14,26,1) 70%)'
          }} />
        )}

        <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: overlayBg }} />

        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="mx-6 rounded-3xl px-6 py-8 backdrop-blur-md text-center max-w-sm w-full"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${borderColor}`,
              boxShadow: `0 0 30px ${borderColor}`,
            }}
          >
            <div className="text-4xl mb-3">{toneEmoji}</div>
            <span
              className="text-[11px] font-mono font-bold px-3 py-1 rounded-full inline-block mb-3"
              style={{ backgroundColor: `${accentColor}22`, color: accentColor, border: `1px solid ${borderColor}` }}
            >
              {t('butterfly.chComplete', { n: chInfo.index })}
            </span>
            <h3 className={`text-xl font-bold ${titleClass} mb-2`}>
              {chInfo.title}
            </h3>
            <p className={`text-sm ${subtitleClass} mb-6`}>
              {chInfo.timeSpan}
            </p>
            <button
              onClick={onAdvanceToNextChapter}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 cursor-pointer"
            >
              {isLastChapter ? t('butterfly.seeYourFuture', { defaultValue: 'See Your Future →' }) : t('butterfly.continueToNext')}
            </button>
            {/* 🔧 N14 fix: chapterComplete 阶段也加放弃按钮 */}
            <button
              onClick={() => {
                if (confirm(t('butterfly.abandonConfirm'))) {
                  onReset();
                }
              }}
              className={`w-full mt-2 py-2 text-xs ${isLight ? 'text-gray-400 hover:text-red-500' : 'text-text-tertiary hover:text-red-400'} transition-colors`}
            >
              {t('butterfly.abandonStory')}
            </button>
            {isDemo && (
              <div className="flex justify-center mt-3">
                <span className="text-[10px] font-medium text-amber-700 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">👁️ {t('butterfly.demoModeBadge')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
