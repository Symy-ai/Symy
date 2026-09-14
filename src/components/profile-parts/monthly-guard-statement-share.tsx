'use client';

/**
 * MonthlyGuardStatementShareFace — 月度守护账单分享卡面 (batch54-b)
 *
 * 面子/里子铁律: 本组件只接收次数/小时/天数 + 小象月度寄语档位,
 * 结构上拿不到金额 — 分享导出图零金额由类型保证
 * (MonthlyStatementShareData 无 amount 字段, 对齐 impulse-trigger-share)。
 * "我这个月为自己守住了 37 小时"是可晒的月度收官宣言。构图与色板
 * 沿用 weekly-review-share / impulse-trigger-share 深绿系; 装饰全内联 SVG。
 */

import type { Ref } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { MonthlyStatementTone } from '@/lib/monthly-guard-statement';

/** 分享面数据 — 面子字段 only, 永不含金额 */
export interface MonthlyStatementShareData {
  /** 月份标签 (调用方用 i18n 渲染好的字符串, 如 '2026年9月') */
  monthLabel: string;
  /** 拦截局数 */
  interceptCount: number;
  /** 守护自由小时 (已格式化, 如 '37 小时' — 只有小时, 无金额) */
  hoursLabel: string;
  /** 最长连胜天数 */
  longestStreakDays: number;
  /** 小象月度寄语档位 (丰收/平稳/起步) */
  tone: MonthlyStatementTone;
}

export interface MonthlyGuardStatementShareFaceProps {
  data: MonthlyStatementShareData;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

export function MonthlyGuardStatementShareFace({ data, cardRef }: MonthlyGuardStatementShareFaceProps) {
  const { t } = useI18n();

  return (
    <div
      ref={cardRef}
      data-testid="monthly-statement-share-face"
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
        {/* 顶栏 — 月度账单标 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <CalendarCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('profile.monthlyStatement.share.pill')}
            </span>
          </div>
          <span className="text-[11px] tracking-wide text-[#88a292]">{data.monthLabel}</span>
        </div>

        {/* 中部 — 守住的自由小时 (主角: 月度收官宣言, 可晒) */}
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[12px] tracking-wide text-[#88a292]">
            {t('profile.monthlyStatement.share.hoursLabel')}
          </p>
          <p className="mt-2 text-[34px] font-black leading-tight tracking-tight text-[#f0faf2]">
            {data.hoursLabel}
          </p>

          {/* 次数/天数面板 — 面子字段 only */}
          <div className="mt-8 flex items-center gap-3" data-testid="monthly-statement-share-stats">
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{data.interceptCount}</div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('profile.monthlyStatement.share.countLabel')}
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">{data.longestStreakDays}</div>
              <div className="mt-1.5 text-[11px] tracking-wide text-[#88a292]">
                {t('profile.monthlyStatement.share.streakLabel')}
              </div>
            </div>
          </div>

          {/* 小象月度寄语 — 三档全温暖向 */}
          <p className="mt-6 text-[13px] leading-6 text-[#b6cbbe]" data-testid="monthly-statement-share-elephant">
            🐘 {t(`profile.monthlyStatement.share.tone.${data.tone}`)}
          </p>
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
