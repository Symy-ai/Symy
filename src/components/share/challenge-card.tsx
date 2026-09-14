'use client';

/**
 * ChallengeCard — 挑战达成晒卡 (模板 E, batch5-a)
 *
 * batch4-b 落地守护挑战库后, "挑战完成"是全 app 情绪浓度最高的时刻之一 —
 * 第五款分享模板: 绿门拱徽记居中做主视觉 (挑战 = 一次通过绿门的守护仪式),
 * 文案区给挑战名 + 完成称号 + 一句熊二式温度的达成祝贺 (elephant-tone, 不说教)。
 * 视觉延续松绿 #143527 语言。
 *
 * 面子/里子铁律: 卡上只出 连续天数/守护次数/赢回小时 (面子字段), 金额永不进卡 —
 * 挑战周期内留下的钱只喂 app 内私密提示行与赢回小时换算, 类型层面就杜绝。
 *
 * 荣誉非羞耻: 本卡只为已完成挑战渲染 (入口在 challenge-modal 完成态);
 * 快照为 0 的面子字段不出数字 chip (荣誉不靠数字撑, 与 badge 卡同规则)。
 * 装饰全内联 SVG, html-to-image 导出无 CORS 风险; stories 375x600。
 */

import type { Ref } from 'react';
import { Flag } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { GuardianChallenge } from '@/components/buddy/challenge-definitions';
import { BADGE_INFO } from '@/components/buddy/constants';
import { formatShareHoursLabel } from './card-templates';

export interface ChallengeCardProps {
  /** 挑战定义 — challenge 域 SSOT 只读引用 (禁改; 字段映射在 share 域内做) */
  challenge: GuardianChallenge;
  /** 完成时刻连续守护天数快照 (面子; 0 = 不出 chip) */
  streakDays?: number;
  /** 完成时刻累计守护次数快照 (面子; 0 = 不出 chip) */
  guardsWon?: number;
  /** 赢回的时间 (小时) — 面子英雄数字 (金额永不进卡) */
  savedHours?: number;
  userName?: string;
  /** 完成时刻 ISO (缺省 = 当前时间) */
  date?: string;
  /** 导出 PNG 用 — html-to-image 的目标节点 ref */
  cardRef?: Ref<HTMLDivElement>;
}

