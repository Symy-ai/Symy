'use client';

/**
 * AltFootprintCard — "我的替代足迹"卡 (batch55-c)
 *
 * 用户在 chat 里召回自己的替代足迹 (alt-footprint-intent 命中, 服务端
 * adoption 聚合样本足够) 时, ChatBubble 在 AI 回复气泡下方渲染此卡:
 * 累计次数 / 最近 30 天 / 覆盖域数 / Top-3 替代名 + 小象一句点评。
 *
 * 红线:
 * - 分享/荣誉面 amount-free: public 结构只有计数与替代名
 *   (altFootprintShareLines 是分享面唯一取数口, 类型保证无金额);
 * - 累计估算节省 (private.savedEstimate > 0 时) 只渲染在 App 内私享区,
 *   带 "仅自己可见" 标注, 永不进分享/荣誉面;
 * - 足迹少时不渲染此卡 (样本不足在服务端已降级), 非羞辱。
 * 纯展示卡: 无跳转, 无购物链接。
 */

import { Footprints, Leaf } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { AltFootprintCardData } from '@/types/alt-footprint';

/**
 * 分享面取数口 — 只输出 public 子集 (结构上拿不到金额, 与
 * monthly-guard-statement 的 public/private 分离同款)。
 */
export function altFootprintShareLines(data: AltFootprintCardData): {
  totalAdoptions: number;
  last30Days: number;
  categoriesCovered: number;
  topLabels: string[];
} {
  return {
    totalAdoptions: data.public.totalAdoptions,
    last30Days: data.public.last30Days,
    categoriesCovered: data.public.categoriesCovered,
    topLabels: data.public.topEntries.map((e) => e.label),
  };
}

export function AltFootprintCard({ data }: { data: AltFootprintCardData }) {
  const { t, locale } = useI18n();
  const pub = data.public;
  const commentKey = pub.totalAdoptions >= 10 ? 'chat.altFootprint.commentDefault' : 'chat.altFootprint.commentSteady';
  const saved = data.private.savedEstimate;
  const savedText = saved > 0
    ? (locale === 'zh' ? `¥${Math.round(saved)}` : `$${Math.round(saved)}`)
    : null;

  return (
    <aside
      className="mt-3 rounded-xl border border-emerald-500/20 bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.altFootprint.title')}
      data-testid="alt-footprint-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>🐘</span>
        <span>{t('chat.altFootprint.title')}</span>
      </h4>

      {/* 次数 / 窗口 / 覆盖域 — 纯计数, 无金额 */}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary" data-testid="alt-footprint-stats">
        <span>{t('chat.altFootprint.totalLabel', { count: pub.totalAdoptions })}</span>
        <span>{t('chat.altFootprint.recentLabel', { count: pub.last30Days })}</span>
        <span>{t('chat.altFootprint.coveredLabel', { count: pub.categoriesCovered })}</span>
      </div>

      {/* Top-3 替代名 (词条表解析的显示名) */}
      {pub.topEntries.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="alt-footprint-top-entries">
          {pub.topEntries.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5 text-xs text-text-primary">
              <Leaf className="h-3 w-3 flex-shrink-0 text-emerald-500" aria-hidden />
              <span>
                {entry.label}
                <span className="ml-1 text-text-secondary">{t('chat.altFootprint.entryCount', { count: entry.count })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 小象一句点评 — 身份故事: "我是会选替代的人", 非绩效复盘 */}
      <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80">
        <Footprints className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
        <span>{t(commentKey)}</span>
      </p>

      {/* App 内私享区: 累计估算节省一句 — 仅自己可见, 永不进分享/荣誉面 */}
      {savedText && (
        <p className="mt-2 border-t border-glass-border pt-2 text-[11px] text-text-secondary" data-testid="alt-footprint-private-saved">
          {t('chat.altFootprint.privateSavedNote', { amount: savedText })}
          <span className="ml-1 opacity-70">{t('chat.altFootprint.privateTag')}</span>
        </p>
      )}
    </aside>
  );
}
