'use client';

/**
 * SavingsQueryCard — "这个月省了多少" 问账卡 (batch57-c)
 *
 * 用户在 chat 里问账 ("这个月省了多少 / 上周守护了几次") 命中问账轮时,
 * 小象对账回复气泡下方渲染本卡: 时间窗 + 拦截轮次 + 胜率 + 三轨次数 +
 * 守护自由小时 + 该窗转存合计 (App 内私享金额, win-rate 卡先例)。
 *
 * 红线:
 * - 数字由服务端聚合 lib 算好随卡带来, 本组件零计算零请求
 * - 无数据窗 (noData) 渲染引导态 ("这周还没开张, 下一单叫上我"),
 *   绝不显示 0 元假账, 不羞辱
 * - 转存合计只出现在卡内私享行, 永不进分享文案; 分享行 (shareFace)
 *   是结构上的 amount-free 变体 (次数 + 自由小时)
 * - 无碳数值; 三轨样本不足时不渲染三轨行 (不造伪计数)
 */

import { useI18n } from '@/i18n/provider';
import type { SavingsQueryCardData } from '@/types/savings-query';

export function SavingsQueryCard({ data }: { data: SavingsQueryCardData }) {
  const { t, locale } = useI18n();

  const windowLabel = t(`chat.savingsQuery.window.${data.window}`);
  const shareLine = locale === 'zh' ? data.shareFace.zh : data.shareFace.en;

  if (data.status === 'noData') {
    return (
      <aside
        className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
        aria-label={t('chat.savingsQuery.title')}
        data-testid="savings-query-card"
        data-status="noData"
      >
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <span aria-hidden>🐘</span>
          <span>{t('chat.savingsQuery.title')}</span>
          <span className="text-text-secondary">{windowLabel}</span>
        </h4>
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="savings-query-empty">
          {t('chat.savingsQuery.empty')}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.savingsQuery.title')}
      data-testid="savings-query-card"
      data-status="ok"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.savingsQuery.title')}</span>
        <span className="text-text-secondary">{windowLabel}</span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="savings-query-lines">
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="savings-query-intercepts">
          <span className="text-text-primary">{t('chat.savingsQuery.lineInterceptsLabel')}</span>
          {t('chat.savingsQuery.lineIntercepts', { count: String(data.intercepts) })}
          {data.passRate !== null
            ? ` · ${t('chat.savingsQuery.linePassRate', { rate: `${Math.round(data.passRate * 100)}%` })}`
            : ''}
        </li>
        {data.tracksAvailable ? (
          <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="savings-query-tracks">
            <span className="text-text-primary">{t('chat.savingsQuery.lineTracksLabel')}</span>
            {t('chat.savingsQuery.lineTracks', {
              guard: String(data.trackCounts.guard),
              alt: String(data.trackCounts.alt),
              reuse: String(data.trackCounts.reuse),
            })}
          </li>
        ) : null}
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="savings-query-hours">
          <span className="text-text-primary">{t('chat.savingsQuery.lineHoursLabel')}</span>
          {t('chat.savingsQuery.lineHours', { hours: data.hoursLabel })}
        </li>
        {/* App 内私享金额 — 只在卡内展示, 永不进分享面 */}
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="savings-query-saved">
          <span className="text-text-primary">{t('chat.savingsQuery.lineSavedLabel')}</span>
          {t('chat.savingsQuery.lineSaved', { amount: `$${Math.round(data.private.estSavedTotal)}` })}
        </li>
      </ul>

      <p
        className="mt-2 border-t border-glass-border pt-2 text-[11px] leading-relaxed text-text-tertiary"
        data-testid="savings-query-share"
      >
        🌱 {t('chat.savingsQuery.shareLabel')} {shareLine}
      </p>
    </aside>
  );
}
