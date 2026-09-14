'use client';

/**
 * ImpulseWindowCard — 冲动高发时段洞察卡 (batch48-c)
 *
 * 个人页统计区 (品类透视卡之下): 高危时段名 + 占比 + 一句可执行建议。
 * 纯展示, 零金额零碳数值; 样本不足显示鼓励文案, 不渲染伪洞察;
 * 非 dominant (均匀分布) 时用不夸大的措辞。
 */

import { Clock } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useImpulseWindow } from '@/hooks/use-impulse-window';
import { useNightWindow } from '@/hooks/use-night-window';
import { NIGHT_WINDOW_OPTIONS, type NightWindowPreset } from '@/lib/night-window';

/** 当前生效夜间窗口说明行; 默认档不显示 (与 batch48-c 基线一致), off 显示透明提示 */
function activeWindowLine(
  t: (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => string,
  nightWindow: NightWindowPreset,
): string | null {
  if (nightWindow === 'standard') return null;
  if (nightWindow === 'off') return t('profile.impulseWindowOffNote');
  const option = NIGHT_WINDOW_OPTIONS[nightWindow];
  return t('profile.impulseWindowActiveWindow', {
    window: `${t(`profile.nightWindowName.${nightWindow}`)} (${option.rangeLabel})`,
  });
}

export function ImpulseWindowCard() {
  const { t } = useI18n();
  const { summary, isLoading } = useImpulseWindow();
  const { nightWindow } = useNightWindow();
  const activeLine = activeWindowLine(t, nightWindow);

  if (isLoading) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse"
        data-testid="impulse-window-card-skeleton"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-32 rounded bg-white/10 mb-2" />
          <div className="h-3 w-full rounded bg-white/10" />
        </div>
      </div>
    );
  }

  // 拉取失败 (null) 或样本不足 → 数据不足态
  if (!summary || summary.status !== 'ok' || !summary.topWindow) {
    return (
      <div
        className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
        data-testid="impulse-window-card-empty"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Clock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('profile.impulseWindowTitle')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('profile.impulseWindowEmpty')}
          </p>
          {activeLine && (
            <p className="mt-1 text-[11px] text-text-tertiary" data-testid="impulse-window-card-active-window">
              {activeLine}
            </p>
          )}
        </div>
      </div>
    );
  }

  const sharePercent = Math.round(summary.topShare * 100);

  return (
    <div
      className="mt-2.5 flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="impulse-window-card"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Clock className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          {t('profile.impulseWindowTitle')}
        </p>
        <p className="mt-1 text-xs text-text-secondary" data-testid="impulse-window-card-headline">
          {t('profile.impulseWindowHeadline', {
            window: t(`profile.impulseWindowName.${summary.topWindow}`),
            percent: sharePercent,
          })}
        </p>
        <p className="mt-1 text-xs text-text-tertiary" data-testid="impulse-window-card-tip">
          {summary.dominant
            ? t(`profile.impulseWindowTip.${summary.topWindow}`)
            : t('profile.impulseWindowTipBalanced')}
        </p>
        {activeLine && (
          <p className="mt-1 text-[11px] text-text-tertiary" data-testid="impulse-window-card-active-window">
            {activeLine}
          </p>
        )}
      </div>
    </div>
  );
}
