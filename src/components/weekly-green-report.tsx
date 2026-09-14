'use client';

/**
 * WeeklyGreenReport — 守护者周报卡 (Home tab, 紧跟日报卡之后)
 *
 * 面子/里子分离 (沿袭 daily-green-report 的 face-only 原则):
 * - 面子: 近 7 天守护天数 + 拦截次数 + 找回退款 + 连续守护 — 荣誉框架, 卡片可截图
 * - 里子: 「本周为你留下的钱」在卡片底部次级区 (分隔线下、小字)。分享导出图
 *   只拿金额换算后的自由小时, 金额行不进任何分享管道。
 *
 * 数据口径 (零 DDL, 与 daily-green-report 同一 events 管道, 纯客户端 7 天聚合):
 * - 守护 = challenge_completed + refund_processed (与日报同口径)
 * - 拦截 = challenge_completed (守住没买); 找回 = refund_processed (退款找回)。
 *   管道中不存在独立的「替代采纳」事件 — healing_kit 只写 buddy_state 单字段
 *   (无事件历史), 绿色替代采纳无落库; 退款找回是唯一真实的第二条守护金额管道。
 * - 连续守护 streak = 从今天往回数连续守护天; 今天还没守护时从昨天起数 (荣誉
 *   非羞耻: 清早打开不清零); 断天即停。上限即周窗口 (7), 周报只谈本周。
 * - 金额 = 窗口内守护事件 amount 之和 (挑战 savedAmount + 退款金额)。
 *
 * 展示时机 (纯前端): 近 7 天守护天数 ≥3 才渲染, 否则返回 null。
 * 不读不写 localStorage, 不新增持久化字段。中断周不出现任何失败/断签文案 —
 * streak 空时显示「小象陪你重新开始」。
 */

