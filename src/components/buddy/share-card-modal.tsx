/**
 * ShareCardModal — 分享卡弹窗 (绿色守护叙事版)
 *
 * 守护叙事三要素 (绿色转向后):
 *   1. AI 金句 (AI quote) — 最近一次挑战的 AI 回复
 *   2. 赢回的时间 (won-back hours) — 累计留住的钱换算成生命小时数 (金额本体永不上卡)
 *   3. 守护宣言 (guardian manifesto) — "Buy less, live more. Every guarded choice is a medal."
 *
 * 需求二: Share my progress 分享功能
 * 点击"晒晒我的守护卡" → 弹出分享卡弹窗 (Canvas 渲染为图片)
 * 支持: 存图片 (PNG 下载) + 系统分享 (navigator.share / 桌面端降级)
 *
 * 🔧 2026-07-17 (task 5): 加 "Today's story" + MultiPlatformShare 多平台一键分享
 *   - 用户可输入"今天我克制了 X" (可选), 生成个性化分享卡
 *   - 多平台按钮: X / Reddit / WhatsApp / Telegram / Email / IG / TikTok / WeChat / 复制链接
 *   - native navigator.share 优先 (移动端)
 *
 * 🔒 导出面红线 (owner 09-06): 卡图与分享文案零金额/零省钱数字 —
 *   钱只在 app 内换算成小时上卡 (面子晒荣誉, 里子留在 app 内)。
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api-client';
import type { BuddyState } from '@/types/buddy-state';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { MultiPlatformShare } from '@/components/common/multi-platform-share';

export interface ShareCardModalProps {
  open: boolean;
  onClose: () => void;
  buddyState: BuddyState;
  aiQuote: string;
  onToast?: (message: string, type?: 'success' | 'info') => void;
}

// QR Code 简化版 (SVG data URL — 7x7 grid, 指向 symy.ai)
const QR_PLACEHOLDER = 'symy.ai';

export function ShareCardModal({ open, onClose, buddyState, aiQuote, onToast }: ShareCardModalProps) {
  const { t, locale } = useI18n();
  // 用 useHourlyRate 把留住的钱换算为生命小时数 (换算在 app 内完成, 金额本体不上卡)
  const { hourlyRate } = useHourlyRate(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // 🔧 PM decision 2: 获取用户 refCode, 分享链接加入 ?ref=USER_CODE 实现 viral loop
  const [refCode, setRefCode] = useState<string>('');
  // 🔧 2026-07-17 (task 5): "Today's story" 输入框 — 用户可输入"今天我克制了 X"生成个性化分享卡
  const [todayStory, setTodayStory] = useState<string>('');
  const [storyMode, setStoryMode] = useState<'default' | 'personal'>('default');

  // mount 时获取 refCode (用于分享链接归因)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        const data = await apiFetch<{ refCode: string }>('/api/invite/link');
        if (!cancelled && data?.refCode) setRefCode(data.refCode);
      } catch (err) {
        // safe to ignore: non-critical background operation, error already logged
        logger.warn('[ShareCard] Failed to fetch refCode:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // 提取数据
  const totalSaved = buddyState.dreamFunds?.reduce((sum, f) => sum + (f.current || 0), 0) ?? 0;
  const incompleteFund = buddyState.dreamFunds?.find(f => f.id !== 'df-savings' && f.current < f.target);
  const fundProgress = incompleteFund
    ? Math.round((incompleteFund.current / (incompleteFund.target || 1)) * 100)
    : null;
  const fundName = incompleteFund?.name ?? '';
  const streak = buddyState.streak ?? 0;
  // owner 09-06 rule: share card face-only — strip any money amounts from AI quote
  const stripMoney = (s: string): string =>
    s
      .replace(/[¥$]\s?\d+(?:[.,]\d+)?\s*(?:万|千)?/gu, '')
      .replace(/\d+(?:[.,]\d+)?\s*(?:元|块|CNY|RMB|USD|dollars?)/giu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  const quote = stripMoney(aiQuote) || t('share.defaultQuote');

  // 赢回的时间 — $ → hours (金额只在 app 内参与换算, 导出面只出小时数)
  const effectiveHourlyRate = hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;
  const lifeHours = totalSaved / effectiveHourlyRate;

  const lifeHoursDisplay = lifeHours >= 100
    ? Math.round(lifeHours).toLocaleString()
    : lifeHours.toFixed(1);

  // 守护宣言 — 不评判, 只夸守护的人 (荣誉框架)
  const manifesto = t('share.defaultQuote');

  // 生成 Canvas 图片
  // 🔧 2026-07-17 (task 5): 改为 async 以支持 dataURL → blob 转换
  const generateImage = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsGenerating(true);

    const canvas = canvasRef.current;
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsGenerating(false);
      return;
    }

    // 背景: 深色渐变 #162235 → #1B6B7A
    const gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    gradient.addColorStop(0, '#162235');
    gradient.addColorStop(1, '#1B6B7A');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    const padding = 80;
    const centerX = 540;

    // 1. Logo 区域
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillStyle = '#67E8F9';
    ctx.fillText('🛡️ Symy', centerX, 200);

    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#94A3B8';
    // 🔧 PM-#8 fix: 小象是主角 (绿色环保小象人设)
    ctx.fillText(t('share.yourCompanion'), centerX, 260);

    // 2. AI 金句 (居中, 大字号, 白色, 带引号)
    ctx.font = 'italic 48px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    const quoteText = `"${quote}"`;
    wrapText(ctx, quoteText, centerX, 380, 920, 64);
    const quoteLines = countLines(quoteText, 920, ctx);
    const quoteEndY = 380 + (quoteLines - 1) * 64;

    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#67E8F9';
    ctx.fillText('— Symy AI', centerX, quoteEndY + 50);

    // 分隔线 1
    const divider1Y = quoteEndY + 150;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, divider1Y);
    ctx.lineTo(1080 - padding, divider1Y);
    ctx.stroke();

    // 3. 赢回的时间 — 守护战报主角 (导出面红线: 零金额, 只出小时数)
    const ltLabelY = divider1Y + 100;
    ctx.textAlign = 'center';
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(t('share.interceptMedal.wonBackLabel'), centerX, ltLabelY);

    const ltAmountY = ltLabelY + 80;
    ctx.font = 'bold 88px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(lifeHoursDisplay, centerX, ltAmountY);

    const ltUnitY = ltAmountY + 60;
    ctx.font = '36px sans-serif';
    ctx.fillStyle = '#67E8F9';
    ctx.fillText(t('share.wonBackUnit'), centerX, ltUnitY);

    // 数据行: streak + level + vitality (紧凑横排)
    const statsY = ltUnitY + 110;
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#FBBF24';
    ctx.textAlign = 'left';
    const stat1X = padding + 20;
    ctx.fillText(`🔥 ${streak} ${t('share.daysGuarded')}`, stat1X, statsY);

    ctx.fillStyle = '#67E8F9';
    ctx.textAlign = 'center';
    ctx.fillText(`⚡ LV.${buddyState.level}`, centerX, statsY);

    ctx.fillStyle = '#A78BFA';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(buddyState.vitality)}% ${t('share.vitalityLabel')}`, 1080 - padding - 20, statsY);

    // Dream Fund 进度 (如果有未完成的基金)
    let afterFundY = statsY + 50;
    if (fundProgress !== null && fundName) {
      afterFundY = statsY + 90;
      ctx.textAlign = 'left';
      ctx.font = '32px sans-serif';
      ctx.fillStyle = '#67E8F9';
      const fundText = `🎯 ${fundName} ${fundProgress}%`;
      ctx.fillText(fundText, padding, afterFundY);
    }

    // 分隔线 2
    const divider2Y = afterFundY + 60;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, divider2Y);
    ctx.lineTo(1080 - padding, divider2Y);
    ctx.stroke();

    // 4. 守护宣言 (guardian manifesto) — 荣誉框架收尾
    //    居中, 中等字号, 引导语调
    const manifestoY = divider2Y + 130;
    ctx.textAlign = 'center';
    ctx.font = 'italic 42px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    wrapText(ctx, manifesto, centerX, manifestoY, 920, 56);

    // 分隔线 3
    const divider3Y = manifestoY + 130;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, divider3Y);
    ctx.lineTo(1080 - padding, divider3Y);
    ctx.stroke();

    // 5. 底部: CTA + symy.ai + QR
    ctx.textAlign = 'center';
    ctx.font = '36px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(t('share.joinSymy'), centerX, divider3Y + 110);

    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#67E8F9';
    ctx.fillText('symy.ai', centerX, divider3Y + 180);

    // QR Code 占位 (简化版: 画一个方块 + 文字)
    const qrSize = 120;
    const qrX = centerX - qrSize / 2;
    const qrY = divider3Y + 240;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = '#000000';
    ctx.font = '14px sans-serif';
    ctx.fillText(QR_PLACEHOLDER, centerX, qrY + qrSize / 2 + 5);

    // 🔧 2026-07-17 (task 5): "Today's story" 区域 — 如果用户输入了"今天我克制了 X"
    //   在 manifesto 和 QR 之间画一段个性化故事文本
    //   留出底部空间, 所以 manifesto 位置可能要上移
    if (todayStory.trim()) {
      const storyY = qrY + qrSize + 60;
      ctx.textAlign = 'center';
      ctx.font = 'italic 28px sans-serif';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText(t('buddy.shareCanvasTodayStory', { defaultValue: "— Today's story —" }), centerX, storyY);
      ctx.font = '32px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      const storyText = todayStory.trim().slice(0, 120);  // 截断到 120 字符
      wrapText(ctx, storyText, centerX, storyY + 50, 880, 44);
    }

    // 转为 data URL + Blob (用于 navigator.share files)
    const dataUrl = canvas.toDataURL('image/png');
    setImageUrl(dataUrl);
    // 转 Blob (用于 navigator.share files API)
    try {
      const blobResp = await fetch(dataUrl);
      const blob = await blobResp.blob();
      setImageBlob(blob);
    } catch (err) {
      // dataURL → blob 失败不影响主流程
      logger.warn('[ShareCard] Failed to convert dataURL to blob:', err);
      setImageBlob(null);
    }
    setIsGenerating(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [fundProgress, fundName, streak, quote, locale, lifeHoursDisplay, buddyState.level, buddyState.vitality, hourlyRate, todayStory]);

  // open 时生成图片
  // 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-4): track setTimeout for cleanup
  //    旧代码: setTimeout 未保存 → 卸载后 generateImage 在 stale canvas 上运行
  const generateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (open) {
      // 延迟生成让 canvas 先 mount
      generateTimerRef.current = setTimeout(() => {
        generateTimerRef.current = null;
        generateImage();
      }, 100);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional setState in effect (reset on close), see ARCH-DEEP-71
      setImageUrl(null);
    }
    // 🔧 HIGH-4: cleanup on unmount or open change
    return () => {
      if (generateTimerRef.current) {
        clearTimeout(generateTimerRef.current);
        generateTimerRef.current = null;
      }
    };
  }, [open, generateImage]);

  // 🔧 P3-6 fix: Escape 键关闭弹窗 (a11y 标准)
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // 存图片
  const handleSaveImage = useCallback(() => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `symy-guard-card-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast?.(t('buddy.shareImageSaved', { defaultValue: '✅ Image saved to your device!' }), 'success');
  }, [imageUrl, onToast, t]);

  // 分享
  const handleShare = useCallback(async () => {
    if (!imageUrl) return;
    try {
      // 尝试将 dataURL 转为 Blob 用于 navigator.share
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'symy-guard-card.png', { type: 'image/png' });

      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        const storyLine = todayStory.trim() ? `\n\nToday: ${todayStory.trim()}` : '';
        await navigator.share({
          title: t('buddy.shareProgressTitle', { defaultValue: '🐘 Symy — my green guard report' }),
          text: t('buddy.shareProgressText', {
            lifeHours: lifeHoursDisplay,
            story: storyLine,
            defaultValue: `🌱 ${lifeHoursDisplay} hours won back with Symy — every guard feeds the planet. Become a guardian with me: buy less, live more.${storyLine}`,
          }),
          files: [file],
        });
        onToast?.(t('buddy.shareProgressCopied', { defaultValue: '✅ Shared successfully!' }), 'success');
      } else {
        // 桌面端降级: 存图片 + 复制链接
        handleSaveImage();
        try {
          // 🔧 PM decision 2: 复制链接加入 ?ref=USER_CODE 实现 viral loop 归因
          //   有 refCode 时: origin/?ref=CODE (分享者获得邀请奖励)
          //   无 refCode 时: origin (fallback, 不影响分享功能)
          const shareUrl = refCode
            ? `${window.location.origin}/?ref=${refCode}`
            : window.location.origin;
          await navigator.clipboard?.writeText(shareUrl);
          onToast?.(t('buddy.shareLinkCopied', { defaultValue: '✅ Image saved + link copied to clipboard!' }), 'success');
        } catch {
          onToast?.(t('buddy.shareImageSaved', { defaultValue: '✅ Image saved to your device!' }), 'success');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.warn('[ShareCard] Share failed:', err);
      onToast?.(t('buddy.shareProgressFailed', { defaultValue: 'Could not share — please try again.' }), 'info');
    }
  }, [imageUrl, lifeHoursDisplay, onToast, t, handleSaveImage, refCode, todayStory]);

  if (!open) return null;

  const storyLine = todayStory.trim() ? `\n\nToday: ${todayStory.trim()}` : '';

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[calc(100%-2rem)] max-w-[400px] max-h-[90vh] overflow-y-auto bg-surface-1 border border-cyan-500/20 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center"
          aria-label={t('common.close')}
        >
          ✕
        </button>

        {/* 分享卡预览 */}
        <div className="p-4">
          {isGenerating && !imageUrl ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Symy Guardian Card"
              className="w-full rounded-xl"
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-text-tertiary text-sm">
              {t('buddy.shareCardGenerating', { defaultValue: 'Generating card...' })}
            </div>
          )}
        </div>

        {/* 隐藏的 Canvas 用于生成图片 */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* 🔧 2026-07-17 (task 5): "Today's story" 输入框 */}
        <div className="px-4 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-text-secondary font-medium">
              {t('buddy.shareTodayStoryLabel', { defaultValue: '✏️ Today\'s story (optional)' })}
            </label>
            <button
              type="button"
              onClick={() => {
                setStoryMode(prev => prev === 'default' ? 'personal' : 'default');
                if (storyMode === 'personal') setTodayStory('');
              }}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {storyMode === 'default'
                ? t('buddy.sharePersonalize', { defaultValue: '+ Personalize' })
                : t('buddy.shareUseDefault', { defaultValue: 'Use default' })}
            </button>
          </div>
          {storyMode === 'personal' && (
            <textarea
              value={todayStory}
              onChange={(e) => setTodayStory(e.target.value.slice(0, 120))}
              placeholder={t('buddy.shareTodayStoryPlaceholder', { defaultValue: 'Today I resisted buying...' })}
              className={`w-full h-16 rounded-xl border px-3 py-2 text-xs resize-none focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all ${'bg-glass-fill border-glass-border text-text-primary placeholder:text-text-tertiary'}`}
              maxLength={120}
            />
          )}
          {storyMode === 'personal' && (
            <div className="flex justify-end">
              <span className={`text-[9px] ${todayStory.length > 100 ? 'text-yellow-500' : 'text-text-tertiary/70'}`}>
                {todayStory.length}/120
              </span>
            </div>
          )}
        </div>

        {/* 按钮区域 */}
        <div className="px-4 pb-4 space-y-2">
          {/* 🔧 2026-07-17 (task 5): 保留 Save Image 按钮 + 加多平台一键分享 */}
          <div className="flex gap-2">
            <button
              onClick={handleSaveImage}
              disabled={!imageUrl}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-medium hover:from-cyan-500/30 hover:to-purple-500/30 transition-all active:scale-95 cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span>💾</span>
              {t('buddy.shareSaveImage', { defaultValue: 'Save Image' })}
            </button>
            <button
              onClick={handleShare}
              disabled={!imageUrl}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-sm font-bold hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span>📤</span>
              {t('buddy.shareShare', { defaultValue: 'Share' })}
            </button>
          </div>
          {/* 🔧 2026-07-17 (task 5): 多平台一键分享 (X / Reddit / WhatsApp / Telegram / Email / IG / TikTok / WeChat / 复制链接) */}
          {imageUrl && (
            <MultiPlatformShare
              text={t('buddy.shareProgressText', {
                lifeHours: lifeHoursDisplay,
                story: storyLine,
                defaultValue: `🌱 ${lifeHoursDisplay} hours won back with Symy — every guard feeds the planet. Become a guardian with me: buy less, live more.${storyLine}`,
              })}
              url={refCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${refCode}` : 'https://symy.ai'}
              imageBlob={imageBlob}
              onToast={onToast}
              compact
            />
          )}
          <p className="text-[10px] text-text-tertiary/60 text-center">
            🔒 {t('buddy.sharePrivacyNote', { defaultValue: "Won't share your personal info" })}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 辅助: Canvas 文字换行
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  // 🔧 P1 fix: handle CJK text — split by spaces first, then split CJK segments into characters
  const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
  let tokens: string[];
  if (hasCJK) {
    // For mixed text: split by spaces, then further split each token into CJK chars + non-CJK runs
    tokens = text.split(' ').flatMap(token => {
      if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(token)) {
        return Array.from(token);
      }
      return token;
    });
  } else {
    tokens = text.split(' ');
  }
  let line = '';
  let yPos = y;
  for (const token of tokens) {
    const testLine = hasCJK && /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(token) ? line + token : line + (line ? ' ' : '') + token;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, yPos);
      line = token;
      yPos += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, yPos);
}

// 辅助: 计算文字换行后的行数
function countLines(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): number {
  // 🔧 P1 fix: handle CJK text — same split logic as wrapText
  const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
  let words: string[];
  if (hasCJK) {
    words = text.split(' ').flatMap(token => {
      if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(token)) {
        return Array.from(token);
      }
      return token;
    });
  } else {
    words = text.split(' ');
  }
  let line = '';
  let lines = 0;
  for (const word of words) {
    const testLine = hasCJK && /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(word) ? line + word : line + (line ? ' ' : '') + word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines++;
      line = word;
    } else {
      line = testLine;
    }
  }
  lines++;
  return lines;
}
