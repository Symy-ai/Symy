'use client';

/**
 * BadgeCard — 绿色勋章晒卡 (模板 C, batch4-a)
 *
 * 勋章库扩容后 (batch3-c, 14 枚绑真实行为) 的第四款分享模板: 勋章视觉居中做主视觉,
 * 文案区给称号 + 一句温度话 (elephant-tone, 不说教)。视觉延续松绿 #143527 语言。
 *
 * 面子/里子铁律: 卡上只出 拦截次数/连续天数/基金数/赢回小时 (progressType 面子字段),
 * 金额永不进卡 — total_saves 型勋章的进度 (¥ 数) 换算成赢回小时呈现, 类型层面就杜绝。
 *
 * 荣誉非羞耻: 只渲染已解锁勋章; AI 授予型 (big_truth/clear_mind_streak) 无后端计数,
 * 不出数字 chip, 温度话照出 — 没有数字也有荣誉。
 * 装饰全内联 SVG, html-to-image 导出无 CORS 风险; stories 375x600。
 */

import type { Ref } from 'react';
import { Award } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { BadgeDef, BadgeGroup } from '@/components/buddy/constants';
import { formatShareHoursLabel } from './card-templates';

export interface BadgeCardProps {
  /** 勋章定义 (buddy/constants 只读引用, 不改动 BadgeDef) */
  badge: BadgeDef;
  /** progressType 对应进度快照 (解锁时刻: 守护次数/天数/基金数; AI 授予型 = 0) */
  progressValue: number;
  /** 赢回的时间 (小时) — 面子英雄数字 (金额永不进卡) */
  savedHours?: number;
  userName?: string;
  /** 解锁时刻 ISO (缺省 = 当前时间) */
  date?: string;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

type TFn = (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => string;

/** 分组温度话兜底 — i18n 缺失时用 (elephant-tone, 不说教) */
const WARM_FALLBACK: Record<BadgeGroup, string> = {
  guardian: 'Quietly guarded, one choice at a time.',
  growth: 'Small keepings, slowly growing into something real.',
  milestone: 'A moment seen clearly — and let pass.',
};

/**
 * 勋章显示名 — 复用 buddy.badgeNames.* 既有 key (零新 key, 不留死 key);
 * 未知 id 兜底人类可读名 (与 BadgeChip 同规则)。
 */
export function getBadgeDisplayName(badgeId: string, t: TFn): string {
  const key = `buddy.badgeNames.${badgeId}`;
  const label = t(key);
  if (label && label !== key) return label;
  return badgeId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * progressType → 面子统计 chip 文案。
 * total_saves 进度是金额 (¥) — 分享图禁钱数, 换算赢回小时由英雄数字承担, 不出 chip;
 * big_truth/clear_mind_streak 为 AI 授予型, 无后端计数, 不出数字 (荣誉不靠数字撑)。
 * batch106-b: won_back_hours (Money Forest) 与 dream_fund_completed (Dream Gardener)
 * 的进度本体就是面子数字 (小时/完成数), 照常出 chip。
 */
function getBadgeStatChip(badge: BadgeDef, progressValue: number, t: TFn): string | null {
  const v = Number.isFinite(progressValue) ? Math.max(0, Math.floor(progressValue)) : 0;
  if (v <= 0) return null;
  switch (badge.progressType) {
    case 'challenge_wins':
      return t('share.badgeCard.statGuards', { count: v, defaultValue: `${v} guards won` });
    case 'streak_days':
      return t('share.badgeCard.statDays', { days: v, defaultValue: `${v} days in a row` });
    case 'dream_fund_count':
      return t('share.badgeCard.statDreams', { count: v, defaultValue: `${v} dreams growing` });
    case 'dream_fund_funded':
      return t('share.badgeCard.statDreamsFunded', { count: v, defaultValue: `${v} dreams funded` });
    case 'won_back_hours':
      return t('share.badgeCard.statHours', { hours: v });
    case 'dream_fund_completed':
      return t('share.badgeCard.statDreamsCompleted', { count: v });
    default:
      return null;
  }
}

/** 荣誉光辉 — 从勋章中心放射的柔光射线 (区别于 streak 藤蔓 / milestone 进度环) */
function HaloRays() {
  const cx = 187;
  const cy = 252;
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 375 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const spread = 0.05;
        const len = 480;
        const x1 = cx + Math.cos(angle - spread) * len;
        const y1 = cy + Math.sin(angle - spread) * len;
        const x2 = cx + Math.cos(angle + spread) * len;
        const y2 = cy + Math.sin(angle + spread) * len;
        return (
          <path
            key={i}
            d={`M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z`}
            fill="#4ade80"
            opacity={i % 2 === 0 ? 0.055 : 0.03}
          />
        );
      })}
    </svg>
  );
}