import { CalendarDays, Flame, Shield, ShieldCheck, Sprout, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import { moneyToFreedomLabel, moneyToHours } from '@/lib/freedom-time';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { ShareModal } from '@/components/share/share-modal';
import { RateNudge } from '@/components/rate-nudge';

export interface WeeklyGreenReportProps {
  events: ImpulseEvent[];
}

export interface GuardWeekSummary {
  /** 近 7 天里有 ≥1 次守护事件的天数 */
  guardDays: number;
  /** challenge_completed 次数 (守住没买) */
  intercepts: number;
  /** refund_processed 次数 (退款找回) */
  refunds: number;
  /** 连续守护天数 (今天, 或今天未守护时从昨天起, 断天即停, 上限 7) */
  streakDays: number;
  /** 本周留下的钱 = 窗口内守护事件金额之和 */
  moneyLeft: number;
}

/** 展示门槛: 近 7 天守护天数 ≥3 才出现 (纯前端, 不持久化) */
export const MIN_WEEK_GUARD_DAYS = 3;

function isGuardEvent(e: ImpulseEvent): boolean {
  // 与 daily-green-report 同口径: 只计正向守护, challenge_failed 不计入也不出现
  return e.subType === 'challenge_completed' || e.subType === 'refund_processed';
}

/** 本地日 key (与用户感知的「今天」一致, 同 daily-green-report 的本地时区口径) */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 近 7 天 (含今天) 守护聚合 — 纯函数, 导出供测试直接断言跨天累加与 streak 连续性 */
export function aggregateGuardWeek(events: ImpulseEvent[], now: Date): GuardWeekSummary {
  const windowKeys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    windowKeys.add(dayKey(d));
  }

  const guardCountByDay = new Map<string, number>();
  let intercepts = 0;
  let refunds = 0;
  let moneyLeft = 0;
  for (const e of events) {
    if (!isGuardEvent(e)) continue;
    const key = dayKey(e.timestamp);
    if (!windowKeys.has(key)) continue;
    guardCountByDay.set(key, (guardCountByDay.get(key) || 0) + 1);
    if (e.subType === 'challenge_completed') intercepts += 1;
    else refunds += 1;
    moneyLeft += e.amount || 0;
  }

  let streakDays = 0;
  const cursor = new Date(now);
  if (!guardCountByDay.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (guardCountByDay.has(dayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { guardDays: guardCountByDay.size, intercepts, refunds, streakDays, moneyLeft };
}

function MetricCell({ icon, value, suffix, label }: { icon: React.ReactNode; value: number | string; suffix?: string; label: string }) {
  return (
    <div className="rounded-xl border border-emerald-300/15 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-emerald-300/80">{icon}</div>
      <p className="mt-1.5 text-2xl font-black leading-none text-[#f0faf2]">
        {value}
        {suffix && <span className="ml-1 text-sm font-bold">{suffix}</span>}
      </p>
      <p className="mt-1 text-[11px] text-[#88a292]">{label}</p>
    </div>
  );
}

export function WeeklyGreenReport({ events }: WeeklyGreenReportProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const [shareOpen, setShareOpen] = useState(false);

  const now = new Date();
  const summary = aggregateGuardWeek(events, now);
  if (summary.guardDays < MIN_WEEK_GUARD_DAYS) return null;

  const dateFormat = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  const rangeLabel = `${dateFormat.format(weekStart)} – ${dateFormat.format(now)}`;

  const moneyLineVisible = summary.moneyLeft > 0;

  return (
    <section
      data-testid="weekly-green-report"
      className="relative overflow-hidden rounded-2xl p-5"
      style={{ background: 'linear-gradient(165deg, #1c4130 0%, #143527 52%, #0c2017 100%)' }}
    >
      {/* 顶部柔光 — 延续日报卡的松绿视觉 */}
      <div
        className="absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-[70px]"
        style={{ background: 'rgba(74, 222, 128, 0.14)' }}
        aria-hidden="true"
      />

      {/* 称号区 */}
      <div className="relative z-10 flex items-center gap-2">
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-white/5">
          <Sprout className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#f0faf2]">{t('report.weekly.title')}</h3>
          <p className="text-[10px] text-[#88a292]">{rangeLabel}</p>
        </div>
      </div>

      {/* 面子区 — 2x2 指标网格 (streak 为 0 时不出 0, 显示重新开始陪伴文案) */}
      <div className="relative z-10 mt-4 grid grid-cols-2 gap-2.5">
        <MetricCell
          icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
          value={summary.guardDays}
          label={t('report.weekly.guardDays')}
        />
        <MetricCell
          icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
          value={summary.intercepts}
          label={t('report.weekly.intercepts')}
        />
        <MetricCell
          icon={<Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
          value={summary.refunds}
          label={t('report.weekly.refunds')}
        />
        {summary.streakDays > 0 ? (
          <MetricCell
            icon={<Flame className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />}
            value={summary.streakDays}
            suffix={t('common.days')}
            label={t('report.weekly.streakLabel')}
          />
        ) : (
          <div className="flex flex-col justify-center rounded-xl border border-emerald-300/15 bg-white/5 p-3">
            <Shield className="h-3.5 w-3.5 text-emerald-300/80" aria-hidden="true" />
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-[#a7f3d0]">
              {t('report.weekly.streakRestart')}
            </p>
          </div>
        )}
      </div>

      {/* 里子区 — 金额只在 app 内这个次级区可见; 无导出图, 金额不进任何分享管道 */}
      <div className="relative z-10 mt-4 border-t border-white/10 pt-3">
        {moneyLineVisible ? (
          <>
            <p className="text-xs text-[#b6cbbe]" data-testid="weekly-money-line">
              {t('report.weekly.moneyLeft', { amount: moneyToFreedomLabel(summary.moneyLeft, locale) })}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-[#88a292]">
              <Sprout className="h-3 w-3" aria-hidden="true" />
              {t('report.weekly.moneyDestination')}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1 text-[10px] text-[#88a292]" data-testid="weekly-money-hint">
            <Sprout className="h-3 w-3" aria-hidden="true" />
            {t('report.weekly.moneyHint')}
          </p>
        )}
      </div>
      {/* batch26-b: 默认时薪 + 有拦截战绩 → 荣誉时刻轻引导「为你定制」(非弹窗, 可暂不) */}
      <RateNudge hasStats={summary.intercepts > 0} />
      <button
        type="button"
        data-testid="weekly-share-entry"
        onClick={() => setShareOpen(true)}
        className="relative z-10 mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300/25 bg-white/5 py-2.5 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-300/45"
      >
        <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
        {t('share.weeklyCard.shareEntry', { defaultValue: 'Share this week' })}
      </button>
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        medal={{ itemTitle: '', savedCents: Math.round(summary.moneyLeft * 100) }}
        streakDays={summary.streakDays}
        interceptCount={summary.intercepts}
        initialTemplate="weekly"
        weeklyCard={{
          guardDays: summary.guardDays,
          intercepts: summary.intercepts,
          streakDays: summary.streakDays,
          savedHours: moneyToHours(summary.moneyLeft, hourlyRate || 20),
          date: now.toISOString(),
        }}
      />
    </section>
  );
}
