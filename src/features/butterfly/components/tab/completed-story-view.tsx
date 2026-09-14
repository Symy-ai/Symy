/**
 * Completed Story View — 蝴蝶效应完成页 (全屏封面风格)
 *
 * 提取自 src/features/butterfly/components/butterfly-tab.tsx (Round 98 拆分)
 * 显示: 最终场景图片 + 蝴蝶效应总结 + Galgame 风格场景回顾 + 原始决策回顾
 */

'use client';

import { useI18n } from '@/i18n/provider';
import { showToast } from '@/lib/toast';
import Image from 'next/image';
import type { StoryTone, DecisionType } from '../../types';
import {
  TONE_ACCENT_COLORS,
  TONE_ACCENT_COLORS_LIGHT,
  TONE_BORDER_COLORS,
  TONE_BORDER_COLORS_LIGHT,
  TONE_EMOJI,
} from '../tab';

export interface SceneReviewItem {
  chapterIndex: number;
  chapterTitle: string;
  tone: StoryTone;
  timeSpan: string;
  sceneIndex: number;
  sceneText: string;
  imageUrl: string | undefined;
}

interface CompletedStoryViewProps {
  isLight: boolean;
  isDemo: boolean;
  sceneReview: SceneReviewItem[];
  butterflyEffect: string | null;
  finalTone: StoryTone | null;
  totalChapters: number;
  choices: Record<string, unknown>;
  decisionType: DecisionType;
  decisionDescription: string;
  isSummaryCollapsed: boolean;
  onToggleSummary: () => void;
  onReset: () => void;
  onViewHistory: () => void;
  /** 🔧 2026-07-17: sessionId for share link */
  sessionId?: string;
}

