'use client';

/**
 * GuardDiaryShareFace — 守护日记分享卡面 (batch47-b)
 *
 * 面子/里子铁律: 本组件只接收次数/小时/天数/日记文案, 结构上拿不到金额 —
 * 分享导出图零金额由类型保证 (GuardDiaryShareData 无 estSaved 字段)。
 * 构图与色板沿用 streak-card 深绿系; 装饰全内联 SVG, html-to-image 无 CORS 风险。
 */

import type { Ref } from 'react';
import { NotebookPen } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatFreedomTime } from '@/lib/freedom-time';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface GuardDiaryShareData {
  date: string;
  text: string;
  guardCount: number;
  hoursReclaimed: number;
  /** 连续守护天数 (0 = 不显示天数面板) */
  streakDays: number;
}

export interface GuardDiaryShareFaceProps {
  data: GuardDiaryShareData;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

export function GuardDiaryShareFace({ data, cardRef }: GuardDiaryShareFaceProps) {
  const { t, locale } = useI18n();

  const parsedDate = new Date(data.date + 'T12:00:00');
  const dateLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(isNaN(parsedDate.getTime()) ? new Date() : parsedDate);

  return (
    <div
      ref={cardRef}
      data-testid="guard-diary-share-face"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 顶部柔光 + 星点纹样 */}
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
        {/* 顶栏 — 守护日记标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <NotebookPen className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('chat.guardDiary.sharePill')}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {/* 中部 — 日记一句 (主角) */}
        <div className="flex flex-1 flex-col justify-center">
          <p className={`font-black leading-snug tracking-tight text-[#f0faf2] ${locale === 'zh' ? 'text-[26px]' : 'text-[24px]'}`}>
            {data.text}
          </p>

          {/* 次数/小时面板 — 面子字段 only */}
          <div className="mt-8 flex items-center gap-3" data-testid="guard-diary-share-stats">
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{data.guardCount}</div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('share.dailyReport.guardsTodayLabel')}
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">
                {formatFreedomTime(data.hoursReclaimed, locale)}
              </div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('share.dailyReport.hoursWonBack', { hours: formatFreedomTime(data.hoursReclaimed, locale) })}
              </div>
            </div>
          </div>

          {/* 连续天数 — 0 不出失败态 (非羞辱) */}
          {data.streakDays > 0 && (
            <div className="mt-3 w-fit rounded-full border border-emerald-300/25 bg-white/5 px-4 py-1.5" data-testid="guard-diary-share-streak">
              <span className="text-[12px] font-semibold text-emerald-200">
                {t('share.streakCard.daysLabel')} · {data.streakDays}{' '}
                {t('chat.guardDiary.shareDaysUnit')}
              </span>
            </div>
          )}
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
