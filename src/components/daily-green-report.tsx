'use client';

/**
 * DailyGreenReport — 每日绿色守护日报卡 (Home tab)
 *
 * 面子/里子分离 (owner 定案 09-06, 沿袭 870755e face-only 分享原则):
 * - 面子: 今日守护次数 + 连续天数 — 荣誉框架, 可分享
 * - 里子: 累计找回金额 + 换算自由小时 — 仅 app 内可见, 分享图层永不出现钱数
 *
 * 数据口径 (零 DDL, 全部来自已有 props, 不新增 API):
 * - 守护 = challenge_completed (守住没买) + refund_processed (找回退款) 且时间戳
 *   在同一本地日。与 StatCard "You guarded" (saw + reclaimed) 口径不同 — 日报
 *   只计正向守护, challenge_failed 不计入也不出现任何负向文案 (荣誉框架非羞耻)。
 * - 金额 = stats.moneySaved (累计, 与 Money Saved StatCard 同源); 小时 = calculateFreedom。
 *
 * 每日一次高亮: localStorage `symy-daily-green-report` 存 getLimitWindow() 窗口
 * key (与 daily-ritual-overlay 同一 UTC 4:00 分界)。server 端已读状态需要新列 →
 * 违反零 DDL 红线, 故仅本地存储 (跨设备不同步, 可接受)。
 *
 * 分享: 不复用 ShareModal — 其卡片硬绑 InterceptMedalData/InterceptCard, 无法
 * 承载日报的次数维度。按任务书允许的 fallback 在本文件内实现简版分享弹窗,
 * 复用 loadHtmlToImage() 管线 + Web Share/下载 fallback, 不新增依赖。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, EyeOff, Flame, Leaf, Share2, ShieldCheck, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatShareHoursLabel } from '@/components/share/card-templates';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import { calculateFreedom } from '@/lib/freedom-calculator';
import { loadHtmlToImage } from '@/lib/html-to-image-loader';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { getLimitWindow, isWindowReset } from '@/lib/limit-window';
import { logger } from '@/lib/logger';

export interface DailyReportStats {
  impulseInterventions: number;
  moneySaved: number;
  daysStreak: number;
}

export interface DailyGreenReportProps {
  events: ImpulseEvent[];
  stats: DailyReportStats;
  isDemo?: boolean;
}

/** 未读高亮存储 key — 值为 getLimitWindow() 窗口字符串 */
const UNREAD_STORAGE_KEY = 'symy-daily-green-report';
/** 高亮展示时长 — 动画走完后才记「已读」, 用户刷新页面仍能看到当日高亮 */
const HIGHLIGHT_VISIBLE_MS = 4000;

function isGuardEvent(e: ImpulseEvent): boolean {
  return e.subType === 'challenge_completed' || e.subType === 'refund_processed';
}

/** 同一本地日的守护事件数 (本地时区, 与用户感知的「今天」一致) */
function countGuardsOnDate(events: ImpulseEvent[], date: Date): number {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return events.filter((e) => {
    if (!isGuardEvent(e)) return false;
    const t = e.timestamp;
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
  }).length;
}

/** 小时数展示: ≥10 取整, <10 保留 1 位 (与 intercept-card 同规则, 镜子不夸大) */
function formatFreedomHours(hours: number): string {
  if (hours <= 0) return '0';
  return hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
}

