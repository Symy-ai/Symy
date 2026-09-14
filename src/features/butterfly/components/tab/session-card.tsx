/**
 * SessionCard — Butterfly history session card
 *
 * 提取自 src/features/butterfly/components/butterfly-history-list.tsx (Round 102 拆分)
 * 显示单个历史会话的卡片: 决策类型 + 描述 + 日期 + 章节进度 + 蝴蝶效应摘要
 *
 * 🔧 2026-07-17 (task 4): 加阅读时长 + 收藏按钮 + considering 类型支持
 *   - 阅读时长: 用 wordCount / 250 wpm 估算, 显示在元信息行
 *   - 收藏按钮: 五角星图标, 点击调 PATCH /api/butterfly/sessions/[id]
 *   - considering 类型: 紫色标签 "CONSIDERING" (区别于 bought/resisted)
 */

'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/i18n/provider';
import { truncate, formatDate } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ButterflySession } from '../../types';
import { DEFAULT_CHAPTER_COUNT } from '../../lib/engine';
// 🔧 ARCH fix Round 73 (Finding 5.1): import TONE_* from sibling constants — breaks
// runtime circular dep butterfly-history-list ↔ tab/session-card.
import {
  TONE_EMOJI,
  TONE_ACCENT_DARK,
  TONE_ACCENT_LIGHT,
  TONE_GLOW_DARK,
  TONE_GLOW_LIGHT,
} from './constants';

interface SessionCardProps {
  session: ButterflySession;
  isLight: boolean;
  locale: string;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
  /** 🔧 2026-07-17 (task 4): 收藏状态变化回调, 让父组件刷新列表 */
  onBookmarkToggle?: (sessionId: string, isBookmarked: boolean) => void;
}

/** 阅读时长估算 (词数 / 250 wpm) */
function estimateReadTime(session: ButterflySession): number {
  const wordCount = session.chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
  return Math.max(1, Math.round(wordCount / 250));
}

