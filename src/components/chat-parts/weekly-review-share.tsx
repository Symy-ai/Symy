'use client';

/**
 * WeeklyReviewShareFace — 周复盘分享卡面 (batch52-b)
 *
 * 面子/里子铁律: 本组件只接收周起始日期/次数/小时/所选时刻文案, 结构上拿不到
 * 金额 — 分享导出图零金额由类型保证 (WeeklyReviewShareData 无 amount 字段)。
 * 构图与色板沿用 guard-diary-share 深绿系; 装饰全内联 SVG。
 */

import type { Ref } from 'react';
import { Award } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatDiaryHours } from '@/lib/guard-diary';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface WeeklyReviewShareData {
  /** 本周周一日期 (YYYY-MM-DD) */
  weekKey: string;
  guardCount: number;
  hoursReclaimed: number;
  /** 用户自选的本周最骄傲守护时刻文案 (空串不出该面板) */
  momentLabel: string;
}

export interface WeeklyReviewShareFaceProps {
  data: WeeklyReviewShareData;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

export function WeeklyReviewShareFace({ data, cardRef }: WeeklyReviewShareFaceProps) {
  const { t, locale } = useI18n();

  const parsedWeek = new Date(data.weekKey + 'T12:00:00');
  const weekLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    day: 'numeric',
  }).format(isNaN(parsedWeek.getTime()) ? new Date() : parsedWeek);

  return (
    <div
      ref={cardRef}
      data-testid="weekly-review-share-face"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 顶部柔光 + 弧线纹样 (与 guard-diary-share 同色板) */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 375 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path
          d="M330 620 C 300 500, 360 440, 320 340 C 285 250, 340 180, 300 80 C 288 40, 305 8, 296 -30"
          stroke="#4ade80"
          strokeWidth="3"
          fill="none"
          opacity="0.13"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 周复盘标 + 周起始日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Award className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('chat.weeklyReview.share.pill')}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{weekLabel}</span>
        </div>

        {/* 中部 — 用户自选时刻 (主角: 自我认同, 可晒) */}
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[12px] tracking-wide text-[#88a292]">
            {t('chat.weeklyReview.share.momentLabel')}
          </p>
          <p className={`mt-2 font-black leading-snug tracking-tight text-[#f0faf2] ${locale === 'zh' ? 'text-[26px]' : 'text-[24px]'}`}>
            {data.momentLabel || t('chat.weeklyReview.share.momentFallback')}
          </p>

          {/* 次数/小时面板 — 面子字段 only */}
          <div className="mt-8 flex items-center gap-3" data-testid="weekly-review-share-stats">
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{data.guardCount}</div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('chat.weeklyReview.share.guardLabel')}
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">
                {formatDiaryHours(data.hoursReclaimed)}
              </div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('chat.weeklyReview.share.hoursLabel')}
              </div>
            </div>
          </div>
        </div>

        {/* 底部品牌条 */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline')}
          </span>
        </div>
      </div>
    </div>
  );
}
