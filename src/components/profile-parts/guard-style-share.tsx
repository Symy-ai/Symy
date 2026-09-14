'use client';

/**
 * GuardStyleShareFace — 守护风格画像分享卡面 (batch56-c)
 *
 * 面子/里子铁律: 本组件只接收风格名/判词/三轨次数, 结构上拿不到金额 —
 * 分享导出图零金额由类型保证 (GuardStyleShareData 无 amount 字段)。
 * "我是替代派/冷静派/复用派"是身份故事 (绿色人格测试既视感), 天然可晒。
 * 构图与色板沿用 impulse-trigger-share 深绿系; 装饰全内联 SVG。
 */

import type { Ref } from 'react';
import { Palette } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { GuardStyleId } from '@/lib/guard-style-profile';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface GuardStyleShareData {
  styleId: GuardStyleId;
  /** 调用方用 i18n 渲染好的风格名 */
  styleName: string;
  /** 调用方用 i18n 渲染好的 amount-free 判词 */
  verdict: string;
  trackCounts: { guard: number; alt: number; reuse: number };
}

export interface GuardStyleShareFaceProps {
  data: GuardStyleShareData;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

export function GuardStyleShareFace({ data, cardRef }: GuardStyleShareFaceProps) {
  const { t } = useI18n();
  const tracks = [
    { key: 'guard' as const, count: data.trackCounts.guard },
    { key: 'alt' as const, count: data.trackCounts.alt },
    { key: 'reuse' as const, count: data.trackCounts.reuse },
  ];

  return (
    <div
      ref={cardRef}
      data-testid="guard-style-share-face"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 顶部柔光 + 弧线纹样 (与 impulse-trigger-share 同色板) */}
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
            <Palette className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('profile.guardStyle.share.pill')}
            </span>
          </div>
        </div>

        {/* 中部 — 风格名 (主角: 身份故事, 可晒) */}
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[12px] tracking-wide text-[#88a292]">
            {t('profile.guardStyle.share.styleLabel')}
          </p>
          <p className="mt-2 text-[26px] font-black leading-snug tracking-tight text-[#f0faf2]">
            {data.styleName}
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#b6cbbe]" data-testid="guard-style-share-verdict">
            {data.verdict}
          </p>

          {/* 三轨次数面板 — 面子字段 only (纯计数) */}
          <div className="mt-8 flex items-center gap-3" data-testid="guard-style-share-stats">
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
