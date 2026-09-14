/**
 * MultiPlatformShare — 多平台一键分享按钮组
 *
 * 🔧 2026-07-17 (task 5): 新增组件
 *
 * 功能:
 * - 提供常用社交媒体一键分享按钮: X / Reddit / WhatsApp / Telegram / Email / 复制链接
 * - Instagram / TikTok / 微信朋友圈 不支持 web intent 直接分享图片 → 显示 "Save image + open app" 引导
 * - 桌面端 navigator.share 优先 (macOS Safari / Edge 等)
 *
 * 设计原则:
 * 1. 平台按钮用真实品牌色 (X 用 black, Reddit 用 orange, etc.)
 * 2. 移动端横向滚动避免溢出
 * 3. 不支持的"直接分享图片"平台 (IG/TikTok/WeChat) 单独一组, 提示用户保存图片后打开 app
 * 4. 所有按钮 aria-label 完整, 键盘可达
 */

'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';

interface MultiPlatformShareProps {
  /** 分享文案 (用于 text-only 平台如 X / Reddit) */
  text: string;
  /** 分享链接 (带 refCode 的 invite link, 或当前页 URL) */
  url: string;
  /** 可选: 已生成的图片 Blob (用于 navigator.share files) */
  imageBlob?: Blob | null;
  /** 平台按钮触发的 toast 回调 */
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** 紧凑模式 (只显示图标, 不显示文字) */
  compact?: boolean;
}

type PlatformId = 'native' | 'x' | 'reddit' | 'whatsapp' | 'telegram' | 'email' | 'copy' | 'instagram' | 'tiktok' | 'wechat';

interface PlatformConfig {
  id: PlatformId;
  label: string;
  /** SVG icon (内联) */
  icon: React.ReactNode;
  /** 主色 (用于按钮 hover 背景) */
  color: string;
  /** 是否需要"保存图片"引导 (用于 IG/TikTok/WeChat) */
  needsImageSaveGuide?: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'native',
    label: 'Share...',
    color: 'bg-gradient-to-r from-cyan-500 to-purple-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
      </svg>
    ),
  },
  {
    id: 'x',
    label: 'X',
    color: 'bg-black',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'reddit',
    label: 'Reddit',
    color: 'bg-orange-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.498.408-.421.974-.681 1.604-.681 1.287 0 2.332 1.045 2.332 2.332 0 .922-.537 1.715-1.313 2.095-.04.275-.06.56-.06.85 0 2.937-3.317 5.32-7.41 5.32s-7.41-2.383-7.41-5.32c0-.291.022-.574.063-.851-.774-.381-1.31-1.173-1.31-2.094 0-1.287 1.045-2.332 2.332-2.332.628 0 1.193.259 1.6.678 1.197-.866 2.858-1.428 4.687-1.498l.901-4.214a.36.36 0 0 1 .16-.225.35.35 0 0 1 .27-.05l2.92.614a1.25 1.25 0 0 1 1.167-.806zm-8.51 7.05c-.829 0-1.5.671-1.5 1.5s.671 1.5 1.5 1.5 1.5-.671 1.5-1.5-.671-1.5-1.5-1.5zm6.99 0c-.829 0-1.5.671-1.5 1.5s.671 1.5 1.5 1.5 1.5-.671 1.5-1.5-.671-1.5-1.5-1.5zm-3.49 4.5c-.974 0-1.9.121-2.758.343a.31.31 0 1 0 .176.595c.794-.207 1.673-.318 2.582-.318.91 0 1.788.111 2.583.318a.31.31 0 1 0 .175-.595A11.04 11.04 0 0 0 12 16.294z" />
      </svg>
    ),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: 'bg-green-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z" />
      </svg>
    ),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    color: 'bg-blue-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    id: 'email',
    label: 'Email',
    color: 'bg-gray-500',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
  {
    id: 'copy',
    label: 'Copy link',
    color: 'bg-gray-700',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
      </svg>
    ),
  },
  // 以下平台不支持 web intent 直接分享图片, 显示"保存图片 + 打开 app"引导
  {
    id: 'instagram',
    label: 'Instagram',
    color: 'bg-pink-500',
    needsImageSaveGuide: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: 'bg-black',
    needsImageSaveGuide: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    ),
  },
  {
    id: 'wechat',
    label: 'WeChat',
    color: 'bg-green-600',
    needsImageSaveGuide: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.616-6.744 1.613-1.961 4.176-3.235 6.553-3.235.054 0 .107.005.16.008C16.732 4.328 13.07 2.188 8.691 2.188zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.405-.032zm-2.71 2.793c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
      </svg>
    ),
  },
];

