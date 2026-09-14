'use client';

/**
 * StreakCard — 连续守护分享卡 (模板 A, batch2-b)
 *
 * 与拦截卡可区分的构图: 主藤蔓叶脉连续纹样 (沿右侧蜿蜒向上, 节点生叶 — 连续感),
 * 大号「连续守护 N 天」计数面板; 赢回的小时数仍是英雄数字 (面子/里子铁律)。
 *
 * 非羞耻: streak=0 不出「0 天」失败态 — 换成新芽鼓励态「连续守护, 从今天开始」。
 * 装饰全内联 SVG, html-to-image 导出无 CORS 风险; stories 375x600。
 */

import type { Ref } from 'react';
import { Flame, Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatShareHoursLabel } from './card-templates';

export interface StreakCardProps {
  /** 赢回的时间 (小时) — 分享卡主角, 面子 */
  savedHours?: number;
  /** 连续守护天数 (0 = 鼓励态, 不出 0) */
  streakDays?: number;
  userName?: string;
  /** 拦截时刻 ISO (缺省 = 当前时间) */
  date?: string;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
  /** Honor-only rank snapshot; absent for existing callers */
  guardRank?: { name: string; level: number; emoji: string };
}

/** 叶脉连续纹样 — 一条主藤从底部蜿蜒向上, 沿藤节点生叶 (区别于拦截卡的散布叶) */
function VineMotif() {
  const leaves = [
    { x: 318, y: 520, rotate: -40 },
    { x: 342, y: 430, rotate: 150 },
    { x: 316, y: 350, rotate: -30 },
    { x: 340, y: 260, rotate: 160 },
    { x: 312, y: 170, rotate: -45 },
    { x: 330, y: 90, rotate: 155 },
  ];
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 375 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* 主藤 — 连续上升的曲线 */}
      <path
        d="M330 620 C 300 500, 360 440, 320 340 C 285 250, 340 180, 300 80 C 288 40, 305 8, 296 -30"
        stroke="#4ade80"
        strokeWidth="3"
        fill="none"
        opacity="0.13"
        strokeLinecap="round"
      />
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.rotate}) scale(0.9)`} opacity="0.12">
          <path d="M0 48 C 0 20, 20 0, 48 0 C 48 28, 28 48, 0 48 Z" fill="#4ade80" />
        </g>
      ))}
      {/* 左下短枝 — 平衡构图 */}
      <path
        d="M40 620 C 60 560, 30 520, 55 470"
        stroke="#4ade80"
        strokeWidth="2.5"
        fill="none"
        opacity="0.08"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StreakCard({ savedHours, streakDays, userName, date, cardRef, guardRank }: StreakCardProps) {
  const { t, locale } = useI18n();
  const days = Number.isFinite(streakDays) ? Math.max(0, Math.floor(streakDays as number)) : 0;
  const hasStreak = days > 0;

  const parsedDate = date ? new Date(date) : new Date();
  const safeDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(safeDate);

  // 面子主角: 赢回的时间 (金额永不进卡 — owner 09-06 铁律); 亚小时出分钟, 与 app 内取整同向
  const hoursLabel = formatShareHoursLabel(savedHours ?? 0, locale);
  const heroPhrase = hoursLabel
    ? t('share.dailyReport.hoursWonBack', { hours: hoursLabel, defaultValue: `${hoursLabel} won back` })
    : t('share.dailyReport.aGreenChoice', { defaultValue: 'a green choice' });

  return (
    <div
      ref={cardRef}
      data-testid="streak-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 装饰层 — 顶部柔光 + 叶脉连续纹样 */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
      />
      <VineMotif />

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 连续守护标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Flame className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.streakCard.pill', { defaultValue: 'Streak Medal' })}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {userName && <p className="mt-6 text-[13px] text-[#b6cbbe]">{userName}</p>}

        {guardRank && (
          <div className="mt-3 flex w-fit items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1" data-testid="streak-card-rank">
            <span className="text-[11px]" aria-hidden="true">{guardRank.emoji}</span>
            <span className="text-[11px] font-semibold text-emerald-200">{guardRank.name}</span>
            <span className="text-[10px] font-semibold text-emerald-300/80">L{guardRank.level}</span>
          </div>
        )}

        {/* 中部 — 赢回小时英雄数字 + 连续天数面板 */}
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[13px] uppercase tracking-[0.2em] text-[#88a292]">
            {t('share.interceptMedal.wonBackLabel', { defaultValue: 'You won back' })}
          </p>
          {/* zh CJK 更宽 — 降 8px 保证「赢回 N 小时」单行, 避免英雄行孤字换行 */}
          <p
            className={`mt-2 font-black leading-none tracking-tight text-[#f0faf2] ${
              locale === 'zh' ? 'text-[44px]' : 'text-[52px]'
            }`}
          >
            {heroPhrase}
          </p>

          {/* 连续守护面板 — hasStreak: 大号天数; 0: 新芽鼓励态 (非羞耻) */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            {hasStreak ? (
              <div>
                <div className="flex items-end gap-2">
                  <span className="text-[64px] font-black leading-none tracking-tight text-[#f0faf2]">{days}</span>
                  <span className="pb-2 text-lg font-bold text-[#a7f3d0]">
                    {t('share.streakCard.daysUnit', { defaultValue: 'days' })}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] tracking-wide text-[#88a292]">
                  {t('share.streakCard.daysLabel', { defaultValue: 'Consecutive guards' })}
                </p>
              </div>
            ) : (
              <div>
                <Sprout className="h-8 w-8 text-emerald-300" aria-hidden="true" />
                <p className="mt-3 text-2xl font-black leading-snug text-[#f0faf2]">
                  {t('share.streakCard.encourageTitle', { defaultValue: 'Your streak starts today' })}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#88a292]">
                  {t('share.streakCard.encourageSub', { defaultValue: 'Every guard grows a new leaf' })}
                </p>
              </div>
            )}
          </div>
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