type TFn = (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => string;

/** 达成祝贺兜底 — i18n 缺失时用 (elephant-tone: 夸守护的人, 不说教) */
const WARM_FALLBACK = 'The gate held because you showed up. This little elephant is doing a happy trunk dance.';

/**
 * 挑战显示名 — 复用 buddy.challengeLib.challenges.<id>.title 既有 key (零新 key);
 * 未知 key 兜底人类可读名 (与 getBadgeDisplayName 同规则)。
 */
export function getChallengeDisplayName(challenge: GuardianChallenge, t: TFn): string {
  const label = t(challenge.titleKey);
  if (label && label !== challenge.titleKey) return label;
  return challenge.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 面子统计 chip — 与 badge 卡同一套口径 (share.badgeCard.stat* 复用, 不复制文案) */
function getChallengeStatChips(streakDays: number, guardsWon: number, t: TFn): string[] {
  const chips: string[] = [];
  const guards = Number.isFinite(guardsWon) ? Math.max(0, Math.floor(guardsWon)) : 0;
  const days = Number.isFinite(streakDays) ? Math.max(0, Math.floor(streakDays)) : 0;
  if (guards > 0) chips.push(t('share.badgeCard.statGuards', { count: guards, defaultValue: `${guards} guards won` }));
  if (days > 0) chips.push(t('share.badgeCard.statDays', { days, defaultValue: `${days} days in a row` }));
  return chips;
}

/** 绿门拱徽记 — 挑战徽记 (奖励勋章 emoji) 居中, 拱门 + 满刻度 + 基线 (完成 = 满荣誉, 无残缺感) */
function GateEmblem({ emoji }: { emoji: string }) {
  return (
    <div className="relative h-[176px] w-[176px]">
      <div
        className="absolute left-1/2 top-1/2 h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[38px]"
        style={{ background: 'rgba(74, 222, 128, 0.20)' }}
      />
      <svg viewBox="0 0 210 210" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* 绿门主拱 — 上半圆 + 门柱 (区别于勋章圆环 / streak 藤蔓) */}
        <path
          d="M35 190 L35 105 A70 70 0 0 1 175 105 L175 190"
          fill="rgba(255,255,255,0.04)"
          stroke="#4ade80"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.85"
        />
        {/* 内拱 */}
        <path
          d="M55 190 L55 110 A50 50 0 0 1 155 110 L155 190"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1.5"
        />
        {/* 拱顶刻度 — 9 刻度全亮 (已达成 = 满荣誉) */}
        {Array.from({ length: 9 }).map((_, i) => {
          const angle = ((190 + i * 20) * Math.PI) / 180;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          return (
            <line
              key={i}
              x1={105 + c * 76}
              y1={105 + s * 76}
              x2={105 + c * 83}
              y2={105 + s * 83}
              stroke="#4ade80"
              strokeWidth="2"
              strokeLinecap="round"
              opacity={i % 2 === 0 ? 0.55 : 0.22}
            />
          );
        })}
        {/* 门基线 + 两侧草叶 */}
        <line x1="27" y1="190" x2="183" y2="190" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
        <path d="M40 190 Q43 181 47 190" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M163 190 Q166 181 170 190" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </svg>
      <div className="absolute left-1/2 top-[95px] -translate-x-1/2 -translate-y-1/2">
        <span role="img" aria-hidden="true" className="select-none text-[60px] leading-none">
          {emoji}
        </span>
      </div>
    </div>
  );
}

export function ChallengeCard({ challenge, streakDays = 0, guardsWon = 0, savedHours, userName, date, cardRef }: ChallengeCardProps) {
  const { t, locale } = useI18n();
  const title = getChallengeDisplayName(challenge, t);
  const honorTitle = t(challenge.doneTitleKey, { defaultValue: title });
  const warmLine = t('share.challengeCard.warm', { defaultValue: WARM_FALLBACK });
  const statChips = getChallengeStatChips(streakDays, guardsWon, t);
  const emblem = BADGE_INFO[challenge.rewardBadgeId]?.emoji ?? '🌿';

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
      data-testid="challenge-card"
      className="relative w-[375px] select-none overflow-hidden rounded-[28px]"
      style={{ height: 600, background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 装饰层 — 顶部柔光 + 底部门后微光 */}
      <div
        className="absolute -top-24 left-1/2 h-[300px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.16)' }}
      />
      <div
        className="absolute -bottom-28 left-1/2 h-[240px] w-[380px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: 'rgba(74, 222, 128, 0.10)' }}
      />

      <div className="relative z-10 flex h-full flex-col p-7">
        {/* 顶栏 — 守护挑战标 + 日期 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-white/5 px-3 py-1">
            <Flag className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-wide text-emerald-200">
              {t('share.challengeCard.pill', { defaultValue: 'Guard Challenge' })}
            </span>
          </div>
          <span className="text-[11px] text-[#88a292]">{dateLabel}</span>
        </div>

        {userName && <p className="mt-3 text-center text-[13px] text-[#b6cbbe]">{userName}</p>}

        {/* 中部 — 绿门徽记 + 挑战名 + 完成称号 + 达成祝贺 + 面子 chips */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <GateEmblem emoji={emblem} />
          <p className="mt-4 text-[13px] text-[#b6cbbe]">{title}</p>
          <p className="mt-1.5 text-[24px] font-black leading-tight text-[#f0faf2]">{honorTitle}</p>
          <p className="mt-2 max-w-[290px] text-[13px] leading-relaxed text-[#88a292]">{warmLine}</p>
          {statChips.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {statChips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-emerald-300/25 bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-200"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 赢回小时 — 家族英雄数字 (金额永不进卡) */}
        <div className="border-t border-white/10 pt-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#88a292]">
            {t('share.interceptMedal.wonBackLabel', { defaultValue: 'You won back' })}
          </p>
          <p className="mt-1.5 text-[30px] font-black leading-none tracking-tight text-[#f0faf2]">
            {heroPhrase}
          </p>
        </div>

        {/* 底部品牌条 */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-sm font-bold tracking-wide text-white">Symy</span>
          <span className="text-[11px] text-[#b6cbbe]">
            {t('share.interceptMedal.brandTagline', { defaultValue: 'Buy less. Live more.' })}
          </span>
        </div>
      </div>
    </div>
  );
}
