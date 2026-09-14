'use client';

/**
 * Share card template registry — 勋章卡模板注册制 (batch2-b)
 *
 * 一个 modal, 多款可晒勋章卡: 用户在不同成就时刻切换模板 —
 *   intercept  单次拦截勋章 (原有卡, 零回归)
 *   streak     连续守护 N 天 (streak 卡)
 *   milestone  第 N 次守护里程碑 (10/50/100 解锁)
 *   badge      绿色勋章晒卡 (batch4-a — 勋章库 14 枚绑真实行为后扩容)
 *   challenge  挑战达成晒卡 (batch5-a — 挑战完成时刻的传播出口, 绿门拱徽记)
 *
 * 面子/里子铁律 (owner 09-06): 每张卡都以赢回的小时 (savedHours) 为英雄数字,
 * 钱数 (savedCents) 只在 app 内 modal 私密提示行出现 — 类型层面就杜绝:
 * ShareCardData 不含 savedCents, 模板 render 拿不到金额。
 */

import type { ReactNode, Ref } from 'react';
import { Award, CalendarCheck, Flag, Flame, Medal, ShieldCheck, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { InterceptMedalData } from '@/types/intercept-medal';
import { formatFreedomTime } from '@/lib/freedom-time';
import type { BadgeDef } from '@/components/buddy/constants';
import type { GuardianChallenge } from '@/components/buddy/challenge-definitions';
import { InterceptCard } from './intercept-card';
import { StreakCard } from './streak-card';
import { MilestoneCard } from './milestone-card';
import { BadgeCard } from './badge-card';
import { ChallengeCard } from './challenge-card';
import { WeeklyCard, type WeeklyCardData } from './weekly-card';
import { DreamCard } from './dream-card';
import { GuardianStatsCard } from './guardian-stats-card';
import { InviteShareCard } from './invite-card';

// 'dream' 预留: dream-achievement-overlay 已传 initialTemplate="dream" (梦想卡模板未建,
// getShareTemplate 会兜底回 SHARE_TEMPLATES[0]), 先纳入类型避免编译错误 — File Split Wave 1
// 'guardian-stats' (batch24-c): 守护战绩一图流 — chip 只在 guardRank 传入时出现 (invite-card 晒战绩入口)
// 'invite' (rescue-0907-inflight): 邀请分享卡
export type ShareTemplateId = 'intercept' | 'streak' | 'milestone' | 'badge' | 'challenge' | 'weekly' | 'dream' | 'guardian-stats' | 'invite';

/** 模板渲染数据 — 刻意不含 savedCents: 金额永不进分享图 */
export interface ShareCardData {
  medal: InterceptMedalData;
  /** 连续守护天数 (buddyState.streak, 0 = 尚无连续记录 → 鼓励态) */
  streakDays: number;
  /** 累计拦截次数 (challenge stats totalPassed, 现有数据推导 — 零 DDL) */
  interceptCount: number;
  /** 赢回的小时 (savedCents 换算, 调用方算好) */
  savedHours: number;
}

/** badge 模板专属输入 — BadgeDef 只读引用 (batch3-c 战场禁改) + 面子进度快照 */
export interface BadgeCardData {
  badge: BadgeDef;
  /** progressType 对应进度 (守护次数/天数/基金数; AI 授予型 = 0, 卡上不出数字) */
  progressValue: number;
}

/**
 * challenge 模板专属输入 — GuardianChallenge 只读引用 (batch5-a, 挑战域禁改)。
 * 完成快照的面子字段 (连续天数/守护次数/赢回小时) 走 ShareCardData 既有通道, 不重复携带。
 */
export interface ChallengeCardData {
  challenge: GuardianChallenge;
}

/** weekly 模板专属输入 — 只收已换算小时, 金额不进分享渲染管道 */
export type WeeklyCardSnapshot = WeeklyCardData;

export type InviteCardSnapshot = {
  refCode: string;
  completedCount: number;
};

export interface ShareTemplateRenderProps extends ShareCardData {
  /** 导出 PNG 用 — html-to-image 的目标节点 ref (当前选中模板的卡根节点) */
  cardRef?: Ref<HTMLDivElement>;
  /** badge 模板数据 — 其余模板忽略; 缺失时 badge 模板渲染 null (chip 也不会出现) */
  badgeCard?: BadgeCardData;
  /** batch5-a: challenge 模板数据 — 其余模板忽略; 缺失时 challenge 模板渲染 null */
  challengeCard?: ChallengeCardData;
  /** weekly 模板数据 — 缺失时 weekly 模板渲染 null */
  weeklyCard?: WeeklyCardSnapshot;
  /** Honor-only rank data; omitting it preserves all existing cards */
  guardRank?: { name: string; level: number; emoji: string };
  /** dream 模板数据 — 金额只保留机器分制供 modal 私密提示, 卡面渲染已换算小时 */
  dreamFund?: { name: string; savedCents: number; streakDays?: number };
  /** invite 模板数据 — 只有守护称号、同行人数与真实 ref 码, 金额/天数永不上卡 */
  inviteCard?: InviteCardSnapshot;
}

export interface ShareTemplate {
  id: ShareTemplateId;
  /** chip 文案 i18n key (share.template.*) */
  labelKey: string;
  /** i18n 缺失时的兜底文案 */
  labelDefault: string;
  icon: LucideIcon;
  render(props: ShareTemplateRenderProps): ReactNode;
}

export const SHARE_TEMPLATES: ShareTemplate[] = [
  {
    id: 'intercept',
    labelKey: 'share.template.intercept',
    labelDefault: 'Intercept Medal',
    icon: Medal,
    render: ({ medal, streakDays, savedHours, cardRef }) => (
      <InterceptCard
        cardRef={cardRef}
        savedHours={savedHours}
        itemTitle={medal.itemTitle}
        greenSaved={medal.greenSaved}
        userName={medal.userName}
        date={medal.date}
        streakDays={streakDays > 0 ? streakDays : undefined}
      />
    ),
  },
  {
    id: 'streak',
    labelKey: 'share.template.streak',
    labelDefault: 'Streak',
    icon: Flame,
    render: ({ medal, streakDays, savedHours, cardRef, guardRank }) => (
      <StreakCard
        cardRef={cardRef}
        savedHours={savedHours}
        streakDays={streakDays}
        guardRank={guardRank}
        userName={medal.userName}
        date={medal.date}
      />
    ),
  },
  {
    id: 'milestone',
    labelKey: 'share.template.milestone',
    labelDefault: 'Milestone',
    icon: Trophy,
    render: ({ medal, interceptCount, savedHours, cardRef }) => (
      <MilestoneCard
        cardRef={cardRef}
        savedHours={savedHours}
        interceptCount={interceptCount}
        userName={medal.userName}
        date={medal.date}
      />
    ),
  },
  {
    id: 'badge',
    labelKey: 'share.template.badge',
    labelDefault: 'Green Honor',
    icon: Award,
    render: ({ badgeCard, savedHours, cardRef }) =>
      badgeCard ? (
        <BadgeCard
          cardRef={cardRef}
          badge={badgeCard.badge}
          progressValue={badgeCard.progressValue}
          savedHours={savedHours}
        />
      ) : null,
  },
  {
    id: 'challenge',
    labelKey: 'share.template.challenge',
    labelDefault: 'Challenge Win',
    icon: Flag,
    render: ({ challengeCard, streakDays, interceptCount, savedHours, cardRef }) =>
      challengeCard ? (
        <ChallengeCard
          cardRef={cardRef}
          challenge={challengeCard.challenge}
          streakDays={streakDays}
          guardsWon={interceptCount}
          savedHours={savedHours}
        />
      ) : null,
  },
  {
    id: 'weekly',
    labelKey: 'share.template.weekly',
    labelDefault: 'Weekly Report',
    icon: CalendarCheck,
    render: ({ weeklyCard, cardRef }) => (weeklyCard ? <WeeklyCard cardRef={cardRef} {...weeklyCard} /> : null),
  },
  {
    id: 'dream',
    labelKey: 'share.template.dream',
    labelDefault: 'Dream Medal',
    icon: Medal,
    render: ({ dreamFund, savedHours, medal, cardRef }) =>
      dreamFund ? (
        <DreamCard
          cardRef={cardRef}
          name={dreamFund.name}
          savedHours={savedHours}
          streakDays={dreamFund.streakDays}
          date={medal.date}
        />
      ) : null,
  },
  {
    id: 'guardian-stats',
    labelKey: 'share.template.guardianStats',
    labelDefault: 'Guardian Record',
    icon: ShieldCheck,
    render: ({ guardRank, streakDays, interceptCount, savedHours, cardRef }) =>
      guardRank ? (
        <GuardianStatsCard
          cardRef={cardRef}
          guardRank={guardRank}
          streakDays={streakDays}
          interceptCount={interceptCount}
          savedHours={savedHours}
        />
      ) : null,
  },
  {
    id: 'invite',
    labelKey: 'share.template.invite',
    labelDefault: 'Guardian Invite',
    icon: Users,
    render: ({ inviteCard, cardRef }) => (inviteCard ? <InviteShareCard cardRef={cardRef} {...inviteCard} /> : null),
  },
];

export function getShareTemplate(id: ShareTemplateId): ShareTemplate {
  return SHARE_TEMPLATES.find((tp) => tp.id === id) ?? SHARE_TEMPLATES[0];
}

/**
 * 赢回小时展示数字 — 统计格子等纯数字槽位用 (≥10 取整, <10 保留 1 位, 不夸大)。
 * 0/负数/NaN 与亚小时 (<0.1h, 免出「0.0 小时」) 返回空串, 由调用方走兜底文案。
 */
export function formatHoursNumber(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0 || hours < 0.1) return '';
  return hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
}

