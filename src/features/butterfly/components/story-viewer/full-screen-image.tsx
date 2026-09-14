/**
 * FullScreenImage — full-screen scene background image with crossfade.
 *
 * 🔧 Round 80 F4: extracted from story-viewer.tsx (was 982 lines, target <800).
 *    Handles: SVG placeholder, AI image loading, error fallback, regenerate button.
 */

'use client';

import { useState } from 'react';
import type { StoryTone } from '../../types';
import { TONE_COLORS } from './helpers';
import { useI18n } from '@/i18n/provider';

export interface FullScreenImageProps {
  illustrationUrl?: string;
  tone: StoryTone;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  isGeneratingScene?: boolean;
  isLight?: boolean;
}

export function FullScreenImage({ illustrationUrl, tone, onRegenerate, isRegenerating, isGeneratingScene: _isGeneratingScene, isLight }: FullScreenImageProps) {
  const { t } = useI18n();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const colors = TONE_COLORS[tone] || TONE_COLORS.neutral;

  const resolvedUrl = illustrationUrl
    ? (illustrationUrl.startsWith('data:') || illustrationUrl.startsWith('http') || illustrationUrl.startsWith('/'))
      ? illustrationUrl
      : `https://${illustrationUrl}`
    : undefined;

  // 判断是否为 SVG 占位图（data:image/svg+xml）—— SVG 占位图需要显示加载中提示
  const isSvgPlaceholder = resolvedUrl?.startsWith('data:image/svg+xml') ?? false;
  // 判断是否为真实 AI 图片（http CDN URL 或 png data URL）
  const isRealImage = resolvedUrl && !isSvgPlaceholder;
  // 是否正在生成 AI 插图（SVG 占位图 + 尚未加载到真实图片）
  const isGeneratingAI = (isSvgPlaceholder || !resolvedUrl) && !imageError;

  return (
    <div className={`absolute inset-0 group ${isLight ? 'bg-gray-50' : 'bg-gray-950'}`}>
      {/* SVG 占位图 — 作为背景显示（低不透明度），上面叠加加载提示 */}
      {isSvgPlaceholder && !imageError && (
        <img
          src={resolvedUrl}
          alt={t('storyViewer.placeholderIllustration')}
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          aria-hidden="true"
        />
      )}

      {/* 加载中占位 — 蝴蝶剪影 + 脉冲光 + "Generating" 文字 */}
      {isGeneratingAI && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="relative mb-4">
            <svg viewBox="0 0 64 48" className="w-16 h-12 opacity-30" fill="none">
              <path d="M28 24 C20 12, 4 8, 8 20 C10 26, 18 28, 28 24Z" fill={colors.dotColor} />
              <path d="M36 24 C44 12, 60 8, 56 20 C54 26, 46 28, 36 24Z" fill={colors.dotColor} />
              <line x1="32" y1="16" x2="32" y2="36" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
            </svg>
            <div className="absolute inset-0 rounded-full animate-pulse" style={{ boxShadow: colors.glowCSS, transform: 'scale(2)' }} />
          </div>
          {/* 明确的加载提示文字 */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: colors.accentColor, animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: colors.accentColor, animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: colors.accentColor, animationDelay: '300ms' }} />
            </div>
            <span className="text-[11px] text-gray-500 animate-pulse tracking-wide">
              {t('storyViewer.generatingIllustration')}
            </span>
          </div>
        </div>
      )}

      {/* 真实 AI 图片加载中（CDN 下载中） */}
      {isRealImage && !imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: colors.accentColor, borderTopColor: 'transparent' }} />
          </div>
        </div>
      )}

      {/* 加载失败占位 */}
      {imageError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <svg viewBox="0 0 64 48" className="w-12 h-9 opacity-25" fill="none">
              <path d="M28 24 C20 12, 4 8, 8 20 C10 26, 18 28, 28 24Z" fill="rgba(255,255,255,0.3)" />
              <path d="M36 24 C44 12, 60 8, 56 20 C54 26, 46 28, 36 24Z" fill="rgba(255,255,255,0.3)" />
            </svg>
            <span className="text-[11px] text-gray-600">{t('storyViewer.illustrationFailed')}</span>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20 transition-all cursor-pointer"
              >
                {t('storyViewer.regenerate')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 实际 AI 图片 — 全屏填充 */}
      {isRealImage && !imageError && (
        <img
          src={resolvedUrl}
          alt={t('storyViewer.sceneIllustration')}
          className={`w-full h-full object-cover transition-opacity duration-700 ease-out ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      )}

      {/* 覆盖层 — 确保底部台词框区域可读 */}
      {imageLoaded && (
        <>
          {/* 底部渐变暗化 — 台词框区域 */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 12%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.08) 45%, transparent 55%)'
          }} />
          {/* 顶部微暗 */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 15%)'
          }} />
          {/* 基调色渐变 */}
          <div className="absolute bottom-0 left-0 right-0 h-1/4 pointer-events-none" style={{ background: colors.gradientCSS }} />
          {/* 暗角 */}
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 100px rgba(0,0,0,0.6)' }} />
        </>
      )}

      {/* 重新生成按钮 — hover 时显示 */}
      {imageLoaded && onRegenerate && !isRegenerating && (
        <button
          onClick={onRegenerate}
          className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white cursor-pointer"
          title={t('storyViewer.regenerateIllustration')}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      )}
    </div>
  );
}
