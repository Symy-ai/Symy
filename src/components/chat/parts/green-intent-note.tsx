'use client';

/**
 * GreenIntentNote — 搜索词绿色意图轻引导语
 *
 * 只在用户查询本身命中绿色词表时由 ProductCards 渲染（queryHasGreenIntent 控制）。
 * 与卡片分档完全独立 — 不加分/徽章/重排（反造假立场：引导语只陈述查询事实，不谎报卡片）。
 * 没有绿色意图就不提示。绿色守护关闭时同样静默。文案走 i18n（chat.products.greenIntentNote）。
 */

import { Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export function GreenIntentNote() {
  const { t } = useI18n();
  return (
    <p className="flex items-center gap-1 mt-1 mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Sprout className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {t('chat.products.greenIntentNote')}
    </p>
  );
}
