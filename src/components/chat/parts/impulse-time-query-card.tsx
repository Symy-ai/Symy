'use client';

/**
 * ImpulseTimeCard — "我晚上冲动买的多吗" 时段问答卡 (batch58-c)
 *
 * 用户问自己的冲动购买落在哪个时段 (晚上/深夜…) 命中时段问句轮时, 小象
 * 回复气泡下方渲染本卡: 时间窗 + 该时段次数 + 覆盖天数 + 总量对照。
 * 数字复用 48-c aggregateImpulseWindows 分桶 (本地时区)。
 *
 * 红线:
 * - 数字由服务端聚合 lib 算好随卡带来, 本组件零计算零请求
 * - 只报次数/天数/总量 — 零金额零碳数值; 本卡无分享面
 * - 样本不足 (insufficient) 渲染 "还没攒够数据" 引导态, 不造伪规律
 * - 非羞辱框架: 看见规律是给自己多一分自由, 不是认罪
 */

import { useI18n } from '@/i18n/provider';
import type { ImpulseTimeCardData } from '@/types/dimension-query';

export function ImpulseTimeCard({ data }: { data: ImpulseTimeCardData }) {
  const { t } = useI18n();

  const windowLabel = t(`chat.savingsQuery.window.${data.window}`);
  const impulseLabel = t(`chat.impulseTimeQuery.window.${data.impulseWindow}`);

  if (data.status === 'insufficient') {
    return (
      <aside
        className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
        aria-label={t('chat.impulseTimeQuery.title')}
        data-testid="impulse-time-card"
        data-status="insufficient"
      >
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <span aria-hidden>🐘</span>
          <span>{t('chat.impulseTimeQuery.title')}</span>
          <span className="text-text-secondary">{impulseLabel}</span>
        </h4>
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary" data-testid="impulse-time-empty">
          {t('chat.impulseTimeQuery.insufficient')}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.impulseTimeQuery.title')}
      data-testid="impulse-time-card"
      data-status="ok"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.impulseTimeQuery.title')}</span>
        <span className="text-text-secondary">{impulseLabel} · {windowLabel}</span>
      </h4>

      <ul className="mt-2 space-y-1.5" data-testid="impulse-time-lines">
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="impulse-time-count">
          <span className="text-text-primary">{t('chat.impulseTimeQuery.lineCountLabel')}</span>
          {t('chat.impulseTimeQuery.lineCount', { count: String(data.count), days: String(data.days) })}
        </li>
        <li className="text-[11px] leading-relaxed text-text-secondary" data-testid="impulse-time-total">
          <span className="text-text-primary">{t('chat.impulseTimeQuery.lineTotalLabel')}</span>
          {t('chat.impulseTimeQuery.lineTotal', { total: String(data.total) })}
        </li>
        <li className="text-[11px] leading-relaxed text-text-tertiary" data-testid="impulse-time-note">
          {data.count === 0 ? t('chat.impulseTimeQuery.noteZero') : t('chat.impulseTimeQuery.noteSeen')}
        </li>
      </ul>
    </aside>
  );
}