export function CompletedStoryView({
  isLight,
  isDemo,
  sceneReview,
  butterflyEffect,
  finalTone,
  totalChapters,
  choices,
  decisionType,
  decisionDescription,
  isSummaryCollapsed,
  onToggleSummary,
  onReset,
  onViewHistory,
  sessionId,
}: CompletedStoryViewProps) {
  const { t } = useI18n();

  // V28: fallback 确保完成页始终显示
  const _butterflyEffect = butterflyEffect || t('butterfly.storyComplete');
  const ft = finalTone || 'twist';
  const borderColor = isLight ? (TONE_BORDER_COLORS_LIGHT[ft] || 'rgba(107,114,128,0.25)') : (TONE_BORDER_COLORS[ft] || 'rgba(156,163,175,0.25)');

  // Light/dark mode styles
  const completeTitleClass = isLight ? 'text-gray-900' : 'text-white';
  const completeSubtitleClass = isLight ? 'text-gray-600' : 'text-gray-300';
  const completeReviewTextClass = isLight ? 'text-gray-800' : 'text-gray-100';
  const completeReviewSceneTextClass = isLight ? 'text-gray-700' : 'text-gray-200';
  const completeDialogueBg = isLight ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.65)';

  const completeBottomGradient = isLight
    ? 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, transparent 15%, transparent 40%, rgba(255,255,255,0.92) 70%, rgba(255,255,255,0.98) 100%)'
    : 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 15%, transparent 40%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0.95) 100%)';
  const completeVignetteShadow = isLight ? 'inset 0 0 80px rgba(255,255,255,0.4)' : 'inset 0 0 80px rgba(0,0,0,0.5)';
  const completeFallbackGradient = isLight
    ? 'linear-gradient(to bottom, rgba(245,247,250,1), rgba(220,225,235,1))'
    : 'linear-gradient(to bottom, rgba(17,24,39,1), rgba(0,0,0,1))';
  const completeSceneReviewBottomGradient = isLight
    ? 'linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 15%, rgba(255,255,255,0.4) 35%, transparent 50%)'
    : 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 15%, rgba(0,0,0,0.3) 35%, transparent 50%)';
  const completeSceneReviewTopGradient = isLight
    ? 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, transparent 12%)'
    : 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 12%)';
  const completeSceneReviewVignette = isLight
    ? 'inset 0 0 80px rgba(255,255,255,0.4)'
    : 'inset 0 0 80px rgba(0,0,0,0.5)';
  const completeSceneReviewFallback = isLight
    ? 'radial-gradient(ellipse at center, rgba(220,225,235,0.8) 0%, rgba(245,247,250,1) 70%)'
    : 'radial-gradient(ellipse at center, rgba(30,30,50,0.8) 0%, rgba(10,14,26,1) 70%)';

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
      <div className="flex-1 overflow-y-auto">
        {/* 蝴蝶效应总结 — 全屏封面风格 */}
        <div className="relative w-full aspect-[3/4] max-h-[60vh] overflow-hidden">
          {sceneReview.length > 0 && sceneReview[sceneReview.length - 1].imageUrl ? (
            <>
              <img
                src={sceneReview[sceneReview.length - 1].imageUrl}
                alt={t('butterfly.yourFutureUnlocked')}
                className="w-full h-full object-cover"
                style={{ filter: isLight ? 'brightness(1.15) saturate(0.85)' : 'none' }}
              />
              <div className="absolute inset-0 pointer-events-none" style={{ background: completeBottomGradient }} />
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: completeVignetteShadow }} />
            </>
          ) : (
            <div className="w-full h-full" style={{ background: completeFallbackGradient }} />
          )}

          <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-20">
            <div className="text-4xl mb-3 text-center">{TONE_EMOJI[ft] || '🎰'}</div>
            <h2 className={`text-2xl font-bold ${completeTitleClass} text-center mb-2`} style={{
              textShadow: isLight ? '0 0 20px rgba(168,85,247,0.2)' : '0 0 20px rgba(168,85,247,0.4)'
            }}>
              {t('butterfly.yourFutureUnlocked')}
            </h2>
            <p className={`text-xs ${completeSubtitleClass} text-center mb-4`}>
              {totalChapters} {t('butterfly.chapters')} · {Object.keys(choices).length} {t('butterfly.crossroads')} · {t('butterfly.oneDecision')}
            </p>
            <div className="rounded-2xl backdrop-blur-md cursor-pointer" style={{
              backgroundColor: completeDialogueBg,
              border: `1px solid ${borderColor}`,
            }} onClick={onToggleSummary}>
              <div className="flex items-center justify-between px-5 py-3">
                <span className={`text-xs font-medium ${completeSubtitleClass}`}>
                  {t('butterfly.futureGachaResult')}
                </span>
                <svg
                  viewBox="0 0 16 16"
                  className={`w-3.5 h-3.5 ${completeSubtitleClass} transition-transform duration-300 ${isSummaryCollapsed ? '' : 'rotate-180'}`}
                  fill="currentColor"
                >
                  <path d="M8 11L3 6h10l-5 5z" />
                </svg>
              </div>
              {!isSummaryCollapsed && (
                <div className="px-5 pb-4">
                  <p className={`${completeReviewSceneTextClass} leading-relaxed text-[14px] italic`}>
                    {_butterflyEffect}
                  </p>
                </div>
              )}
            </div>
            {isDemo && (
              <div className="flex justify-center mt-3">
                <span className="text-[10px] font-medium text-amber-700 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">👁️ {t('butterfly.demoModeBadge')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Galgame 风格场景回顾 */}
        <div className="space-y-0">
          {sceneReview.map((scene) => {
            const sAccentColor = isLight ? (TONE_ACCENT_COLORS_LIGHT[scene.tone] || '#6b7280') : (TONE_ACCENT_COLORS[scene.tone] || '#d1d5db');
            const sBorderColor = isLight ? (TONE_BORDER_COLORS_LIGHT[scene.tone] || 'rgba(107,114,128,0.25)') : (TONE_BORDER_COLORS[scene.tone] || 'rgba(156,163,175,0.25)');

            return (
              <div key={`${scene.chapterIndex}-${scene.sceneIndex}`} className="relative w-full" style={{ aspectRatio: '3/4' }}>
                {scene.imageUrl ? (
                  <>
                    <Image src={scene.imageUrl} alt={`Chapter ${scene.chapterIndex}, Scene ${scene.sceneIndex + 1}`} fill className="w-full h-full object-cover" style={{ filter: isLight ? 'brightness(1.15) saturate(0.85)' : 'none' }} unoptimized />
                    <div className="absolute inset-0 pointer-events-none" style={{ background: completeSceneReviewBottomGradient }} />
                    <div className="absolute inset-0 pointer-events-none" style={{ background: completeSceneReviewTopGradient }} />
                    <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: completeSceneReviewVignette }} />
                  </>
                ) : (
                  <div className={`w-full h-full ${isLight ? 'bg-gray-100' : 'bg-gray-950'}`} style={{ background: completeSceneReviewFallback }} />
                )}

                <div className="absolute top-3 left-3 z-10">
                  {scene.sceneIndex === 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${sAccentColor}22`, color: sAccentColor, border: `1px solid ${sBorderColor}` }}>{t('butterfly.chapterLabelShort', { n: scene.chapterIndex, defaultValue: 'CH.{n}' })}</span>
                      <span className={`text-[11px] ${isLight ? 'text-gray-700' : 'text-gray-300/70'}`}>{scene.chapterTitle}</span>
                    </div>
                  ) : (
                    <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-500'} font-mono`}>{t('butterfly.chapterLabelShort', { n: scene.chapterIndex, defaultValue: 'CH.{n}' })} · {scene.sceneIndex + 1}</span>
                  )}
                </div>

                <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-16 z-10">
                  <div className="rounded-2xl px-4 py-3 backdrop-blur-md" style={{ backgroundColor: completeDialogueBg, border: `1px solid ${sBorderColor}`, boxShadow: `0 0 15px ${sBorderColor}` }}>
                    <p className={`${completeReviewTextClass} leading-relaxed text-[15px] font-normal`} style={{ color: sAccentColor }}>{scene.sceneText}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 原始决策回顾 */}
        <div className="px-5 py-6 text-center">
          <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
            {/* 🔧 N36 fix: 不用 t() 传 desc 参数，ICU MessageFormat 会把 $5 解析为变量吞掉 */}
            {decisionType === 'bought'
              ? `${t('butterfly.originalDecisionBoughtPrefix')} "${decisionDescription}"`
              : `${t('butterfly.originalDecisionResistedPrefix')} "${decisionDescription}"`}
          </p>
        </div>
      </div>

      <div className={`flex-shrink-0 px-4 py-4 border-t space-y-2 ${isLight ? 'border-gray-200' : 'border-glass-border'}`}>
        <button
          onClick={onReset}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 cursor-pointer"
        >
          {t('butterfly.startNewGacha')}
        </button>
        <div className="flex gap-2">
          {!isDemo && (
            <button
              onClick={onViewHistory}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95 cursor-pointer ${isLight ? 'text-gray-500 hover:bg-gray-100' : 'text-text-tertiary hover:bg-glass-fill-strong'}`}
            >
              📜 {t('butterfly.viewHistory')}
            </button>
          )}
          {/* 🔧 2026-07-17 fix: 分享按钮 — 生成无需注册直接打开故事的链接 */}
          <button
            onClick={async () => {
              try {
                const origin = typeof window !== 'undefined' ? window.location.origin : 'https://symy.ai';
                const shareUrl = sessionId
                  ? `${origin}/?tab=butterfly&session=${sessionId}`
                  : origin;
                const lines: string[] = [];
                lines.push('🎰 My butterfly-effect story on Symy');
                lines.push('');
                lines.push(`${decisionType === 'bought' ? 'I bought' : decisionType === 'resisted' ? 'I didn\'t buy' : 'I\'m considering'}: "${decisionDescription}"`);
                if (_butterflyEffect && _butterflyEffect !== t('butterfly.storyComplete')) {
                  lines.push('');
                  lines.push(_butterflyEffect);
                }
                lines.push('');
                lines.push(`Read the full story: ${shareUrl}`);

                const text = lines.join('\n');
                if (typeof navigator !== 'undefined' && navigator.share) {
                  await navigator.share({ title: 'My Symy Story', text, url: shareUrl });
                } else {
                  await navigator.clipboard?.writeText(text);
                  showToast(t('butterfly.historyShareCopied', { defaultValue: 'Story copied to clipboard! 📋' }), 'success');
                }
              } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
              }
            }}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${isLight ? 'text-cyan-600 hover:bg-cyan-50 border border-cyan-200' : 'text-cyan-400 hover:bg-cyan-400/10 border border-cyan-400/30'}`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {t('butterfly.shareStory', { defaultValue: 'Share' })}
          </button>
        </div>
      </div>
    </div>
  );
}