export function SessionCard({
  session,
  isLight,
  locale,
  onClick,
  onDelete,
  isDeleting,
  onBookmarkToggle,
}: SessionCardProps) {
  const { t } = useI18n();
  const [isBookmarked, setIsBookmarked] = useState<boolean>(session.isBookmarked ?? false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  const isBought = session.decisionType === 'bought';
  // 🔧 2026-07-17: considering 类型 — 紫色徽章, 区别于 bought/resisted
  const isConsidering = session.decisionType === 'considering';
  const isCompleted = session.status === 'completed';
  const plannedTotal = session.outline?.chapters?.length || DEFAULT_CHAPTER_COUNT;
  const totalChapters = plannedTotal;
  const completedChapters = session.chapters.length;
  const tone = session.finalTone || (session.chapters.length > 0 ? session.chapters[session.chapters.length - 1].tone : 'neutral');
  const toneEmoji = TONE_EMOJI[tone] || '🎰';
  const accent = isLight ? (TONE_ACCENT_LIGHT[tone] || '#6b7280') : (TONE_ACCENT_DARK[tone] || '#d1d5db');
  const glow = isLight ? (TONE_GLOW_LIGHT[tone] || 'rgba(107,114,128,0.06)') : (TONE_GLOW_DARK[tone] || 'rgba(156,163,175,0.1)');

  const readMin = estimateReadTime(session);

  // 🔧 2026-07-17 (task 4): 收藏切换
  const handleBookmarkClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (bookmarkLoading) return;

    setBookmarkLoading(true);
    const previousState = isBookmarked;
    // 乐观更新
    const newState = !previousState;
    setIsBookmarked(newState);

    try {
      const result = await apiFetch<{ success: boolean; isBookmarked: boolean }>(
        `/api/butterfly/sessions/${session.id}`,
        { method: 'PATCH' }
      );
      setIsBookmarked(result.isBookmarked);
      onBookmarkToggle?.(session.id, result.isBookmarked);
    } catch (err) {
      // 回滚
      setIsBookmarked(previousState);
      logger.warn('[SessionCard] Bookmark toggle failed:', err);
    } finally {
      setBookmarkLoading(false);
    }
  }, [bookmarkLoading, isBookmarked, session.id, onBookmarkToggle]);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl border p-4 cursor-pointer transition-all active:scale-[0.98] overflow-hidden ${
        isCompleted
          ? (isLight ? 'bg-white border-cyan-500/30 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10' : 'bg-glass-fill border-cyan-400/25 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10')
          : (isLight ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md' : 'bg-glass-fill border-glass-border hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5')
      }`}
      style={{
        borderLeft: `3px solid ${accent}`,
        boxShadow: isCompleted ? `0 0 0 1px ${glow}, 0 4px 16px ${glow}` : undefined,
      }}
    >
      {isCompleted && (
        <>
          <div
            className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-40 pointer-events-none blur-3xl"
            style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
          />
          <div className="absolute top-2 right-2 pointer-events-none">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill={accent} style={{ filter: `drop-shadow(0 0 4px ${accent})` }}>
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z" />
            </svg>
          </div>
        </>
      )}

      <div className="relative flex items-center gap-1.5 mb-2.5 flex-wrap">
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
          isBought
            ? (isLight ? 'bg-red-500/10 text-red-600 border-red-500/25' : 'bg-red-400/10 text-red-400 border-red-400/25')
            : isConsidering
              ? (isLight ? 'bg-purple-500/10 text-purple-700 border-purple-500/25' : 'bg-purple-400/10 text-purple-300 border-purple-400/25')
              : (isLight ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25' : 'bg-emerald-400/10 text-emerald-400 border-emerald-400/25')
        }`}>
          {isBought
            ? t('butterfly.bought')
            : isConsidering
              ? t('butterfly.considering')
              : t('butterfly.resisted')}
        </span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${
          isCompleted
            ? (isLight ? 'bg-cyan-500/10 text-cyan-600 border-cyan-500/25' : 'bg-cyan-400/10 text-cyan-400 border-cyan-400/25')
            : (isLight ? 'bg-gray-100 text-gray-500 border-gray-300' : 'bg-glass-fill-strong text-text-tertiary border-glass-border')
        }`}>
          {isCompleted && <span className="w-1 h-1 rounded-full bg-current" />}
          {isCompleted ? t('butterfly.historyCompleted') : t('butterfly.historyAbandoned')}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-sm leading-none">{toneEmoji}</span>
          <span className={`text-[11px] ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
            {formatDate(session.createdAt, locale)}
          </span>
        </div>
      </div>

      <p className={`text-sm font-semibold mb-1.5 line-clamp-2 leading-snug ${isLight ? 'text-gray-900' : 'text-text-primary'}`}>
        {session.decisionDescription}
      </p>

      {(session.amount || session.platform) && (
        <div className="flex items-center gap-1.5 mb-2.5">
          {session.amount !== null && session.amount !== undefined && (
            <span className={`text-xs font-mono font-medium ${isLight ? 'text-gray-600' : 'text-text-secondary'}`}>
              ${session.amount.toFixed(2)}
            </span>
          )}
          {session.platform && (
            <>
              <span className={`text-[10px] ${isLight ? 'text-gray-300' : 'text-text-tertiary'}`}>·</span>
              <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
                {session.platform}
              </span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-1 flex-1">
          {Array.from({ length: Math.min(totalChapters, 5) }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all"
              style={{
                backgroundColor: i < completedChapters
                  ? accent
                  : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'),
              }}
            />
          ))}
        </div>
        <span className={`text-[10px] font-mono ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
          {completedChapters}/{totalChapters}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-1.5">
        <span className={`text-[11px] flex items-center gap-1 ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
            <path d="M2 2.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11zm1 1v9h10v-9H3zm2 2h6v1H5V5.5zm0 2.5h6v1H5V8zm0 2.5h4v1H5v-1z" />
          </svg>
          {t('butterfly.historyChapterCount', { n: session.chapters.length })}
        </span>
        {/* 🔧 2026-07-17 (task 4): 阅读时长标签 */}
        {isCompleted && (
          <span className={`text-[11px] flex items-center gap-1 ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
              <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
              <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
            </svg>
            {t('butterfly.readTime', { n: readMin })}
          </span>
        )}
        {(() => {
          const choiceCount = session.choices.filter(c => c.selectedOption).length;
          if (choiceCount > 0) {
            return (
              <span className={`text-[11px] flex items-center gap-1 ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0zM8 4a.75.75 0 0 1 .75.75v3.5l2.5 1.5a.75.75 0 1 1-.75 1.3l-2.75-1.65A.75.75 0 0 1 7.25 9V4.75A.75.75 0 0 1 8 4z" />
                </svg>
                {t('butterfly.historyChoicesCount', { n: choiceCount })}
              </span>
            );
          }
          if (session.chapters.length >= 2) {
            return (
              <span className={`text-[11px] flex items-center gap-1 ${isLight ? 'text-gray-400 italic' : 'text-text-tertiary/60 italic'}`}>
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0zM8 4a.75.75 0 0 1 .75.75v3.5l2.5 1.5a.75.75 0 1 1-.75 1.3l-2.75-1.65A.75.75 0 0 1 7.25 9V4.75A.75.75 0 0 1 8 4z" />
                </svg>
                {t('butterfly.historyNoChoiceYet', { defaultValue: 'No choice made' })}
              </span>
            );
          }
          return null;
        })()}
        {/* 🔧 2026-07-17 (task 4): 收藏按钮 */}
        <button
          onClick={handleBookmarkClick}
          disabled={bookmarkLoading}
          className={`ml-1 w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 ${
            isLight
              ? (isBookmarked ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50')
              : (isBookmarked ? 'text-amber-400 hover:bg-amber-400/10' : 'text-text-tertiary hover:text-amber-400 hover:bg-amber-400/10')
          } ${bookmarkLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label={isBookmarked ? t('butterfly.removeBookmark') : t('butterfly.bookmark')}
          title={isBookmarked ? t('butterfly.removeBookmark') : t('butterfly.bookmark')}
          tabIndex={0}
        >
          <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : 'fill-none'}`} stroke="currentColor" strokeWidth={1.5}>
            <path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.387.198.824-.149.746-.593l-.83-4.873 3.522-3.432c.32-.312.143-.855-.27-.918l-4.866-.7-2.178-4.414c-.198-.39-.773-.39-.97 0L5.434 7.428l-4.866.7c-.413.063-.59.606-.27.918l3.523 3.432-.832 4.873z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${isLight ? 'hover:bg-red-50 text-gray-300 hover:text-red-500' : 'hover:bg-red-400/10 text-text-tertiary hover:text-red-400'} ${isDeleting ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label={t('common.delete', { defaultValue: 'delete' })}
        >
          {isDeleting ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 animate-spin" fill="currentColor">
              <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z M14.5 3a.5.5 0 0 1-.5.5h-.5l-.224.898A2 2 0 0 1 11.36 6H4.64a2 2 0 0 1-1.916-1.602L2.5 3.5H2a.5.5 0 0 1 0-1h12a.5.5 0 0 1 .5.5z" />
            </svg>
          )}
        </button>
      </div>

      {isCompleted && session.butterflyEffect && (
        <div className={`mt-2.5 pt-2.5 border-t ${isLight ? 'border-gray-100' : 'border-glass-border'}`}>
          <div className="flex items-start gap-1.5">
            <span className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>"</span>
            <p className={`text-xs italic leading-relaxed line-clamp-2 flex-1 ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
              {truncate(session.butterflyEffect, 90)}
            </p>
            <span className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>"</span>
          </div>
        </div>
      )}
    </div>
  );
}
