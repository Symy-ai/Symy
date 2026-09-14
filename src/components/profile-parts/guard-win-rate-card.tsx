'use client';

/**
 * GuardWinRateCard — 守护胜率漏斗卡 (batch49-c)
 *
 * 个人页统计区 (冲动时段卡之下): 胜率百分数 + 胜场次数 + 小象口吻解读 +
 * 连续成功 streak 亮点行。金额行 (胜场累计守护金额) 仅 app 内展示,
 * 永不进分享/荣誉面 (红线)。样本不足显示中性鼓励文案, 不渲染 0%。
 */

import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGuardWinRate } from '@/hooks/use-guard-win-rate';
import { formatCurrencyShort } from '@/lib/format';

export function GuardWinRateCard() {
  const { t } = useI18n();
  const { summary, isLoading } = useGuardWinRate();

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="guard-win-rate-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // 拉取失败 (null) 或样本不足 → 中性文案, 不渲染 0% 伪结论
  if (!summary || summary.status !== 'ok') {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="guard-win-rate-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.guardWinRateTitle')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.guardWinRateEmpty')}
          </p>
        </div>
      </div>
    );
  }

  const winPercent = Math.round(summary.winRate * 100);
  // 小象口吻解读: 高胜率夸能力, 低胜率给"下次再来"的鼓励 (荣誉非羞辱)
  const toneKey = summary.winRate >= 0.7
    ? 'profile.guardWinRateTipHigh'
    : summary.winRate >= 0.4
      ? 'profile.guardWinRateTipMid'
      : 'profile.guardWinRateTipLow';

  return (
    <div
      className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="guard-win-rate-card"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <ShieldCheck className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          {t('profile.guardWinRateTitle')}
        </p>
        <p className="mt-1 text-xs text-text-secondary" data-testid="guard-win-rate-card-headline">
          {t('profile.guardWinRateHeadline', { percent: winPercent, wins: summary.passed, total: summary.settled })}
        </p>
        <p className="mt-1 text-[11px] text-text-tertiary" data-testid="guard-win-rate-card-tip">
          {t(toneKey)}
        </p>
        {summary.streakDays > 0 && (
          <p className="mt-1 text-[11px] text-text-secondary" data-testid="guard-win-rate-card-streak">
            {t('profile.guardWinRateStreak', { days: summary.streakDays })}
          </p>
        )}
        {/* 胜场累计守护金额 — 仅 app 内展示, 不进分享面 (红线) */}
        <p className="mt-1 text-[11px] text-text-tertiary" data-testid="guard-win-rate-card-amount">
          {t('profile.guardWinRateAmount', { amount: formatCurrencyShort(summary.guardedAmount) })}
        </p>
      </div>
    </div>
  );
}
