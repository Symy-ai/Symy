'use client';

/**
 * ImpulseForecastCard — "下周容易冲动吗" 未来 7 天冲动风险预报卡 (batch62-c)
 *
 * 三层结构: 概览 (高/中/低天数 + 最高风险类别) → 逐日行 (星期 + 等级 +
 * 危险时段 + 主要类别) → 准备建议 (复用既有绿色替代/冷却/情绪守护入口,
 * 不新建守护机制)。单轮追问 ("那周六呢") 时 focusDay 高亮对应行。
 * 数字复用 lib/impulse-forecast 的 forecastImpulseRisk (本地时区)。
 *
 * 红线:
 * - 数字由服务端聚合 lib 算好随卡带来, 本组件零计算零请求
 * - 只报次数/天数/星期/时段 — 零金额零碳数值; 本卡无分享面
 * - 样本不足 (insufficient) 渲染 "还没攒够数据" 引导态, 不造伪规律
 * - 提前准备框架, 不是预测: 不承诺准确率, 不制造焦虑, 非羞辱框架
 */

import { useI18n } from '@/i18n/provider';
import { WEEKDAYS_EN, WEEKDAYS_ZH } from '@/lib/monthly-guard-heatmap';
import type { ImpulseForecastCardData } from '@/types/impulse-forecast';

/** 等级 chip 配色 — 描述触发规律, 不做人格评判; insufficient 与低风险中性呈现 */
const LEVEL_CHIP_CLASS: Record<ImpulseForecastCardData['days'][number]['level'], string> = {
  high: 'bg-rose-500/15 text-rose-500',
  medium: 'bg-amber-500/15 text-amber-500',
  low: 'bg-emerald-500/15 text-emerald-500',
  insufficient: 'bg-white/10 text-text-tertiary',
};

export function ImpulseForecastCard({ data }: { data: ImpulseForecastCardData }) {
  const { t, locale } = useI18n();

  const weekdayLabel = (w: number) => (locale === 'zh' ? `周${WEEKDAYS_ZH[w]}` : WEEKDAYS_EN[w]);

  if (data.status === 'insufficient') {
    return (
      <aside
        className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
        aria-label={t('chat.impulseForecast.title')}
        data-testid="impulse-forecast-card"
        data-status="insufficient"
      >
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <span aria-hidden>🐘</span>
          <span>{t('chat.impulseForecast.title')}</span>
        </h4>
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="impulse-forecast-insufficient">
          {t('chat.impulseForecast.insufficient')}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.impulseForecast.title')}
      data-testid="impulse-forecast-card"
      data-status="ok"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.impulseForecast.title')}</span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="impulse-forecast-overview">
        <li className="text-[11px] leading-relaxed text-text-secondary">
          <span className="text-text-primary">{t('chat.impulseForecast.overviewLabel')}</span>
          {t('chat.impulseForecast.overview', {
            high: String(data.highDays),
            medium: String(data.mediumDays),
            low: String(data.lowDays),
          })}
        </li>
        {data.topCategory ? (
          <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="impulse-forecast-top-category">
            <span className="text-text-primary">{t('chat.impulseForecast.topCategoryLabel')}</span>
            {t(`chat.categoryQuery.category.${data.topCategory}`)}
          </li>
        ) : null}
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="impulse-forecast-sample">
          <span className="text-text-primary">{t('chat.impulseForecast.sampleLabel')}</span>
          {t('chat.impulseForecast.sample', { count: String(data.totalSample) })}
        </li>
      </ul>

      <ul className="mt-2 space-y-1" data-testid="impulse-forecast-days" aria-label={t('chat.impulseForecast.dayListLabel')}>
        {data.days.map((day, i) => {
          const focused = data.focusDay === i;
          return (
            <li
              key={`${day.dayKey}-${i}`}
              data-testid={`impulse-forecast-day-${i}`}
              data-level={day.level}
              data-focus={focused ? 'true' : undefined}
              className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[11px] leading-relaxed text-text-secondary ${focused ? 'bg-white/5' : ''}`}
            >
              <span className="w-8 shrink-0 text-text-primary">{weekdayLabel(day.weekday)}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] ${LEVEL_CHIP_CLASS[day.level]}`}>
                {t(`chat.impulseForecast.level.${day.level}`)}
              </span>
              {day.dangerWindow ? (
                <span className="truncate">{t(`chat.impulseTimeQuery.window.${day.dangerWindow}`)}</span>
              ) : null}
              {day.primaryCategory ? (
                <span className="text-text-tertiary truncate">{t(`chat.categoryQuery.category.${day.primaryCategory}`)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-2" data-testid="impulse-forecast-prep">
        <p className="text-[11px] font-medium text-text-primary">{t('chat.impulseForecast.prepLabel')}</p>
        <ul className="mt-1 space-y-1">
          <li className="text-[11px] leading-relaxed text-text-secondary">
            <span aria-hidden>🌱</span> {t('chat.impulseForecast.prepGreen')}
          </li>
          <li className="text-[11px] leading-relaxed text-text-secondary">
            <span aria-hidden>⏳</span> {t('chat.impulseForecast.prepCooldown')}
          </li>
          <li className="text-[11px] leading-relaxed text-text-secondary">
            <span aria-hidden>🐘</span> {t('chat.impulseForecast.prepEmotion')}
          </li>
        </ul>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary" data-testid="impulse-forecast-note">
        {t('chat.impulseForecast.note')}
      </p>
    </aside>
  );
}
