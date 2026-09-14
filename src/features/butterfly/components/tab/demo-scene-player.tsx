/**
 * DemoScenePlayer — Galgame 风格场景播放器（从 butterfly-tab.tsx 抽出，C5 拆分）
 *
 * Demo 和 Normal 模式共用。行为零变化。
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '@/i18n/provider';
import type {} from '../../types';
import {
  TONE_ACCENT_COLORS,
  TONE_ACCENT_COLORS_LIGHT,
  TONE_BORDER_COLORS,
  TONE_BORDER_COLORS_LIGHT,
  TONE_TEXT_CSS_DARK,
  TONE_TEXT_CSS_LIGHT,
} from './constants';
import type { DemoScenePlayerProps } from './types';

export function DemoScenePlayer({
  sceneText,
  sceneImageUrl,
  chapterIndex,
  chapterTitle,
  tone,
  timeSpan,
  sceneIndex,
  totalScenes,
  isLastSceneOfChapter,
  hasChoice,
  onAdvance,
  isStreaming = false,
  isLight = false,
  isDialogueCollapsed = false,
  onToggleDialogue,
}: DemoScenePlayerProps) {
  const { t } = useI18n();
  const accentColor = isLight ? (TONE_ACCENT_COLORS_LIGHT[tone] || '#6b7280') : (TONE_ACCENT_COLORS[tone] || '#d1d5db');
  const borderColor = isLight ? (TONE_BORDER_COLORS_LIGHT[tone] || 'rgba(107,114,128,0.25)') : (TONE_BORDER_COLORS[tone] || 'rgba(156,163,175,0.25)');

  // Light/dark mode text classes
  const primaryTextClass = isLight ? 'text-gray-900' : 'text-gray-100';
  const secondaryTextClass = isLight ? 'text-gray-700' : 'text-gray-200';
  const tertiaryTextClass = isLight ? 'text-gray-600' : 'text-gray-400';
  const inactiveDotColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.15)';
  const textClass = isLight ? (TONE_TEXT_CSS_LIGHT[tone] || 'text-gray-800') : (TONE_TEXT_CSS_DARK[tone] || 'text-gray-100');

  // Gradient overrides for light/dark mode
  // 收起时渐变更透明，让用户更好地看图片
  const bottomGradient = isDialogueCollapsed
    ? (isLight
      ? 'linear-gradient(to top, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 15%, rgba(255,255,255,0.15) 30%, transparent 45%)'
      : 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 15%, rgba(0,0,0,0.08) 30%, transparent 45%)')
    : (isLight
      ? 'linear-gradient(to top, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.88) 12%, rgba(255,255,255,0.50) 30%, rgba(255,255,255,0.12) 45%, transparent 55%)'
      : 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 12%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.08) 45%, transparent 55%)');

  const topGradient = isLight
    ? 'linear-gradient(to bottom, rgba(255,255,255,0.35) 0%, transparent 15%)'
    : 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 15%)';

  const vignetteShadow = isLight ? 'inset 0 0 100px rgba(255,255,255,0.4)' : 'inset 0 0 100px rgba(0,0,0,0.6)';

  const fallbackGradient = isLight
    ? 'radial-gradient(ellipse at center, rgba(220,225,235,0.8) 0%, rgba(245,247,250,1) 70%)'
    : 'radial-gradient(ellipse at center, rgba(30,30,50,0.8) 0%, rgba(10,14,26,1) 70%)';

  // 打字机效果 — 流式模式下跳过
  const [displayed, setDisplayed] = useState('');
  const [complete, setComplete] = useState(false);
  const indexRef = useRef(0);
  // 🔧 N27 fix: 防止章节末尾重复点击 TAP
  const advancingRef = useRef(false);
  // 🔧 ARCH fix (Round 44 R44-A-6 — advancingRef setTimeout 未追踪, 卸载后泄漏):
  //    旧代码: setTimeout(() => { advancingRef.current = false; }, 500) 不保存 ref。
  //    根因修复: 用 ref 追踪 + 卸载时 clearTimeout。
  const advancingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advancingTimerRef.current) clearTimeout(advancingTimerRef.current); }, []);

  useEffect(() => {
    if (isStreaming) {
      // 流式模式：直接显示当前文本，不需要打字机效果
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prop 变化 → 重置内部 state (打字机 → 流式模式切换)
      setDisplayed(sceneText);
       
      setComplete(false); // 流式期间永远显示光标
      return;
    }

    indexRef.current = 0;
     
    setDisplayed('');
     
    setComplete(false);

    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= sceneText.length) {
        setDisplayed(sceneText);
        setComplete(true);
        clearInterval(interval);
      } else {
        setDisplayed(sceneText.slice(0, indexRef.current));
      }
    }, 28);

    return () => clearInterval(interval);
  }, [sceneText, isStreaming]);

  const skipToEnd = useCallback(() => {
    if (isStreaming) return; // 流式模式下不需要跳过
    setDisplayed(sceneText);
    setComplete(true);
  }, [sceneText, isStreaming]);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // 切换场景时重置图片状态
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop 变化 → 重置内部 state (新场景图片未加载)
    setImageLoaded(false);
     
    setImageError(false);
  }, [sceneImageUrl]);

  const handleClick = useCallback(() => {
    // 如果台词框收起，点击画面展开台词框
    if (isDialogueCollapsed) {
      onToggleDialogue?.();
      return;
    }

    if (isStreaming) return; // 流式模式下不允许点击推进
    if (!complete) {
      skipToEnd();
      return;
    }
    // 🔧 N27 fix: 防止章节末尾重复点击 TAP 触发多次 advance
    // （advance 会 setPhase('chapterComplete')，重复点击可能在 phase 切换间隙误触其他按钮）
    if (isLastSceneOfChapter && !hasChoice) {
      if (advancingRef.current) return;
      advancingRef.current = true;
      onAdvance();
      // 500ms 后重置（phase 切换完成后）
      // 🔧 ARCH fix (Round 44 R44-A-6): 用 ref 追踪, 卸载时 clearTimeout
      if (advancingTimerRef.current) clearTimeout(advancingTimerRef.current);
      advancingTimerRef.current = setTimeout(() => {
        advancingRef.current = false;
        advancingTimerRef.current = null;
      }, 500);
      return;
    }
    onAdvance();
  }, [complete, skipToEnd, onAdvance, isStreaming, isDialogueCollapsed, onToggleDialogue, isLastSceneOfChapter, hasChoice]);

  return (
    <div
      className={`relative flex-1 overflow-hidden ${isLight ? 'bg-gray-100' : 'bg-gray-950'} cursor-pointer select-none`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      aria-label={t('butterfly.tap')}
    >
      {/* 全屏背景图 */}
      <div className="absolute inset-0">
        {/* 始终显示背景渐变 — 图片加载前作为底层 */}
        <div className="w-full h-full" style={{
          background: fallbackGradient
        }} />

        {sceneImageUrl && !imageError ? (
          <>
            <img
              src={sceneImageUrl}
              alt={`Chapter ${chapterIndex}, Scene ${sceneIndex + 1}`}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              style={{ filter: isLight ? 'brightness(1.15) saturate(0.85)' : 'none' }}
            />
            {/* 底部渐变暗化 — 台词框区域 */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: bottomGradient
            }} />
            {/* 顶部微暗 */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: topGradient
            }} />
            {/* 基调色渐变 */}
            <div className="absolute bottom-0 left-0 right-0 h-1/4 pointer-events-none" style={{
              background: `linear-gradient(to top, ${accentColor}15 0%, transparent 100%)`
            }} />
            {/* 暗角 */}
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: vignetteShadow }} />
          </>
        ) : null}
      </div>

      {/* 章节标签 — 漂浮在图片顶部 */}
      <div className="absolute top-3 left-3 z-10">
        {sceneIndex === 0 ? (
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${accentColor}22`, color: accentColor, border: `1px solid ${borderColor}` }}
            >
              {t('butterfly.chapterLabelShort', { n: chapterIndex, defaultValue: 'CH.{n}' })}
            </span>
            <span className={`text-[11px] ${isLight ? 'text-gray-700' : 'text-gray-300/70'}`}>{chapterTitle}</span>
          </div>
        ) : (
          <span className={`text-[10px] ${isLight ? 'text-gray-600' : 'text-gray-500'} font-mono`}>{t('butterfly.chapterLabelShort', { n: chapterIndex, defaultValue: 'CH.{n}' })} · {t('butterfly.scene', { n: sceneIndex + 1, defaultValue: 'Scene {n}' })}</span>
        )}
      </div>

      {/* 时间跨度标签 — 第一章的第一个场景显示 */}
      {sceneIndex === 0 && (
        <div className="absolute top-3 right-3 z-10">
          <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-500/60'} italic`}>{timeSpan}</span>
        </div>
      )}

      {/* 台词框 — 漂浮在图片底部 */}
      <div className={`absolute bottom-0 left-0 right-0 px-4 pb-8 z-10 transition-all duration-300 ${isDialogueCollapsed ? 'pt-4' : 'pt-24'}`}>
        <div
          className={`rounded-2xl backdrop-blur-md transition-all duration-300 ${isDialogueCollapsed ? 'px-3 py-2' : 'px-5 py-4'}`}
          style={{
            backgroundColor: isLight ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.65)',
            border: `1px solid ${borderColor}`,
            boxShadow: `0 0 20px ${borderColor}`,
          }}
        >
          {/* 顶部行：场景进度点 + 收起/展开按钮 */}
          <div className={`flex items-center justify-between ${isDialogueCollapsed ? '' : 'mb-2'}`}>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalScenes }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === sceneIndex ? '8px' : '4px',
                    height: '4px',
                    backgroundColor: i <= sceneIndex ? accentColor : inactiveDotColor,
                    boxShadow: i === sceneIndex ? `0 0 10px ${accentColor}80` : 'none',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] ${tertiaryTextClass} font-mono`}>
                {sceneIndex + 1}/{totalScenes}
              </span>
              {/* 收起/展开按钮 */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleDialogue?.(); }}
                className={`p-0.5 rounded-full transition-colors ${isLight ? 'hover:bg-white/30' : 'hover:bg-white/10'}`}
                aria-label={isDialogueCollapsed ? t('butterfly.expandDialogue') : t('butterfly.collapseDialogue')}
              >
                <svg
                  viewBox="0 0 16 16"
                  className={`w-3.5 h-3.5 ${tertiaryTextClass} transition-transform duration-300 ${isDialogueCollapsed ? '' : 'rotate-180'}`}
                  fill="currentColor"
                >
                  <path d="M8 11L3 6h10l-5 5z" />
                </svg>
              </button>
            </div>
          </div>

          {/* 收起状态：只显示一行预览 */}
          {isDialogueCollapsed && (
            <div className="mt-1">
              <p className={`${secondaryTextClass} text-[13px] truncate`}>{sceneText}</p>
            </div>
          )}

          {/* 展开状态：场景文本 — 打字机效果 */}
          {!isDialogueCollapsed && (
            <>
              <div className="min-h-[2rem]">
                <p className={`${primaryTextClass} leading-relaxed text-[17px] whitespace-pre-wrap font-normal ${textClass}`}>
                  {displayed}
                  {/* 光标 */}
                  {!complete && (
                    <span
                      className="inline-block w-0.5 h-5 ml-0.5 align-text-bottom animate-pulse"
                      style={{ backgroundColor: accentColor }}
                    />
                  )}
                </p>
              </div>

              {/* 推进指示器 */}
              {isStreaming ? (
                <div className="flex items-center justify-center mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" />
                    <span className={`text-[10px] ${isLight ? 'text-cyan-600' : 'text-cyan-400/70'} tracking-wider`}>{t('butterfly.writing')}</span>
                  </div>
                </div>
              ) : complete && (
                <div className="flex items-center justify-center mt-2">
                  <div className="flex items-center gap-1.5 animate-pulse">
                    <span className={`text-[10px] ${tertiaryTextClass} tracking-wider`}>
                      {isLastSceneOfChapter
                        ? (hasChoice ? t('butterfly.makeYourChoice') : t('butterfly.nextChapter'))
                        : t('butterfly.tap')}
                    </span>
                    <svg viewBox="0 0 16 16" className={`w-3 h-3 ${tertiaryTextClass}`} fill="currentColor">
                      <path d="M6 3l5 5-5 5V3z" />
                    </svg>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

