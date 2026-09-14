'use client';

/**
 * ShareModal — 拦截勋章分享弹窗
 *
 * 渲染模板卡 (card-templates 注册制) → 运行时加载 html-to-image (CDN, 不装新依赖)
 * 生成 PNG → Web Share API (带文件) 分享; 不支持时 fallback 下载。
 *
 * 模板体系 (batch2-b): 顶部 chips 切换 ≥3 款勋章卡 — 拦截 / 连续守护 / 里程碑,
 * 默认选中拦截卡 (已有用户路径零回归)。切模板即重生成 PNG。
 *
 * 面子/里子分离 (owner 09-06 铁律): 分享图上只有小时/次数/天数, 永无钱数;
 * modal 内卡片下方保留「你实际省下 ¥X」私密提示行 ( EyeOff 标识, 不上图)。
 *
 * 🔧 手势时序: Web Share 需要近期的用户激活 (transient activation),
 *    在 open 时预生成 PNG, 点「分享」时只做 navigator.share — 保持手势链有效。
 * 弹窗结构沿用 ChallengeModal 惯例: createPortal + open/onClose + Escape + backdrop 点击关闭。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, EyeOff, Share2, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { loadHtmlToImage } from '@/lib/html-to-image-loader';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_HOURLY_RATE, moneyToFreedomLabel } from '@/lib/freedom-time';
import type { InterceptMedalData } from '@/types/intercept-medal';
import {
  SHARE_TEMPLATES,
  getShareTemplate,
  type BadgeCardData,
  type ChallengeCardData,
  type InviteCardSnapshot,
  type ShareTemplateId,
  type WeeklyCardSnapshot,
  formatShareHoursLabel,
} from './card-templates';
import { getBadgeDisplayName } from './badge-card';
import { getChallengeDisplayName } from './challenge-card';

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** 勋章数据 (itemTitle + savedCents 必填) */
  medal: InterceptMedalData;
  /** 连续拦截天数 — 从 buddyState.streak 读, 0/undefined 时卡片隐藏该行 */
  streakDays?: number;
  /** 累计拦截次数 — 父组件已知时直接传入 (跳过 fetch); 缺省时 modal 自行查 /api/challenge/stats */
  interceptCount?: number;
  /** batch4-a: badge 模板数据 — 传入时 badge chip 出现 (badges-section 晒入口) */
  badgeCard?: BadgeCardData;
  /** batch5-a: challenge 模板数据 — 传入时 challenge chip 出现 (challenge-modal 完成态晒入口) */
  challengeCard?: ChallengeCardData;
  /** weekly 模板数据 — 传入时 weekly chip 出现; savedHours 已由调用方换算 */
  weeklyCard?: WeeklyCardSnapshot;
  /** Honor-only rank snapshot passed through to supported share cards */
  guardRank?: { name: string; level: number; emoji: string };
  /** dream 模板数据 — 传入时 dream chip 出现; 卡面只渲染小时 */
  dreamFund?: { name: string; savedCents: number; streakDays?: number };
  /** invite 模板数据 — 真实 ref 码 + 已同行人数; 金额与天数不上卡 */
  inviteCard?: InviteCardSnapshot;
  /** batch4-a: 打开时默认选中的模板 (缺省 intercept, 既有路径零回归) */
  initialTemplate?: ShareTemplateId;
  /** batch4-a: 根节点 z-index class (从 badges 收藏面板 z-[400] 之上唤起时传 z-[500]) */
  zIndexClass?: string;
}

type GenState = 'idle' | 'generating' | 'ready' | 'error';

