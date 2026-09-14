'use client';

/**
 * ReuseHintCard — 复用优先建议卡 ("🔁 先看看已有的")
 *
 * 聊天助手消息内的复用卡, 与商品卡的绿色徽章同一套 emerald 视觉:
 * 服务端预检命中复用类目 → SSE 带 reuse_hint 事件 → ChatBubble 渲染本卡。
 * 独立组件 (不依赖 green-alt 卡 — 那是 23-b 车道的产出, 不在 main 上)。
 *
 * 卡内四段:
 *   1. 标题 (i18n chat.reuseHint.title) + 类目徽章 (payload categoryLabel)
 *   2. 荣誉框架建议列表 (payload suggestions: 二手/租赁/已有物品组合)
 *   3. 省钱=里子: 「约省 X 小时自由时间」(payload hoursLabel, 服务端已按
 *      moneyToFreedomLabel 换算, 本组件不重复换算)
 *   4. 荣誉注脚 (payload reuseHonestNote, 缺失时回落 i18n)
 *
 * 不跳转、无链接。🌱 绿色守护开关关闭时整卡静默 (服务端已按同一开关
 * 不发事件, 这里是客户端兜底防御, 与商品卡绿色徽章同语义)。
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useGreenPref } from '@/hooks/use-green-pref';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { shouldShowAdoptConfirm } from '@/lib/guard-intensity';
import { isReuseAdoptionReported, reportReuseAdoption } from '@/components/chat-parts/reuse-adoption';
import type { ReuseHint } from '@/lib/reuse-advisor';

export function ReuseHintCard({ hint }: { hint: ReuseHint }) {
  const { t } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const { guardIntensity } = useGuardIntensity();
  const [adopted, setAdopted] = useState(false);

  useEffect(() => {
    // 跨会话去重: localStorage 已上报过的类目直接进已确认态
    if (isReuseAdoptionReported(hint.category)) setAdopted(true);
  }, [hint.category]);

  const handleAdopt = async () => {
    if (adopted) return;
    setAdopted(true); // 先进已确认态防连点重复上报 (本地 + API 双层幂等)
    await reportReuseAdoption(hint.category);
  };
  // 绿色守护关闭 → 复用卡整体静默 (与服务端 guard-off 不注入同纪律)
  if (!greenPrefEnabled) return null;

  const title = t('chat.reuseHint.title', { defaultValue: '🔁 Check what you already have' });

  return (
    <aside
      data-testid="reuse-hint-card"
      aria-label={title}
      className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 backdrop-blur-sm"
    >
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <span>{title}</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium">
          {hint.categoryLabel}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {hint.suggestions.map((line) => (
          <li key={line} className="flex gap-1.5 text-xs leading-relaxed text-text-secondary">
            <span aria-hidden className="mt-px text-emerald-500/70">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {/* 省钱=里子: 省下的钱换算成自由时间呈现 (服务端换算, 这里只展示) */}
      {hint.hoursLabel ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span aria-hidden>⏳</span>
          <span>{hint.hoursLabel}</span>
        </p>
      ) : null}
      {/* 采纳确认 (batch56-c): 复用轨画像数据源; 与 green-alt 卡同款轻量次级动作,
          gentle 档整体隐藏 (与 green-alt 采纳行同纪律) */}
      {shouldShowAdoptConfirm(guardIntensity) && (
        <div className="mt-2 border-t border-emerald-500/15 pt-2">
          {adopted ? (
            <p
              className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
              data-testid="reuse-adopted-note"
            >
              <Check className="h-3 w-3" aria-hidden />
              <span>{t('chat.reuseHint.adoptedNote')}</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleAdopt}
              className="w-full rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-emerald-500/30 hover:text-text-primary"
              data-testid="reuse-adopt-button"
            >
              {t('chat.reuseHint.adoptButton')}
            </button>
          )}
        </div>
      )}
      {hint.reuseHonestNote ? (
        <p className="mt-1.5 border-t border-emerald-500/15 pt-1.5 text-[10px] leading-relaxed text-text-tertiary">
          {hint.reuseHonestNote}
        </p>
      ) : (
        <p className="mt-1.5 border-t border-emerald-500/15 pt-1.5 text-[10px] leading-relaxed text-text-tertiary">
          {t('chat.reuseHint.honestNote', { defaultValue: "You're doing it right." })}
        </p>
      )}
    </aside>
  );
}