export function DailyGreenReport({ events, stats, isDemo = false }: DailyGreenReportProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemo);
  const [shareOpen, setShareOpen] = useState(false);
  const [isUnreadDay, setIsUnreadDay] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 每日一次高亮 — mount 后读本地窗口 key, 当日未读则亮 4s 后记「已读」
  useEffect(() => {
    const markSeen = () => {
      try {
        localStorage.setItem(UNREAD_STORAGE_KEY, getLimitWindow());
      } catch {
        // safe to ignore: 隐私模式 localStorage 不可写 — 高亮逻辑静默降级
      }
      setIsUnreadDay(false);
    };
    try {
      if (isWindowReset(localStorage.getItem(UNREAD_STORAGE_KEY))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性 mount 读 localStorage 后置状态 (SSR 安全), 同 daily-ritual-overlay 模式
        setIsUnreadDay(true);
        highlightTimerRef.current = setTimeout(markSeen, HIGHLIGHT_VISIBLE_MS);
      }
    } catch {
      // safe to ignore: localStorage 不可用 (隐私模式) — 卡片照常渲染, 无高亮
    }
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, []);

  const now = new Date();
  const todayGuards = countGuardsOnDate(events, now);
  const yesterdayGuards = countGuardsOnDate(events, new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const freedom = calculateFreedom(stats.moneySaved, hourlyRate);
  const hoursLabel = formatFreedomHours(freedom.hours);
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  }).format(now);

  // 空状态副文案: 昨日 > 0 → 昨日 + 累计; 仅累计 > 0 → 累计; 全 0 → 中性开始文案
  // (荣誉框架非羞耻: 任何状态都不出现 0 计数或"做得不够"暗示)
  let quietSub: string | null = null;
  if (todayGuards === 0) {
    if (yesterdayGuards > 0) {
      quietSub = `${t('home.dailyGreenQuietYesterday', { count: yesterdayGuards })} · ${t('home.dailyGreenQuietTotal', { count: stats.impulseInterventions })}`;
    } else if (stats.impulseInterventions > 0) {
      quietSub = t('home.dailyGreenQuietTotal', { count: stats.impulseInterventions });
    } else {
      quietSub = t('home.dailyGreenQuietFirst');
    }
  }

  return (
    <>
      <section
        data-testid="daily-green-report"
        data-unread={isUnreadDay ? 'true' : undefined}
        className={`relative overflow-hidden rounded-2xl p-5 ${isUnreadDay ? 'ring-1 ring-emerald-400/50 shadow-[0_0_28px_rgba(74,222,128,0.18)]' : ''}`}
        style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
      >
        {/* 顶部柔光 — 延续 intercept-card 的松绿视觉 */}
        <div
          className="absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-[70px]"
          style={{ background: 'rgba(74, 222, 128, 0.14)' }}
          aria-hidden="true"
        />

        {/* 标题行 + 分享入口 */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5">
              <Leaf className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#f0faf2]">{t('home.dailyGreenTitle')}</h3>
              <p className="text-[10px] text-[#88a292]">{dateLabel}</p>
            </div>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            aria-label={t('home.dailyGreenShareLabel')}
            data-testid="daily-green-share-button"
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5 text-[#b6cbbe] transition-colors hover:border-emerald-300/50 hover:text-emerald-200 cursor-pointer"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            {isUnreadDay && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* 面子区 — 有守护: 数字块; 无守护: 中性陪伴文案 (不出 0) */}
        {todayGuards > 0 ? (
          <div className="relative z-10 mt-4 flex items-stretch gap-4">
            <div className="flex flex-1 items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-300" aria-hidden="true" />
              <div>
                <p className="text-3xl font-black leading-none text-[#f0faf2]">{todayGuards}</p>
                <p className="mt-1 text-[11px] text-[#88a292]">{t('home.dailyGreenGuardsLabel')}</p>
              </div>
            </div>
            <div className="w-px bg-white/10" aria-hidden="true" />
            <div className="flex flex-1 items-center gap-2.5">
              <Flame className="h-5 w-5 flex-shrink-0 text-amber-300" aria-hidden="true" />
              <div>
                <p className="text-3xl font-black leading-none text-[#f0faf2]">
                  {stats.daysStreak}
                  <span className="ml-1 text-sm font-bold">{t('common.days')}</span>
                </p>
                <p className="mt-1 text-[11px] text-[#88a292]">{t('home.dailyGreenStreakLabel')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 mt-4">
            <p className="text-sm font-medium leading-relaxed text-[#a7f3d0]">{t('home.dailyGreenQuietTitle')}</p>
            <p className="mt-1 text-[11px] text-[#88a292]">{quietSub}</p>
          </div>
        )}

        {/* 里子区 — 金额只在这里可见, 分享图上永不出现 (owner 09-06) */}
        {stats.moneySaved > 0 && (
          <div className="relative z-10 mt-4 border-t border-white/10 pt-3">
            <p className="text-xs text-[#b6cbbe]">
              {t('home.dailyGreenReclaimed', { hours: hoursLabel })}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-[#88a292]">
              <EyeOff className="h-3 w-3" aria-hidden="true" />
              {t('home.dailyGreenPrivateNote')}
            </p>
          </div>
        )}
      </section>

      <DailyReportShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        guardsCount={todayGuards > 0 ? todayGuards : stats.impulseInterventions}
        guardsIsToday={todayGuards > 0}
        freedomHours={freedom.hours}
        streakDays={stats.daysStreak}
      />
    </>
  );
}

// ============ 分享弹窗 (简版, 复用 loadHtmlToImage 管线) ============

type GenState = 'idle' | 'generating' | 'ready' | 'error';

interface DailyReportShareModalProps {
  open: boolean;
  onClose: () => void;
  /** 分享卡主角计数 — 今日 > 0 用今日数, 否则用累计数 (不出 0) */
  guardsCount: number;
  guardsIsToday: boolean;
  /** 累计找回换算的自由小时 — 分享卡只出小时, 永不出金额 */
  freedomHours: number;
  streakDays: number;
}

export function DailyReportShareModal({ open, onClose, guardsCount, guardsIsToday, freedomHours, streakDays }: DailyReportShareModalProps) {
  const { t, locale } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const [genState, setGenState] = useState<GenState>('idle');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const generatePng = useCallback(async () => {
    if (!cardRef.current) return;
    setGenState('generating');
    try {
      const { toPng } = await loadHtmlToImage();
      // skipFonts: 系统字体即可, 避免 CDN 字体内联的 CORS 失败 (同 ShareModal)
      const png = await toPng(cardRef.current, {
        pixelRatio: 2,
        skipFonts: true,
        backgroundColor: '#143527',
      });
      setDataUrl(png);
      setGenState('ready');
    } catch (err) {
      // safe to ignore: PNG 导出失败通过下方错误态 UI 呈现
      logger.warn('[DailyGreenReport] PNG generation failed:', err instanceof Error ? err.message : String(err));
      setGenState('error');
    }
  }, []);

  // 打开时预生成 PNG — 保住 Web Share 的 transient activation 手势链 (同 ShareModal)
  useEffect(() => {
    if (open) {
      setDataUrl(null);
      generatePng();
    }
  }, [open, generatePng]);

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

  const handleDownload = useCallback(async () => {
    if (!dataUrl) return;
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `symy-daily-green-report-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      // safe to ignore: 下载兜底失败非阻塞, 用户可重试分享
      logger.warn('[DailyGreenReport] download failed:', err instanceof Error ? err.message : String(err));
    }
  }, [dataUrl]);

  const handleShare = useCallback(async () => {
    if (!dataUrl || sharing) return;
    setSharing(true);
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const file = new File([blob], 'symy-daily-green-report.png', { type: 'image/png' });
      // owner 09-06 rule: share text = face only (守护次数 + 赢回小时). Never money.
      const hours = formatShareHoursLabel(freedomHours, locale) || formatFreedomHours(freedomHours);
      const shareText = guardsCount > 0
        ? t('share.dailyReport.shareText', { count: guardsCount, hours, defaultValue: `I held the green gate ${guardsCount} times today — won back ${hours} in total. With Symy: buy less, live more.` })
        : t('share.dailyReport.shareTextNoCount', { hours, defaultValue: `Won back ${hours} so far. With Symy: buy less, live more.` });
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Symy', text: shareText });
      } else {
        await handleDownload();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // safe to ignore: 分享失败走下载兜底, 生成失败已有错误态 UI
      logger.warn('[DailyGreenReport] share failed:', err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  }, [dataUrl, sharing, handleDownload, t, locale, guardsCount, freedomHours]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-glass-border bg-surface-1 animate-in slide-in-from-bottom duration-300 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="daily-green-share-modal"
      >
        <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-4 pb-2">
          <h2 className="text-base font-bold text-text-primary">
            {t('share.dailyReport.modalTitle', { defaultValue: 'Share your green report' })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="p-1 rounded-lg hover:bg-glass-hover text-text-secondary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar px-4 pb-3">
          {/* zoom 参与布局: 包装盒随缩放收缩, 卡底不再露出面板色白条 (scale 只缩视觉, 留布局幻影) */}
          <div className="mx-auto w-fit [zoom:0.92] sm:[zoom:1]">
            <DailyReportShareCard
              cardRef={cardRef}
              guardsCount={guardsCount}
              guardsIsToday={guardsIsToday}
              freedomHours={freedomHours}
              streakDays={streakDays}
              locale={locale}
            />
          </div>
          {genState === 'error' && (
            <div className="mt-3 text-center">
              <p className="text-[11px] text-red-400">
                {t('share.dailyReport.generateFailed', { defaultValue: "Couldn't create the image. Check your connection and retry." })}
              </p>
              <button
                onClick={generatePng}
                className="mt-2 px-4 py-1.5 rounded-xl bg-glass-fill border border-glass-border text-xs font-medium text-text-primary hover:border-emerald-400/40 transition-colors cursor-pointer"
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </button>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex gap-2 px-4 pb-5 pt-2">
          <button
            onClick={handleShare}
            disabled={genState !== 'ready' || sharing}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-[#0c2017] text-sm font-bold hover:from-emerald-400 hover:to-green-400 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            {genState === 'generating'
              ? t('share.dailyReport.generating', { defaultValue: 'Creating your report…' })
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

// ============ 分享卡 (375x480, 面子 only — 无任何金额字段进入此组件) ============

/** 叶子纹理 — 内联 SVG (装饰, 无外部资源, html-to-image 无 CORS 风险) */
function ShareCardDecor() {
  const leaves = [
    { x: -12, y: 24, size: 110, rotate: -30, opacity: 0.08 },
    { x: 285, y: 90, size: 80, rotate: 140, opacity: 0.06 },
    { x: 30, y: 300, size: 70, rotate: 75, opacity: 0.05 },
    { x: 270, y: 380, size: 95, rotate: -110, opacity: 0.06 },
  ];
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 375 480"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.rotate}) scale(${l.size / 48})`} opacity={l.opacity}>
          <path d="M0 48 C 0 20, 20 0, 48 0 C 48 28, 28 48, 0 48 Z" fill="#4ade80" />
        </g>
      ))}
    </svg>
  );
}