/**
 * 晒卡赢回时间完整标签 (数字+单位) — 英雄行/分享文案槽位用。
 * 亚小时出「N 分钟」, 取整方向与 app 内 formatFreedomTime 同向 (round),
 * 同一笔拦截两个面数字一致 (QA 冒烟边界观察 #4/#5)。
 * <0.1h 与 0/负/NaN 同语义返回空串, 由调用方走「一次绿色的选择」兜底文案。
 */
export function formatShareHoursLabel(hours: number, locale: string): string {
  if (!Number.isFinite(hours) || hours <= 0 || hours < 0.1) return '';
  return formatFreedomTime(hours, locale);
}

/** 里程碑解锁阈值 — 拦截次数达到即解锁 (现有数据推导, 零 DDL) */
export const MILESTONE_THRESHOLDS = [10, 50, 100] as const;

export interface MilestoneState {
  count: number;
  /** count ≥ 首个阈值 (10) — 第 N 次守护进入可庆祝态 */
  unlocked: boolean;
  /** 下一个未达成阈值; 全部达成时 null */
  next: number | null;
  /** 距下一阈值还差几次 (next 为 null 时 0) */
  remaining: number;
}

export function getMilestoneState(count: number): MilestoneState {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const next = MILESTONE_THRESHOLDS.find((m) => m > safeCount) ?? null;
  return {
    count: safeCount,
    unlocked: safeCount >= MILESTONE_THRESHOLDS[0],
    next,
    remaining: next ? next - safeCount : 0,
  };
}
