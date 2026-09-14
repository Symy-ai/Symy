'use client';

/* eslint-disable require-await -- 下载兜底为同步 DOM 操作, 无需 await 表达式 */
/**
 * GuardDiaryCard — 今日守护日记卡 (batch47-b)
 *
 * chat tab 顶部轻量卡 (recap/回访条之下): 小象基于当日守护 ledger 写的一句日记。
 * - 收面: 日记一句 + 次数/小时 + 收藏星标 + 分享按钮
 * - 私有展开面: 今日省下估算金额 (estSaved, 复用 hourly_rate 体系) + 最近收藏回看
 * - 分享面走 GuardDiaryShareFace (类型上拿不到金额), loadHtmlToImage 导出
 * 荣誉非羞辱: 零守护日 companion 文案由生成器保证, 卡片不渲染任何失败态。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Share2, Star } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { loadHtmlToImage } from '@/lib/html-to-image-loader';
import { logger } from '@/lib/logger';
import { useGuardDiary } from '@/hooks/use-guard-diary';
import { formatDiaryHours } from '@/lib/guard-diary';
import {
  isGuardDiaryFavorited,
  listGuardDiaryFavorites,
  toggleGuardDiaryFavorite,
  type GuardDiaryFavorite,
} from '@/lib/guard-diary-store';
import { GuardDiaryShareFace } from './guard-diary-share';

export interface GuardDiaryCardProps {
  /** 连续守护天数 (分享面用; 0 不显示) */
  streakDays: number;
  isDemo?: boolean;
}

type ShareState = 'idle' | 'generating' | 'ready' | 'error';