interface DailyReportShareCardProps {
  guardsCount: number;
  guardsIsToday: boolean;
  freedomHours: number;
  streakDays: number;
  locale: string;
  cardRef?: React.Ref<HTMLDivElement>;
}

export function DailyReportShareCard({ guardsCount, guardsIsToday, freedomHours, streakDays, locale, cardRef }: DailyReportShareCardProps) {
  const { t } = useI18n();

  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  // 面子主角 1: 守护次数 (今日 > 0 用今日, 否则累计; 0 不出现)
  const guardsPhrase = t(
    guardsIsToday ? 'share.dailyReport.guardsToday' : 'share.dailyReport.guardsTotal',
    { count: guardsCount, defaultValue: `${guardsCount} green guards` }
  );

  // 面子主角 2: 赢回的自由小时 (亚小时出分钟, 与 app 内取整同向 — 与 intercept-card 同规则)
  const hours = formatShareHoursLabel(freedomHours, locale);
  const hoursPhrase = hours
    ? t('share.dailyReport.hoursWonBack', { hours, defaultValue: `${hours} won back` })
    : t('share.dailyReport.aGreenChoice', { defaultValue: 'a green choice' });

  return (
    <div
      ref={cardRef}
      data-testid="daily-green-share-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 480, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      <div
        className="absolute -top-20 left-1/2 h-[240px] w-[360px] -translate-x-1/2 rounded-full blur-[80px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
        aria-hidden="true"
      />
      <ShareCardDecor />

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 日报标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Leaf className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.dailyReport.pill', { defaultValue: 'Daily Green Report' })}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {/* 中部 — 守护次数 + 自由小时 (里子金额永不进卡) */}
        <div className="flex flex-1 flex-col justify-center">
          {guardsCount > 0 && (
            <>
              <p className="text-[13px] uppercase tracking-[0.2em] text-[#88a292]">
                {guardsIsToday
                  ? t('share.dailyReport.guardsTodayLabel', { defaultValue: 'Guards today' })
                  : t('share.dailyReport.guardsTotalLabel', { defaultValue: 'Guards in total' })}
              </p>
              <p className="mt-2 text-[44px] font-black leading-none tracking-tight text-[#f0faf2]">
                {guardsPhrase}
              </p>
            </>
          )}
          <p className={`text-[13px] uppercase tracking-[0.2em] text-[#88a292] ${guardsCount > 0 ? 'mt-6' : 'mt-1'}`}>
            {t('share.interceptMedal.wonBackLabel', { defaultValue: 'You won back' })}
          </p>
          <p className={`mt-2 font-black tracking-tight text-[#f0faf2] ${guardsCount > 0 ? 'text-3xl' : 'text-[40px]'}`}>
            {hoursPhrase}
          </p>

          {streakDays > 0 && (
            <div className="mt-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-300/25 px-3 py-1 text-[11px] font-medium text-amber-200">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {t('share.dailyReport.streak', { days: streakDays, defaultValue: `${streakDays}-day green streak` })}
              </span>
            </div>
          )}
        </div>

        {/* 底部品牌条 */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline', { defaultValue: 'Become a guardian with me' })}
          </span>
        </div>
      </div>
    </div>
  );
}
