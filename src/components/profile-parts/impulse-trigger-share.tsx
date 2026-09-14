'use client';

/**
 * ImpulseTriggerShareFace — 冲动触发画像分享卡面 (batch52-c)
 *
 * 面子/里子铁律: 本组件只接收原因标签/次数/天数, 结构上拿不到金额 —
 * 分享导出图零金额由类型保证 (ImpulseTriggerShareData 无 amount 字段)。
 * "认识自己的消费冲动"是稀缺的自我认知内容, 天然可晒。构图与色板沿用
 * weekly-review-share 深绿系; 装饰全内联 SVG。
 */

import type { Ref } from 'react';
import { Compass } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface ImpulseTriggerShareData {
  /** Top 触发原因文案 (调用方用既有 interceptReason 词表渲染好的字符串) */
  topReasonLabel: string;
  /** 拦截次数 */
  interceptCount: number;
  /** 有拦截记录的天数 */
  activeDays: number;
}

export interface ImpulseTriggerShareFaceProps {
  data: ImpulseTriggerShareData;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

export function ImpulseTriggerShareFace({ data, cardRef }: ImpulseTriggerShareFaceProps) {
  const { t } = useI18n();

  return (
    <div
      ref={cardRef}
      data-testid="impulse-trigger-share-face"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 顶部柔光 + 弧线纹样 (与 weekly-review-share 同色板) */}
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
        {/* 顶栏 — 画像标 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Compass className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('profile.impulseTrigger.share.pill')}
            </span>
          </div>
        </div>

        {/* 中部 — Top 触发原因 (主角: 自我认知, 可晒) */}
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[12px] tracking-wide text-[#88a292]">
            {t('profile.impulseTrigger.share.reasonLabel')}
          </p>
          <p className="mt-2 text-[24px] font-black leading-snug tracking-tight text-[#f0faf2]">
            {data.topReasonLabel}
          </p>

          {/* 次数/天数面板 — 面子字段 only */}
          <div className="mt-8 flex items-center gap-3" data-testid="impulse-trigger-share-stats">
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{data.interceptCount}</div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('profile.impulseTrigger.share.countLabel')}
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{data.activeDays}</div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('profile.impulseTrigger.share.daysLabel')}
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
