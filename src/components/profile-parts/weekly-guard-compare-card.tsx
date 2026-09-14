'use client';

/**
 * WeeklyGuardCompareCard — 守护周对比卡 (batch50-c)
 *
 * 个人页统计区 (胜率漏斗卡之下的独立区块): 本周 vs 上周三指标
 * (拦截参与次数 / 挑战通过率 / 守护自由小时), 每行趋势箭头,
 * 下挂一句小象口吻点评 (进步/持平/回落三档; 回落档温暖鼓励非指责)。
 * 小时数仅 app 内展示, 永不进分享/荣誉面 (红线)。
 * 上周无数据 → "下周开始对比"引导态, 不渲染 0% 或负趋势。
 */

import { CalendarClock } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useWeeklyGuardCompare } from '@/hooks/use-weekly-guard-compare';
import type { TrendDirection } from '@/lib/weekly-guard-compare';

const ARROW: Record<TrendDirection, string> = { up: '↑', flat: '→', down: '↓' };
const ARROW_CLASS: Record<TrendDirection, string> = {
  up: 'text-green-400',
  flat: 'text-text-tertiary',
  // 回落不用红色警示 — 温暖基调, 非指责
  down: 'text-amber-400',
};

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function MetricRow({
  label,
  from,
  to,
  trend,
  testid,
}: {
  label: string;
  from: string;
  to: string;
  trend: TrendDirection;
  testid: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2" data-testid={testid}>
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
        <span className="text-text-tertiary">{from}</span>
        <span aria-hidden>→</span>
        <span className="text-text-primary font-medium">{to}</span>
        <span className={`font-bold ${ARROW_CLASS[trend]}`} data-testid={`${testid}-trend`}>
          {ARROW[trend]}
        </span>
      </span>
    </div>
  );
}

export function WeeklyGuardCompareCard() {
  const { t } = useI18n();
  const { compare, isLoading } = useWeeklyGuardCompare();

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="weekly-guard-compare-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // 拉取失败 (null) 或上周无数据 → 引导态, 不渲染 0% / 负趋势
  if (!compare || compare.status !== 'ok') {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="weekly-guard-compare-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <CalendarClock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.weeklyCompareTitle')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.weeklyCompareEmpty')}
          </p>
        </div>
      </div>
    );
  }

  const { thisWeek, lastWeek, trends } = compare;
  // 整体点评档位: 有升无降=进步; 有降=回落 (温暖鼓励); 其余=持平
  const trendValues = [trends.intercepts, trends.passRate, trends.hoursReclaimed];
  const tipKey = trendValues.includes('up') && !trendValues.includes('down')
    ? 'profile.weeklyCompareTipUp'
    : trendValues.includes('down')
      ? 'profile.weeklyCompareTipDown'
      : 'profile.weeklyCompareTipFlat';

  return (
    <div
      className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="weekly-guard-compare-card"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <CalendarClock className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          {t('profile.weeklyCompareTitle')}
        </p>
        <div className="mt-1.5 flex flex-col gap-1">
          <MetricRow
            label={t('profile.weeklyCompareIntercepts')}
            from={`${lastWeek.intercepts}`}
            to={`${thisWeek.intercepts}`}
            trend={trends.intercepts}
            testid="weekly-guard-compare-intercepts"
          />
          <MetricRow
            label={t('profile.weeklyComparePassRate')}
            from={formatRate(lastWeek.passRate)}
            to={formatRate(thisWeek.passRate)}
            trend={trends.passRate}
            testid="weekly-guard-compare-passrate"
          />
          {/* 守护自由小时 — 仅 app 内展示, 不进分享面 (红线) */}
          <MetricRow
            label={t('profile.weeklyCompareHours')}
            from={t('profile.weeklyCompareHoursValue', { hours: Math.round(lastWeek.hoursReclaimed * 10) / 10 })}
            to={t('profile.weeklyCompareHoursValue', { hours: Math.round(thisWeek.hoursReclaimed * 10) / 10 })}
            trend={trends.hoursReclaimed}
            testid="weekly-guard-compare-hours"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-text-tertiary" data-testid="weekly-guard-compare-card-tip">
          {t(tipKey)}
        </p>
      </div>
    </div>
  );
}
