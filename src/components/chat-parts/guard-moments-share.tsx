'use client';

/**
 * GuardMomentsShareFace — 守护时刻时间线分享卡面 (batch58-a)
 *
 * 面子/里子铁律: 本组件只接收次数/天数, 结构上拿不到金额 —
 * 分享导出图零金额由类型保证 (GuardMomentsShareData 无 amount 字段,
 * 复用 55-c / 56-c GuardStyleCard 分享面先例)。
 * "我和小象一起走过的 N 个时刻"是身份故事, 天然可晒。
 * 构图与色板沿用 guard-style-share 深绿系; 装饰全内联 SVG。
 */

import type { Ref } from 'react';
import { Milestone } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface GuardMomentsShareData {
  trackCounts: { guard: number; alt: number; reuse: number };
  totalMoments: number;
  activeDays: number;
}

export interface GuardMomentsShareFaceProps {
  data: GuardMomentsShareData;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

export function GuardMomentsShareFace({ data, cardRef }: GuardMomentsShareFaceProps) {
  const { t } = useI18n();
  const tracks = [
    { key: 'guard' as const, count: data.trackCounts.guard },
    { key: 'alt' as const, count: data.trackCounts.alt },
    { key: 'reuse' as const, count: data.trackCounts.reuse },
  ];

  return (
    <div
      ref={cardRef}
      data-testid="guard-moments-share-face"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 顶部柔光 + 弧线纹样 (与 guard-style-share 同色板) */}
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
        {/* 顶栏 — 时刻流标 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Milestone className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('chat.guardMoments.share.pill')}
            </span>
          </div>
        </div>

        {/* 中部 — 时刻总数 (主角: 身份故事, 可晒) */}
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[12px] tracking-wide text-[#88a292]">
            {t('chat.guardMoments.share.headline', { count: data.totalMoments, days: data.activeDays })}
          </p>
          <p className="mt-2 text-[26px] font-black leading-snug tracking-tight text-[#f0faf2]">
            {data.totalMoments}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#b6cbbe]" data-testid="guard-moments-share-sub">
            {t('chat.guardMoments.share.subline')}
          </p>

          {/* 三类次数面板 — 面子字段 only (纯计数) */}
          <div className="mt-8 flex items-center gap-3" data-testid="guard-moments-share-stats">
            {tracks.map((track) => (
              <div key={track.key} className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{track.count}</div>
                <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                  {t(`profile.guardStyle.trackName.${track.key}`)}
                </div>
              </div>
            ))}
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
