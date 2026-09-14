'use client';

/**
 * InterceptCard — 拦截勋章分享卡 (传播引擎核心载体)
 *
 * 产品叙事 (绿色转向): 省钱 = 羞耻 → 绿色 = 荣誉。
 * 用户被 Symy 拦下来（没买冲动消费品）这件事 = 可晒的勋章。
 *
 * 视觉: 松柏绿 #143527 主题; stories 375x600 (默认) / square 375x375 两种比例。
 * 装饰全部内联 SVG (叶子纹理 + 大象剪影 — Symy 吉祥物), 无外部图片,
 * html-to-image 导出 PNG 时无 CORS 风险。
 */

import type { Ref } from 'react';
import { Flame, Leaf, Medal } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatShareHoursLabel } from './card-templates';

export interface InterceptCardProps {
  userName?: string;
  /** 赢回的时间 (小时) — 分享卡主角, 面子 */
  savedHours?: number;
  /** 省下的金额 (分) — 里子, 仅个人视图, 分享卡不展示 */
  savedCents?: number;
  /** 被拦下的商品名 (空串时隐藏商品 chip) */
  itemTitle: string;
  /** 选择了更绿的选择 (预留) */
  greenSaved?: boolean;
  /** 连续拦截天数 (0/undefined 时隐藏该行) */
  streakDays?: number;
  /** 拦截时刻 ISO (缺省 = 当前时间) */
  date?: string;
  /** stories: 375x600 (默认) | square: 375x375 */
  variant?: 'stories' | 'square';
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

/** 叶子纹理 — 散布的低透明度叶子剪影 (内联 SVG, 无外部资源) */
function LeafTexture() {
  const leaves = [
    { x: -14, y: 30, size: 120, rotate: -30, opacity: 0.09 },
    { x: 280, y: 70, size: 90, rotate: 140, opacity: 0.07 },
    { x: 40, y: 180, size: 64, rotate: 75, opacity: 0.06 },
    { x: 250, y: 300, size: 110, rotate: -110, opacity: 0.07 },
    { x: -20, y: 400, size: 84, rotate: 30, opacity: 0.05 },
    { x: 290, y: 470, size: 70, rotate: -60, opacity: 0.06 },
  ];
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 375 600"
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

/** 大象剪影 — Symy 吉祥物 (手绘几何组合, 装饰纹理用) */
function ElephantSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 195" fill="currentColor" aria-hidden="true" className={className}>
      {/* body */}
      <ellipse cx="155" cy="105" rx="82" ry="60" />
      {/* head */}
      <circle cx="72" cy="88" r="46" />
      {/* ear */}
      <ellipse cx="98" cy="80" rx="28" ry="34" />
      {/* trunk */}
      <path d="M36 108 C 26 136, 42 152, 32 178 C 30 186, 40 191, 46 185 C 58 172, 52 150, 64 132 C 72 120, 66 108, 50 104 Z" />
      {/* legs */}
      <rect x="104" y="140" width="26" height="50" rx="12" />
      <rect x="152" y="146" width="26" height="48" rx="12" />
      <rect x="198" y="140" width="24" height="46" rx="11" />
      {/* tail */}
      <path d="M234 88 C 248 98, 248 122, 238 140" stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function InterceptCard({
  userName,
  savedHours,
  itemTitle,
  greenSaved,
  streakDays,
  date,
  variant = 'stories',
  cardRef,
}: InterceptCardProps) {
  const { t, locale } = useI18n();
  const isSquare = variant === 'square';

  const parsedDate = date ? new Date(date) : new Date();
  const safeDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(safeDate);

  // 面子主角: 赢回的时间 (里子=金额, 仅个人视图用, 分享卡不展示 — owner 09-06 铁律)
  // 与 streak/milestone/badge/challenge 卡共用 share.dailyReport.hoursWonBack 口径;
  // 亚小时出分钟, 与 app 内 formatFreedomTime 取整同向 (同一笔拦截两面数字一致)
  const hoursLabel = formatShareHoursLabel(savedHours ?? 0, locale);
  const hoursPhrase = hoursLabel
    ? t('share.dailyReport.hoursWonBack', { hours: hoursLabel, defaultValue: `${hoursLabel} won back` })
    : t('share.dailyReport.aGreenChoice', { defaultValue: 'a green choice' });

  return (
    <div
      ref={cardRef}
      data-testid="intercept-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: isSquare ? 375 : 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 装饰层 — 顶部柔光 + 叶子纹理 + 大象剪影 */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
      />
      <LeafTexture />
      <ElephantSilhouette className="absolute -bottom-4 -right-6 w-[300px] rotate-[8deg] text-white opacity-[0.05]" />

      <div className={`relative z-10 flex h-full flex-col ${isSquare ? 'p-6' : 'p-7'}`}>
        {/* 顶栏 — 勋章标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Medal className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.interceptMedal.pill', { defaultValue: 'Intercept Medal' })}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {userName && (
          <p className={`text-[13px] text-[#b6cbbe] ${isSquare ? 'mt-3' : 'mt-6'}`}>{userName}</p>
        )}

        {/* 中部 — 商品 chip + 大字金额 + 荣誉文案 + 徽章行 */}
        <div className="flex flex-1 flex-col justify-center">
          {itemTitle && (
            <div className="mb-5 inline-flex max-w-full items-center self-start rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="truncate text-[12px] text-[#b6cbbe]">
                {t('share.interceptMedal.resistedChip', { item: itemTitle, defaultValue: `Resisted: ${itemTitle}` })}
              </span>
            </div>
          )}

          <p className="text-[13px] uppercase tracking-[0.2em] text-[#88a292]">
            {t('share.interceptMedal.wonBackLabel', { defaultValue: 'You won back' })}
          </p>
          <p
            className={`font-black tracking-tight text-[#f0faf2] ${
              isSquare
                ? locale === 'zh' ? 'text-4xl' : 'text-5xl'
                : locale === 'zh' ? 'text-[44px]' : 'text-[56px]'
            } leading-none mt-2`}
          >
            {hoursPhrase}
          </p>
          <p className={`text-[15px] font-medium leading-snug text-[#a7f3d0] ${isSquare ? 'mt-3' : 'mt-4'}`}>
            {t('share.interceptMedal.title', { defaultValue: 'You won this one — for you and the planet' })}
          </p>

          {(greenSaved || (streakDays !== undefined && streakDays > 0)) && (
            <div className={`flex flex-wrap items-center gap-2 ${isSquare ? 'mt-3' : 'mt-5'}`}>
              {greenSaved && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 border border-emerald-300/25 px-3 py-1 text-[11px] font-medium text-emerald-200">
                  <Leaf className="h-3 w-3" aria-hidden="true" />
                  {t('share.interceptMedal.greenSaved', { defaultValue: 'Chose the greener option' })}
                </span>
              )}
              {streakDays !== undefined && streakDays > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 border border-amber-300/25 px-3 py-1 text-[11px] font-medium text-amber-200">
                  <Flame className="h-3 w-3" aria-hidden="true" />
                  {t('share.interceptMedal.streak', { days: streakDays, defaultValue: `${streakDays}-day intercept streak` })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 底部品牌条 */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline', { defaultValue: 'Buy less. Live more.' })}
          </span>
        </div>
      </div>
    </div>
  );
}