export function ShareModal({
  open,
  onClose,
  medal,
  streakDays,
  interceptCount: interceptCountProp,
  badgeCard,
  challengeCard,
  weeklyCard,
  guardRank,
  dreamFund,
  inviteCard,
  initialTemplate,
  zIndexClass = 'z-[110]',
}: ShareModalProps) {
  const { hourlyRate } = useHourlyRate();
  // 🔧 owner 09-06: share card shows won-back hours (face), never money (里子 stays private)
  const effectiveRate = hourlyRate || DEFAULT_HOURLY_RATE;
  const { t, locale } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  // badge/challenge 模板需专属数据才可选 — 缺数据时落回 intercept (不出现空卡)
  const [selectedId, setSelectedId] = useState<ShareTemplateId>(
    (initialTemplate === 'badge' && !badgeCard) ||
      (initialTemplate === 'challenge' && !challengeCard) ||
      (initialTemplate === 'weekly' && !weeklyCard) ||
      (initialTemplate === 'dream' && !dreamFund) ||
      (initialTemplate === 'guardian-stats' && !guardRank) ||
      (initialTemplate === 'invite' && !inviteCard)
      ? 'intercept'
      : initialTemplate ?? 'intercept'
  );
  const [genState, setGenState] = useState<GenState>('idle');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // 累计拦截次数 — props 优先; fetch 失败置 null → 里程碑 chip 隐藏 (诚实降级, 不猜数)
  const [fetchedCount, setFetchedCount] = useState<number | null>(null);
  // 🔧 2026-09-06 (batch8-c): refCode 只用于 share text/url; demo/未登录/断网时静默降级为普通分享
  const [refCode, setRefCode] = useState<string | null>(null);

  const interceptCount = interceptCountProp ?? fetchedCount;

  // 里程碑次数从现有 challenge stats 推导 (零 DDL); 失败不影响其余模板。
  // AbortController: modal 关闭即中止在途请求 — 不留悬挂 fetch (测试环境也干净)
  useEffect(() => {
    if (!open || interceptCountProp !== undefined) return;
    const controller = new AbortController();
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 弹窗按需 fetch (open 时才发), AbortController 已防悬挂; F2 类 bug 不适用 (modal 打开时 auth 必已就绪)
    apiFetch<{ totalPassed: number }>('/api/challenge/stats', { signal: controller.signal })
      .then((data) => {
        setFetchedCount(Number.isFinite(data?.totalPassed) ? data.totalPassed : null);
      })
      .catch(() => {
        setFetchedCount(null);
      });
    return () => controller.abort();
  }, [open, interceptCountProp]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // safe to ignore: invite attribution is optional; share must never block or error on failure
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- optional invite attribution; modal is user-triggered and auth-ready
    apiFetch<{ refCode?: string }>('/api/invite/link')
      .then((data) => {
        if (!cancelled && data?.refCode) setRefCode(data.refCode);
      })
      .catch(() => {
        if (!cancelled) setRefCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const generatePng = useCallback(async () => {
    if (!cardRef.current) return;
    setGenState('generating');
    try {
      const { toPng } = await loadHtmlToImage();
      // skipFonts: 系统字体即可, 避免 CDN 字体内联的 CORS 失败; pixelRatio 2 = 清晰度
      const png = await toPng(cardRef.current, {
        pixelRatio: 2,
        skipFonts: true,
        backgroundColor: '#143527',
      });
      setDataUrl(png);
      setGenState('ready');
    } catch (err) {
      // safe to ignore: PNG export failure surfaces via error state UI below
      logger.warn('[ShareModal] PNG generation failed:', err instanceof Error ? err.message : String(err));
      setGenState('error');
    }
  }, []);

  // 打开 / 切换模板时预生成 PNG (见顶部手势时序说明; effect 在 commit 后跑, cardRef 已指向新卡)
  useEffect(() => {
    if (open) {
      setDataUrl(null);
      generatePng();
    }
  }, [open, selectedId, generatePng]);

  // 里程碑模板只在次数已知时可选 (fetch 中/失败为 null → 不出现, 不猜数);
  // badge / challenge 模板只在有专属数据时可选 (对应晒入口传入)
  const visibleTemplates = useMemo(
    () =>
      SHARE_TEMPLATES.filter(
        (tp) =>
          (tp.id !== 'milestone' || interceptCount != null) &&
        (tp.id !== 'badge' || badgeCard != null) &&
        (tp.id !== 'challenge' || challengeCard != null) &&
        (tp.id !== 'weekly' || weeklyCard != null) &&
        (tp.id !== 'dream' || dreamFund != null) &&
        (tp.id !== 'guardian-stats' || guardRank != null) &&
        (tp.id !== 'invite' || inviteCard != null)
      ),
    [interceptCount, badgeCard, challengeCard, weeklyCard, dreamFund, guardRank, inviteCard]
  );

  // Escape 关闭 (a11y 惯例, 同 ChallengeModal)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const dataUrlToBlob = async (url: string): Promise<Blob> => {
    const res = await fetch(url);
    return res.blob();
  };

  // 拦截卡沿用历史文件名 (既有用户路径零回归), 其余模板按 id 命名
  const fileBase = selectedId === 'intercept' ? 'symy-intercept-medal' : `symy-${selectedId}-medal`;

  const handleDownload = useCallback(async () => {
    if (!dataUrl) return;
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      // safe to ignore: download fallback failure is non-blocking; user can retry share
      logger.warn('[ShareModal] download failed:', err instanceof Error ? err.message : String(err));
    }
  }, [dataUrl, fileBase]);

  const handleShare = useCallback(async () => {
    if (!dataUrl || sharing) return;
    setSharing(true);
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' });
      // owner 09-06 rule: share text = face only (green honor + won-back time). Never money.
      const hoursNum = Math.round((medal.savedCents / 100 / effectiveRate) * 10) / 10;
      // 亚小时出分钟, 与卡面取整同向 (同一笔拦截两面数字一致); <0.1h 回落数字兜底
      const hoursLabel = formatShareHoursLabel(medal.savedCents / 100 / effectiveRate, locale) || hoursNum;
      // 按模板配文案 — 分享出去的句子和图是同一枚勋章
      const shareText =
        selectedId === 'streak'
          ? streakDays && streakDays > 0
            ? t('share.streakCard.shareText', {
                hours: hoursLabel,
                defaultValue: `My green streak is alive — won back ${hoursLabel}. With Symy: buy less, live more.`,
              })
            : t('share.streakCard.shareTextStarting', {
                hours: hoursLabel,
                defaultValue: `My green streak starts today — won back ${hoursLabel} already. With Symy: buy less, live more.`,
              })
          : selectedId === 'milestone'
            ? t('share.milestoneCard.shareText', {
                count: Math.max(interceptCount ?? 1, 1),
                hours: hoursLabel,
                defaultValue: `Guard #${Math.max(interceptCount ?? 1, 1)} — won back ${hoursLabel} in total. With Symy: buy less, live more.`,
              })
            : selectedId === 'badge' && badgeCard
              ? t('share.badgeCard.shareText', {
                  name: getBadgeDisplayName(badgeCard.badge.id, t),
                  hours: hoursLabel,
                  defaultValue: `The ${getBadgeDisplayName(badgeCard.badge.id, t)} honor is unlocked — won back ${hoursLabel}. Buy less. Live more.`,
                })
              : selectedId === 'challenge' && challengeCard
                ? t('share.challengeCard.shareText', {
                    title: getChallengeDisplayName(challengeCard.challenge, t),
                    hours: hoursLabel,
                    defaultValue: `Challenge complete: ${getChallengeDisplayName(challengeCard.challenge, t)} — won back ${hoursLabel}. Buy less. Live more.`,
                  })
                : selectedId === 'weekly' && weeklyCard
                  ? t('share.weeklyCard.shareText', {
                      days: weeklyCard.guardDays,
                      hours: formatShareHoursLabel(weeklyCard.savedHours, locale) || hoursLabel,
                      defaultValue: `${weeklyCard.guardDays} days guarded this week — won back ${formatShareHoursLabel(weeklyCard.savedHours, locale) || hoursLabel}. Buy less. Live more.`,
                    })
                  : selectedId === 'guardian-stats' && guardRank
                    ? t('share.guardianStats.shareText', {
                        count: Math.max(interceptCount ?? 0, 0),
                        days: Math.max(streakDays ?? 0, 0),
                        hours: hoursLabel,
                        defaultValue: `My guardian record: ${Math.max(interceptCount ?? 0, 0)} intercepts, ${Math.max(streakDays ?? 0, 0)} days guarded, ${hoursLabel} won back. Buy less. Live more.`,
                      })
                    : selectedId === 'invite' && inviteCard
                      ? t('share.inviteCard.shareText', {
                          count: inviteCard.completedCount,
                          defaultValue: 'Join me as a green guardian. Buy less. Live more.',
                        })
                    : t('share.interceptMedal.shareText', {
                  item: medal.itemTitle,
                  hours: hoursLabel,
                  defaultValue: `I skipped an impulse buy and won back ${hoursLabel}. With Symy — for me and the planet. Buy less. Live more.`,
                });
      const shareUrl = refCode ? `${window.location.origin}/?ref=${encodeURIComponent(refCode)}` : null;
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Symy',
          text: shareUrl ? `${shareText}\n${shareUrl}` : shareText,
          ...(shareUrl ? { url: shareUrl } : {}),
        });
      } else {
        // Web Share API 不可用 (或不含文件) → 下载
        await handleDownload();
      }
    } catch (err) {
      // 用户取消分享 (AbortError) 不是错误
      if (err instanceof Error && err.name === 'AbortError') return;
      // safe to ignore: share failure falls back to download path; UI error state covers generation failures
      logger.warn('[ShareModal] share failed:', err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  }, [dataUrl, sharing, handleDownload, t, locale, selectedId, fileBase, medal.itemTitle, medal.savedCents, effectiveRate, streakDays, interceptCount, badgeCard, challengeCard, weeklyCard, guardRank, inviteCard, refCode]);

  if (!open) return null;

  const currentTemplate = getShareTemplate(selectedId);

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end justify-center bg-black/70 backdrop-blur-sm`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-glass-border bg-surface-1 animate-in slide-in-from-bottom duration-300 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="share-modal"
      >
        {/* 顶部把手 + 标题 */}
        <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-4 pb-2">
          <h2 className="text-base font-bold text-text-primary">
            {selectedId === 'challenge' && challengeCard
              ? t('share.challengeCard.modalTitle', { defaultValue: 'Share your challenge win' })
                : selectedId === 'badge' && badgeCard
                  ? t('share.badgeCard.modalTitle', { defaultValue: 'Share your green honor' })
                  : selectedId === 'weekly' && weeklyCard
                    ? t('share.weeklyCard.modalTitle', { defaultValue: 'Share your weekly report' })
                    : selectedId === 'dream' && dreamFund
                      ? t('share.dreamCard.modalTitle', { defaultValue: 'Share your dream moment' })
                    : selectedId === 'guardian-stats' && guardRank
                      ? t('share.guardianStats.title', { defaultValue: 'Guardian Record' })
                    : t('share.interceptMedal.modalTitle', { defaultValue: 'Your intercept medal' })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="p-1 rounded-lg hover:bg-glass-hover text-text-secondary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 模板选择 chips — 默认拦截卡, 切换即重生成 PNG */}
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
            {visibleTemplates.map((tp) => {
              const selected = tp.id === selectedId;
              const Icon = tp.icon;
              return (
                <button
                  key={tp.id}
                  onClick={() => setSelectedId(tp.id)}
                  aria-pressed={selected}
                  data-testid={`template-chip-${tp.id}`}
                  className={`flex flex-shrink-0 select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-text-secondary hover:border-emerald-400/30 hover:text-text-primary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{t(tp.labelKey, { defaultValue: tp.labelDefault })}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 卡片预览 — 窄视口横向滚动兜底 */}
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-4 pb-3">
          {/* zoom 参与布局: 包装盒随缩放收缩, 卡底不再露出面板色白条 (scale 只缩视觉, 留 48px 布局幻影) */}
          <div className="mx-auto w-fit [zoom:0.92] sm:[zoom:1]">
            {currentTemplate.render({
              medal,
              streakDays: streakDays ?? 0,
              interceptCount: interceptCount ?? 0,
              badgeCard,
              challengeCard,
              weeklyCard,
              guardRank,
              dreamFund,
              inviteCard,
              savedHours:
                selectedId === 'dream' && dreamFund
                  ? dreamFund.savedCents / 100 / effectiveRate
                  : medal.savedCents / 100 / effectiveRate,
              cardRef,
            })}
          </div>
          {genState === 'error' && (
            <div className="mt-3 text-center">
              <p className="text-[11px] text-red-400">
                {t('share.interceptMedal.generateFailed', { defaultValue: "Couldn't create the image. Check your connection and retry." })}
              </p>
              <button
                onClick={generatePng}
                className="mt-2 px-4 py-1.5 rounded-xl bg-glass-fill border border-glass-border text-xs font-medium text-text-primary hover:border-emerald-400/40 transition-colors cursor-pointer"
              >
                {t('share.interceptMedal.retry', { defaultValue: 'Retry' })}
              </button>
            </div>
          )}
        </div>

        {/* 私密提示行 — 里子只在 app 内可见, 永不进分享图 (owner 09-06) */}
        {medal.savedCents > 0 && (
          <div
            className="flex-shrink-0 flex items-center justify-center gap-1.5 px-4 pb-1"
            data-testid="private-saved-hint"
          >
            <EyeOff className="h-3 w-3 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
            <span className="text-[10px] leading-tight text-text-tertiary">
              {(() => {
                const timeWon = moneyToFreedomLabel(medal.savedCents / 100, locale, effectiveRate);
                return selectedId === 'challenge' && challengeCard
                  ? t('share.challengeCard.privateHint', {
                      amount: timeWon,
                      defaultValue: `Behind this challenge, ${timeWon} of your life stayed with you — just your little secret`,
                    })
                    : selectedId === 'weekly' && weeklyCard
                      ? t('share.weeklyCard.privateHint', {
                          amount: timeWon,
                          defaultValue: `Behind this week, ${timeWon} of your life stayed with you — just your little secret`,
                        })
                      : selectedId === 'badge' && badgeCard
                        ? t('share.badgeCard.privateHint', {
                        amount: timeWon,
                        defaultValue: `Behind this honor, ${timeWon} of your life stayed with you — just your little secret`,
                      })
                    : t('share.privateSavedHint', {
                        amount: timeWon,
                        defaultValue: `Just your little secret: you actually won back ${timeWon}`,
                      });
              })()}
            </span>
          </div>
        )}

        {/* 操作条 — 分享 (Web Share, fallback 下载) + 保存图片 */}
        <div className="flex-shrink-0 flex gap-2 px-4 pb-5 pt-2">
          <button
            onClick={handleShare}
            disabled={genState !== 'ready' || sharing}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-[#0c2017] text-sm font-bold hover:from-emerald-400 hover:to-green-400 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            {genState === 'generating'
              ? t('share.interceptMedal.generating', { defaultValue: 'Creating your medal…' })
              : t('share.interceptMedal.share', { defaultValue: 'Share' })}
          </button>
          <button
            onClick={handleDownload}
            disabled={genState !== 'ready'}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-glass-fill border border-glass-border text-sm font-medium text-text-primary hover:border-emerald-400/40 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {t('share.interceptMedal.save', { defaultValue: 'Save image' })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