export function MultiPlatformShare({
  text,
  url,
  imageBlob,
  onToast,
  compact = false,
}: MultiPlatformShareProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [showImageGuide, setShowImageGuide] = useState<PlatformId | null>(null);

  const handleShare = useCallback(async (platform: PlatformId) => {
    const shareText = `${text}\n\n${url}`;
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    const encodedShareText = encodeURIComponent(shareText);

    switch (platform) {
      case 'native': {
        // 桌面端 navigator.share (Safari/Edge)
        try {
          if (imageBlob && navigator.canShare?.({ files: [new File([imageBlob], 'symy.png', { type: 'image/png' })] })) {
            await navigator.share({
              title: 'Symy',
              text,
              files: [new File([imageBlob], 'symy.png', { type: 'image/png' })],
            });
            onToast?.(t('buddy.shareProgressCopied', { defaultValue: '✅ Shared successfully!' }), 'success');
            return;
          }
          if (navigator.share) {
            await navigator.share({ title: 'Symy', text, url });
            onToast?.(t('buddy.shareProgressCopied', { defaultValue: '✅ Shared successfully!' }), 'success');
            return;
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          logger.warn('[MultiPlatformShare] native share failed:', err);
        }
        // Fallback: 复制链接
        try {
          await navigator.clipboard?.writeText(shareText);
          setCopied(true);
          onToast?.(t('buddy.shareLinkCopied', { defaultValue: '✅ Link copied to clipboard!' }), 'success');
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          logger.warn('[MultiPlatformShare] clipboard write failed:', err);
          onToast?.(t('buddy.shareProgressFailed', { defaultValue: 'Could not share — please try again.' }), 'info');
        }
        return;
      }
      case 'x': {
        // X (Twitter) intent URL
        window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank', 'noopener,noreferrer');
        return;
      }
      case 'reddit': {
        // Reddit submit URL
        window.open(`https://www.reddit.com/submit?title=${encodedText}&url=${encodedUrl}`, '_blank', 'noopener,noreferrer');
        return;
      }
      case 'whatsapp': {
        // WhatsApp share URL
        window.open(`https://wa.me/?text=${encodedShareText}`, '_blank', 'noopener,noreferrer');
        return;
      }
      case 'telegram': {
        // Telegram share URL
        window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank', 'noopener,noreferrer');
        return;
      }
      case 'email': {
        // Email mailto
        window.location.href = `mailto:?subject=${encodeURIComponent('My Symy journey')}&body=${encodedShareText}`;
        return;
      }
      case 'copy': {
        try {
          await navigator.clipboard?.writeText(shareText);
          setCopied(true);
          onToast?.(t('buddy.shareLinkCopied', { defaultValue: '✅ Link + text copied!' }), 'success');
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          logger.warn('[MultiPlatformShare] copy failed:', err);
          onToast?.(t('buddy.shareProgressFailed', { defaultValue: 'Could not copy — please try again.' }), 'info');
        }
        return;
      }
      case 'instagram':
      case 'tiktok':
      case 'wechat': {
        // 这些平台不支持 web intent, 显示"保存图片 + 打开 app"引导
        setShowImageGuide(platform);
        return;
      }
    }
  }, [text, url, imageBlob, onToast, t]);

  const directPlatforms = PLATFORMS.filter(p => !p.needsImageSaveGuide);
  const imageGuidePlatforms = PLATFORMS.filter(p => p.needsImageSaveGuide);

  const getLabel = (p: typeof PLATFORMS[number]) => {
    const labelKeys: Record<string, string> = {
      native: 'buddy.shareNative',
      email: 'buddy.shareEmail',
      copy: 'buddy.shareCopyLink',
    };
    const key = labelKeys[p.id];
    return key ? t(key, { defaultValue: p.label }) : p.label;
  };

  return (
    <div className="space-y-2">
      {/* 直接分享平台 (第一行) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {directPlatforms.map(p => (
          <button
            key={p.id}
            onClick={() => handleShare(p.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-[11px] font-medium transition-all active:scale-95 ${p.color} hover:opacity-90 ${copied && p.id === 'copy' ? 'ring-2 ring-white/50' : ''}`}
            aria-label={getLabel(p)}
            title={getLabel(p)}
            type="button"
          >
            {p.icon}
            {!compact && <span>{getLabel(p)}</span>}
          </button>
        ))}
      </div>

      {/* 需要保存图片的平台 (第二行, 视觉上分开) */}
      {imageGuidePlatforms.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-glass-border/50">
          <span className="text-[9px] text-text-tertiary mr-1">
            {t('buddy.shareImageAppHint', { defaultValue: 'Save image → open app:' })}
          </span>
          {imageGuidePlatforms.map(p => (
            <button
              key={p.id}
              onClick={() => handleShare(p.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-white text-[10px] font-medium transition-all active:scale-95 ${p.color} hover:opacity-90`}
              aria-label={getLabel(p)}
              title={getLabel(p)}
              type="button"
            >
              {p.icon}
              {!compact && <span className="hidden sm:inline">{getLabel(p)}</span>}
            </button>
          ))}
        </div>
      )}

      {/* "保存图片 + 打开 app" 引导弹窗 */}
      {showImageGuide && (
        <div className="mt-3 p-3 rounded-xl bg-glass-fill border border-glass-border text-xs space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <p className="text-text-primary font-medium">
            {showImageGuide === 'instagram' && t('buddy.shareToInstagram', { defaultValue: '📸 Share to Instagram' })}
            {showImageGuide === 'tiktok' && t('buddy.shareToTikTok', { defaultValue: '🎵 Share to TikTok' })}
            {showImageGuide === 'wechat' && t('buddy.shareToWeChat', { defaultValue: '💬 Share to WeChat' })}
          </p>
          <ol className="text-text-secondary space-y-1 list-decimal list-inside">
            <li>{t('buddy.shareImageStep1', { defaultValue: 'Tap "Save Image" above to download the card' })}</li>
            <li>{t('buddy.shareImageStep2', { defaultValue: 'Open the app and start a new post' })}</li>
            <li>{t('buddy.shareImageStep3', { defaultValue: 'Select the saved image from your camera roll' })}</li>
            <li>{t('buddy.shareImageStep4', { defaultValue: 'Add your caption and share' })}</li>
          </ol>
          <button
            onClick={() => setShowImageGuide(null)}
            className="text-cyan-400 hover:text-cyan-300 transition-colors text-[11px]"
            type="button"
          >
            {t('common.gotIt', { defaultValue: 'Got it' })}
          </button>
        </div>
      )}
    </div>
  );
}
