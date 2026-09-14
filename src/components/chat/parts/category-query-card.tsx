'use client';

/**
 * CategoryQueryCard — "这个月奶茶拦截了几次" 分类问答卡 (batch58-c)
 *
 * 用户在 chat 里问某一类的守护明细 (奶茶/外卖→food, 衣服→clothing…) 命中
 * 分类问句轮时, 小象回复气泡下方渲染本卡: 时间窗 + 该类拦截次数 + 该类
 * 替代/复用采纳次数。次数为 0 也如实展示 (该类还没拦过, 不是坏事)。
 *
 * 红线:
 * - 数字由服务端聚合 lib (aggregateCategoryGuardCounts) 算好随卡带来,
 *   本组件零计算零请求
 * - 无数据窗 (noData) 渲染引导态, 不造 0 结论, 不羞辱
 * - 零金额零碳数值; 本卡无分享面
 * - 措辞永远是 "守住了几次" 的庆祝框架, 不渲染成 "败了多少次"
 */

import { useI18n } from '@/i18n/provider';
import type { CategoryQueryCardData } from '@/types/dimension-query';

export function CategoryQueryCard({ data }: { data: CategoryQueryCardData }) {
  const { t } = useI18n();

  const windowLabel = t(`chat.savingsQuery.window.${data.window}`);
  const categoryLabel = t(`chat.categoryQuery.category.${data.category}`);

  if (data.status === 'noData') {
    return (
      <aside
        className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
        aria-label={t('chat.categoryQuery.title')}
        data-testid="category-query-card"
        data-status="noData"
      >
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <span aria-hidden>🐘</span>
          <span>{t('chat.categoryQuery.title')}</span>
          <span className="text-text-secondary">{windowLabel}</span>
        </h4>
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="category-query-empty">
          {t('chat.categoryQuery.empty')}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.categoryQuery.title')}
      data-testid="category-query-card"
      data-status="ok"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.categoryQuery.title')}</span>
        <span className="text-text-secondary">{categoryLabel} · {windowLabel}</span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="category-query-lines">
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="category-query-intercepts">
          <span className="text-text-primary">{t('chat.categoryQuery.lineInterceptsLabel')}</span>
          {t('chat.categoryQuery.lineIntercepts', { count: String(data.intercepts) })}
        </li>
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="category-query-adoptions">
          <span className="text-text-primary">{t('chat.categoryQuery.lineAdoptionsLabel')}</span>
          {t('chat.categoryQuery.lineAdoptions', {
            alt: String(data.altAdoptions),
            reuse: String(data.reuseAdoptions),
          })}
        </li>
        <li className="text-[11px] leading-relaxed text-text-tertiary" data-testid="category-query-note">
          {data.intercepts === 0 && data.altAdoptions === 0 && data.reuseAdoptions === 0
            ? t('chat.categoryQuery.noteZero')
            : t('chat.categoryQuery.noteCheer')}
        </li>
      </ul>
    </aside>
  );
}