/** 勋章主视觉 — 刻度环 + 主环 + 内环围住大号 emoji (BadgeDef 唯一视觉资产, 只读引用) */
function MedalEmblem({ emoji }: { emoji: string }) {
  return (
    <div className="relative h-[204px] w-[204px]">
      <div
        className="absolute left-1/2 top-1/2 h-[168px] w-[168px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[42px]"
        style={{ background: 'rgba(74, 222, 128, 0.22)' }}
      />
      <svg viewBox="0 0 204 204" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* 外圈刻度 — 24 刻度全亮 (已解锁 = 满荣誉, 无进度残缺感) */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = ((i * 15 - 90) * Math.PI) / 180;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          return (
            <line
              key={i}
              x1={102 + c * 98}
              y1={102 + s * 98}
              x2={102 + c * 92}
              y2={102 + s * 92}
              stroke="#4ade80"
              strokeWidth="2"
              strokeLinecap="round"
              opacity={i % 2 === 0 ? 0.55 : 0.22}
            />
          );
        })}
        {/* 勋章主环 + 内环 */}
        <circle cx="102" cy="102" r="82" fill="rgba(255,255,255,0.04)" stroke="#4ade80" strokeWidth="3.5" opacity="0.85" />
        <circle cx="102" cy="102" r="62" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span role="img" aria-hidden="true" className="select-none text-[76px] leading-none">
          {emoji}
        </span>
      </div>
    </div>
  );
}

export function BadgeCard({ badge, progressValue, savedHours, userName, date, cardRef }: BadgeCardProps) {
  const { t, locale } = useI18n();
  const name = getBadgeDisplayName(badge.id, t);
  const warmLine = t(`share.badgeCard.warm.${badge.group}`, {
    defaultValue: WARM_FALLBACK[badge.group],
  });
  const statChip = getBadgeStatChip(badge, progressValue, t);

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
      data-testid="badge-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 装饰层 — 顶部柔光 + 荣誉光辉射线 */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
      />
      <HaloRays />

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 绿色荣誉标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Award className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.badgeCard.pill', { defaultValue: 'Green Honor' })}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {userName && <p className="mt-4 text-center text-[13px] text-[#b6cbbe]">{userName}</p>}

        {/* 中部 — 勋章主视觉 + 称号 + 温度话 + 面子统计 chip */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <MedalEmblem emoji={badge.emoji} />
          <p className="mt-6 text-[24px] font-black leading-tight text-[#f0faf2]">{name}</p>
          <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[#88a292]">{warmLine}</p>
          {statChip && (
            <span className="mt-5 inline-flex items-center rounded-full border border-emerald-300/25 bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-200">
              {statChip}
            </span>
          )}
        </div>

        {/* 赢回小时 — 家族英雄数字 (金额永不进卡) */}
        <div className="border-t border-white/10 pt-5 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#88a292]">
            {t('share.interceptMedal.wonBackLabel', { defaultValue: 'You won back' })}
          </p>
          <p className="mt-1.5 text-[30px] font-black leading-none tracking-tight text-[#f0faf2]">
            {heroPhrase}
          </p>
        </div>

        {/* 底部品牌条 */}
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline', { defaultValue: 'Buy less. Live more.' })}
          </span>
        </div>
      </div>
    </div>
  );
}
