'use client';

/**
 * MilestoneCard — 守护里程碑分享卡 (模板 B, batch2-b)
 *
 * 构图突出「第 N 次守护」: 中央里程碑圆环 (12 刻度 + 进度弧),
 * 拦截次数达到 10/50/100 解锁庆祝态; 未达解锁 = 「即将解锁 N/10」期待态 (非羞耻)。
 * 次数从现有 challenge stats (totalPassed) 推导 — 零 DDL。
 *
 * 面子/里子铁律: 卡上只出小时/次数/天数, 金额永不进卡; 赢回的小时数仍是英雄数字之一。
 * 装饰全内联 SVG, html-to-image 导出无 CORS 风险; stories 375x600。
 */

import type { Ref } from 'react';
import { Trophy } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatShareHoursLabel, getMilestoneState } from './card-templates';

export interface MilestoneCardProps {
  /** 赢回的时间 (小时) — 分享卡主角, 面子 */
  savedHours?: number;
  /** 累计拦截次数 (challenge stats totalPassed) */
  interceptCount: number;
  userName?: string;
  /** 拦截时刻 ISO (缺省 = 当前时间) */
  date?: string;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

/** 里程碑圆环 — 12 刻度 + 进度弧 (进度 = count/next, 封顶 1) */
function MilestoneRing({ progress, unlocked }: { progress: number; unlocked: boolean }) {
  const R = 78;
  const C = 2 * Math.PI * R;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {/* 刻度 — 解锁态全亮; 期待态按进度点亮 (期待感, 非失败灰) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = ((i * 30 - 90) * Math.PI) / 180;
        const x1 = 90 + Math.cos(angle) * 88;
        const y1 = 90 + Math.sin(angle) * 88;
        const x2 = 90 + Math.cos(angle) * 82;
        const y2 = 90 + Math.sin(angle) * 82;
        const lit = unlocked || i / 12 < clamped;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#4ade80"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity={lit ? 0.7 : 0.18}
          />
        );
      })}
      <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle
        cx="90"
        cy="90"
        r={R}
        fill="none"
        stroke="#4ade80"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${clamped * C} ${C}`}
        transform="rotate(-90 90 90)"
        opacity="0.85"
      />
    </svg>
  );
}

export function MilestoneCard({ savedHours, interceptCount, userName, date, cardRef }: MilestoneCardProps) {
  const { t, locale } = useI18n();
  const milestone = getMilestoneState(interceptCount);
  const { count, unlocked, next, remaining } = milestone;

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

  // 进度弧: 朝下一阈值推进; 全部达成 → 满环
  const ringProgress = next ? Math.min(count / next, 1) : 1;

  return (
    <div
      ref={cardRef}
      data-testid="milestone-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 装饰层 — 顶部柔光 (+ 解锁态环心辉光) */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
      />

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 里程碑标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Trophy className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.milestoneCard.pill', { defaultValue: 'Guard Milestone' })}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {userName && <p className="mt-5 text-[13px] text-[#b6cbbe]">{userName}</p>}

        {/* 中部 — 里程碑圆环构图 (突出第 N 次守护) */}
        <div className="flex flex-1 flex-col justify-center">
          {!unlocked && (
            <p className="mb-3 text-center text-[12px] font-semibold uppercase tracking-[0.2em] text-[#a7f3d0]">
              {t('share.milestoneCard.lockedEyebrow', { defaultValue: 'Almost there' })}
            </p>
          )}

          <div className="relative mx-auto h-[184px] w-[184px]">
            {unlocked && (
              <div
                className="absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[38px]"
                style={{ background: 'rgba(74, 222, 128, 0.22)' }}
              />
            )}
            <MilestoneRing progress={ringProgress} unlocked={unlocked} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[56px] font-black leading-none tracking-tight text-[#f0faf2]">{count}</p>
              <p className="mt-1.5 text-[13px] font-semibold text-[#a7f3d0]">
                {next ? `${count}/${next}` : t('share.milestoneCard.allReachedLabel', { defaultValue: 'All milestones reached' })}
              </p>
            </div>
          </div>

          {/* 环下文案 — 解锁: 第 N 次守护; 期待: 还差几次 (期待感) */}
          <p className="mt-4 text-center text-[17px] font-bold text-[#f0faf2]">
            {t('share.milestoneCard.guardLabel', { count, defaultValue: `Guard #${count}` })}
          </p>
          <p className="mt-1.5 text-center text-[12px] text-[#88a292]">
            {next
              ? t('share.milestoneCard.unlockHint', { remaining, defaultValue: `${remaining} more guards to unlock` })
              : t('share.milestoneCard.legendLabel', { defaultValue: 'Guard legend' })}
          </p>

          {/* 赢回小时 — 英雄数字之二 (金额永不进卡) */}
          <div className="mt-7 border-t border-white/10 pt-5 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#88a292]">
              {t('share.interceptMedal.wonBackLabel', { defaultValue: 'You won back' })}
            </p>
            <p className="mt-1.5 text-[32px] font-black leading-none tracking-tight text-[#f0faf2]">
              {heroPhrase}
            </p>
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
