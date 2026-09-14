'use client';

/**
 * GreenFirstNote — 搜索结果顶部轻引导语
 *
 * 只在结果中确有 high 档绿色商品时由 ProductCards 渲染（hasHigh 控制）；
 * 没有绿色选项就不提示 — 引导不说教（PRODUCT-DOCTRINE：荣誉框架非羞耻框架）。
 * 文案走 i18n（chat.products.greenFirstNote，zh+en 双语）。
 */

import { Leaf } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export function GreenFirstNote() {
  const { t } = useI18n();
  return (
    <p className="flex items-center gap-1 mt-3 mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Leaf className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {t('chat.products.greenFirstNote')}
    </p>
  );
}