export function GuardDiaryCard({ streakDays, isDemo = false }: GuardDiaryCardProps) {
  const { t, locale } = useI18n();
  const { diary } = useGuardDiary(isDemo);
  const [expanded, setExpanded] = useState(false);
  const [favorited, setFavorited] = useState<boolean | null>(null);
  const [favorites, setFavorites] = useState<GuardDiaryFavorite[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const shareFaceRef = useRef<HTMLDivElement>(null);

  // favorited=null 表示未初始化 (展开时才读一次 localStorage)
  const isFavorited = favorited ?? (diary ? isGuardDiaryFavorited(diary.date) : false);

  const handleToggleFavorite = useCallback(() => {
    if (!diary) return;
    const next = toggleGuardDiaryFavorite(diary);
    setFavorited(next);
    setFavorites(listGuardDiaryFavorites());
  }, [diary]);

  const handleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) setFavorites(listGuardDiaryFavorites());
  }, [expanded]);

  // 渲染分享面 → toPng 导出 (只有 commit 后 shareFaceRef 才指向 DOM 节点)
  const generatePng = useCallback(async () => {
    if (!shareFaceRef.current) return;
    setShareState('generating');
    setDataUrl(null);
    try {
      const { toPng } = await loadHtmlToImage();
      const png = await toPng(shareFaceRef.current, {
        pixelRatio: 2,
        skipFonts: true,
        backgroundColor: '#143527',
      });
      setDataUrl(png);
      setShareState('ready');
    } catch (err) {
      // safe to ignore: 导出失败走下方错误态 UI
      logger.warn('[GuardDiaryCard] PNG generation failed:', err instanceof Error ? err.message : String(err));
      setShareState('error');
    }
  }, []);

  // 打开分享弹层时预生成 PNG (保住下载手势链, 同 DailyGreenReport 预生成模式)
  // 🔧 batch73-a fix: 生成改走 commit 后的 effect — 原先在点击 handler 里同步调
  //   generatePng(), 弹层尚未挂载 shareFaceRef.current 必为 null, 函数提前 return
  //   且 shareState 停在 'idle', 保存按钮 disabled={shareState !== 'ready'} 恒禁用
  //   (聊天页守护日记无法保存, 兄弟组件 share-modal/daily-green-report 均为 effect 预生成)。
  useEffect(() => {
    if (!shareOpen) return;
    void generatePng();
  }, [shareOpen, generatePng]);

  const handleShareClick = useCallback(() => {
    setShareOpen(true);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!dataUrl || !diary) return;
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `symy-guard-diary-${diary.date}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      // safe to ignore: 下载兜底失败非阻塞, 用户可重试
      logger.warn('[GuardDiaryCard] download failed:', err instanceof Error ? err.message : String(err));
    }
  }, [dataUrl, diary]);

  const shareData = useMemo(
    () =>
      diary
        ? {
            date: diary.date,
            text: diary.text,
            guardCount: diary.guardCount,
            hoursReclaimed: diary.hoursReclaimed,
            streakDays: Math.max(0, Math.floor(streakDays)),
          }
        : null,
    [diary, streakDays],
  );

  if (!diary) return null;

  return (
    <div
      data-testid="guard-diary-card"
      className="mt-2 mx-3 rounded-xl bg-glass-fill border border-glass-border overflow-hidden"
    >
      {/* 收面 — 日记一句 + 收藏/分享 */}
      <div className="flex items-start gap-2 p-2.5">
        <button
          onClick={handleExpand}
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
          data-testid="guard-diary-expand"
          aria-expanded={expanded}
        >
          <span className="text-[12px] leading-relaxed text-text-primary min-w-0 flex-1">
            🐘 {diary.text}
          </span>
          {expanded ? (
            <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          ) : (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          )}
        </button>
        <button
          onClick={handleToggleFavorite}
          className="shrink-0 rounded-lg p-1 transition-colors hover:bg-glass-fill"
          aria-label={isFavorited ? t('chat.guardDiary.favorited') : t('chat.guardDiary.favorite')}
          data-testid="guard-diary-favorite"
          data-favorited={isFavorited}
        >
          <Star
            className={`h-4 w-4 ${isFavorited ? 'fill-amber-400 text-amber-400' : 'text-text-tertiary'}`}
            aria-hidden="true"
          />
        </button>
        <button
          onClick={handleShareClick}
          className="shrink-0 rounded-lg p-1 text-text-tertiary transition-colors hover:text-text-secondary"
          aria-label={t('chat.guardDiary.share')}
          data-testid="guard-diary-share-btn"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* 私有展开面 — estSaved (里子) + 最近收藏回看 */}
      {expanded && (
        <div className="border-t border-glass-border px-3 py-2.5" data-testid="guard-diary-private">
          {diary.guardCount > 0 && (
            <p className="text-[11px] text-text-secondary" data-testid="guard-diary-est-saved">
              {t('chat.guardDiary.estSavedLabel')}:{' '}
              {new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 2,
              }).format(diary.estSaved)}
              {' · '}
              {formatDiaryHours(diary.hoursReclaimed)}h
            </p>
          )}
          <p className="mt-1.5 text-[11px] font-medium text-text-secondary">
            {t('chat.guardDiary.recentTitle')}
          </p>
          {favorites.length === 0 ? (
            <p className="mt-1 text-[11px] text-text-tertiary">
              {t('chat.guardDiary.emptyRecent')}
            </p>
          ) : (
            <ul className="mt-1 space-y-1" data-testid="guard-diary-recent-list">
              {favorites.map((f) => (
                <li key={f.date} className="text-[11px] leading-relaxed text-text-secondary">
                  <span className="text-text-tertiary">{f.date}</span> {f.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 分享弹层 — 面子字段 only (shareData 类型上无金额) */}
      {shareOpen && shareData && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareOpen(false)}
          data-testid="guard-diary-share-modal"
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <GuardDiaryShareFace data={shareData} cardRef={shareFaceRef} />
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={shareState === 'error' ? () => void generatePng() : handleDownload}
                disabled={shareState !== 'ready' && shareState !== 'error'}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                data-testid="guard-diary-share-download"
              >
                {shareState === 'generating'
                  ? t('chat.guardDiary.shareGenerating')
                  : shareState === 'error'
                    ? t('chat.guardDiary.shareFailed')
                    : t('chat.guardDiary.shareDownload')}
              </button>
              <button
                onClick={() => setShareOpen(false)}
                className="rounded-lg border border-glass-border px-4 py-1.5 text-[12px] text-text-secondary"
              >
                {t('chat.guardDiary.shareClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
