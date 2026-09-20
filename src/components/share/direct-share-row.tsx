'use client';

/**
 * DirectShareRow — 四平台直链分享行 (batch106-a, BP p19「to protect others」传播层)
 *
 * 平台能力如实分级 (别造假按钮):
 *   - X / Reddit: web intent 直链 — 文案+URL 预填; X 默认追加 toProtectQuote 契约叙事句。
 *   - Instagram / TikTok: 无 web intent → 诚实降级 = 保存 PNG + 复制文案 + 打开 app 主页,
 *     完成后内联提示下一步; 剪贴板失败也有手动话术 (不静默、不假装直连)。
 *
 * 面子/里子分离 (owner 09-06): caption/url 只进 intent 与剪贴板, 永不上 DOM。
 */

import { useCallback, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';
import {
  buildXIntentUrl,
  buildRedditSubmitUrl,
  INSTAGRAM_HOME_URL,
  TIKTOK_HOME_URL,
} from '@/lib/share-links';
import { SHARE_PLATFORM_ICONS } from '@/components/common/multi-platform-share';

export interface DirectShareRowProps {
  /** 分享文案 (模板 shareText, 面子数字) — intent 与剪贴板用 */
  caption: string;
  /** 分享链接 (带 ref 归因; 无 ref 时为 origin) */
  url: string;
  /** 契约叙事句 (share.toProtectQuote, 词典双侧) — X 直链默认追加 */
  quote: string;
  /** 保存已生成 PNG (modal 既有下载链路) — IG/TikTok 降级第一步 */
  onDownload: () => void;
  /** PNG 是否已生成 — 未生成时 IG/TikTok 无图可存, 如实禁用; X/Reddit 纯链接不受影响 */
  imageReady: boolean;
}

type AppGuidePlatform = 'instagram' | 'tiktok';
type GuideState = { platform: AppGuidePlatform; copied: boolean } | null;

export function DirectShareRow({ caption, url, quote, onDownload, imageReady }: DirectShareRowProps) {
  const { t } = useI18n();
  const [guide, setGuide] = useState<GuideState>(null);

  const openIntent = useCallback((intentUrl: string) => {
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleX = useCallback(() => {
    openIntent(buildXIntentUrl({ text: `${caption}\n${quote}`, url }));
  }, [openIntent, caption, quote, url]);

  const handleReddit = useCallback(() => {
    openIntent(buildRedditSubmitUrl({ text: caption, url }));
  }, [openIntent, caption, url]);

  // 无 web intent 平台: 保存图片 + 复制文案 + 打开 app 主页 (均发生在同一次手势 tick,
  // window.open 在 await 之前发出 — 不丢 transient activation)
  const handleAppDegrade = useCallback(
    (platform: AppGuidePlatform) => {
      onDownload();
      const write = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      const copyPromise = write
        ? write(`${caption}\n${quote}\n${url}`)
            .then(() => true)
            .catch((err: unknown) => {
              // safe to ignore: clipboard failure falls back to the manual wording below
              logger.warn('[DirectShareRow] clipboard write failed:', err instanceof Error ? err.message : String(err));
              return false;
            })
        : Promise.resolve(false);
      openIntent(platform === 'instagram' ? INSTAGRAM_HOME_URL : TIKTOK_HOME_URL);
      void copyPromise.then((copied) => setGuide({ platform, copied }));
    },
    [onDownload, caption, quote, url, openIntent]
  );

  const chipClass =
    'flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:border-emerald-400/30 hover:text-text-primary transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex-shrink-0 px-4 pb-5 pt-1" data-testid="direct-share-row">
      <div className="flex items-center justify-center gap-2">
        <button type="button" onClick={handleX} aria-label={t('share.directShare.x')} data-testid="direct-share-x" className={chipClass}>
          {SHARE_PLATFORM_ICONS.x}
          <span className="whitespace-nowrap">{t('share.directShare.x')}</span>
        </button>
        <button type="button" onClick={handleReddit} aria-label={t('share.directShare.reddit')} data-testid="direct-share-reddit" className={chipClass}>
          {SHARE_PLATFORM_ICONS.reddit}
          <span className="whitespace-nowrap">{t('share.directShare.reddit')}</span>
        </button>
        <button
          type="button"
          onClick={() => handleAppDegrade('instagram')}
          aria-label={t('share.directShare.instagram')}
          data-testid="direct-share-instagram"
          disabled={!imageReady}
          className={chipClass}
        >
          {SHARE_PLATFORM_ICONS.instagram}
          <span className="whitespace-nowrap">{t('share.directShare.instagram')}</span>
        </button>
        <button
          type="button"
          onClick={() => handleAppDegrade('tiktok')}
          aria-label={t('share.directShare.tiktok')}
          data-testid="direct-share-tiktok"
          disabled={!imageReady}
          className={chipClass}
        >
          {SHARE_PLATFORM_ICONS.tiktok}
          <span className="whitespace-nowrap">{t('share.directShare.tiktok')}</span>
        </button>
      </div>
      {guide && (
        <p className="mt-1.5 text-center text-[10px] leading-tight text-text-tertiary" data-testid="direct-share-hint">
          {guide.copied
            ? t('share.directShare.appGuideCopied')
            : t('share.directShare.appGuideNoCopy')}
        </p>
      )}
    </div>
  );
}
