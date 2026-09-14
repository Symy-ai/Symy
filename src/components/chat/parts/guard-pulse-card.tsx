'use client';

/**
 * GuardPulseCard — "我什么时候最容易冲动" 按小时守护脉搏卡 (batch68-c)
 *
 * 三层结构: 概览 (近 28 天次数/天数) → 高风险时段行 (小时区间 + 等级 +
 * 拦截/采纳/天数 + 时段前建议) → 注释行 (看见节奏, 不是评判)。
 * 数字复用 lib/guard-pulse 的 aggregateGuardPulse (用户本地时区)。
 *
 * 红线:
 * - 数字由服务端聚合 lib 算好随卡带来, 本组件零计算零请求
 * - 只报小时/次数/天数 — 零金额零碳数值; 本卡无分享面
 * - 样本不足 (insufficient) 渲染 "还没攒够数据" 引导态, 不造伪规律
 * - 节奏框架非评判: 无失败人格标签, 时段是提前安排的抓手
 */

import { useI18n } from '@/i18n/provider';
import type { GuardPulseCardData } from '@/types/guard-pulse';

/** 等级 chip 配色 — 描述触发节奏, 不做人格评判 */
const LEVEL_CHIP_CLASS: Record<'high' | 'medium', string> = {
  high: 'bg-rose-500/15 text-rose-500',
  medium: 'bg-amber-500/15 text-amber-500',
};

/** 本地小时 → "HH:00" 标签 */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function GuardPulseCard({ data }: { data: GuardPulseCardData }) {
  const { t } = useI18n();

  if (data.status === 'insufficient') {
    return (
      <aside
        className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
        aria-label={t('chat.guardPulse.title')}
        data-testid="guard-pulse-card"
        data-status="insufficient"
      >
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <span aria-hidden>🐘</span>
          <span>{t('chat.guardPulse.title')}</span>
        </h4>
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="guard-pulse-insufficient">
          {t('chat.guardPulse.insufficient')}
        </p>
      </aside>
    );
  }

  const windowRange = (w: GuardPulseCardData['windows'][number]) =>
    w.startHour === w.endHour ? hourLabel(w.startHour) : `${hourLabel(w.startHour)}–${hourLabel(w.endHour)}`;

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.guardPulse.title')}
      data-testid="guard-pulse-card"
      data-status="ok"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.guardPulse.title')}</span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="guard-pulse-overview">
        <li className="text-[11px] leading-relaxed text-text-secondary">
          <span className="text-text-primary">{t('chat.guardPulse.sampleLabel')}</span>
          {t('chat.guardPulse.sample', {
            count: String(data.totalSample),
            days: String(data.activeDays),
            days28: String(data.lookbackDays),
          })}
        </li>
      </ul>

      <ul className="mt-2 space-y-1.5" data-testid="guard-pulse-windows" aria-label={t('chat.guardPulse.windowListLabel')}>
        {data.windows.map((w, i) => (
          <li
            key={w.hours.join('-')}
            data-testid={`guard-pulse-window-${i}`}
            data-level={w.level}
            className="rounded-md bg-white/5 px-1.5 py-1 text-[11px] leading-relaxed text-text-secondary"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-text-primary">{windowRange(w)}</span>
              {w.wrapsMidnight ? <span className="shrink-0 text-text-tertiary">{t('chat.guardPulse.wraps')}</span> : null}
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] ${LEVEL_CHIP_CLASS[w.level]}`}>
                {t(`chat.guardPulse.level.${w.level}`)}
              </span>
            </div>
            <div className="mt-0.5" data-testid={`guard-pulse-window-${i}-stats`}>
              {t('chat.guardPulse.windowStats', {
                intercepts: String(w.intercepts),
                adoptions: String(w.adoptions),
                days: String(w.activeDays),
              })}
            </div>
            <div className="mt-0.5 text-text-tertiary" data-testid={`guard-pulse-window-${i}-suggestion`}>
              <span aria-hidden>🌱</span> {t(`chat.guardPulse.suggestion.${w.suggestion}`)}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary" data-testid="guard-pulse-note">
        {t('chat.guardPulse.note')}
      </p>
    </aside>
  );
}
