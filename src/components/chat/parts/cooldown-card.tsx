'use client';

/**
 * CooldownCard — 24h 冷静卡 (反驳降温流, batch48-b)
 *
 * 用户顶回守护卡 ("我就要买") 时, 小象不硬拦: 降温回复气泡下方渲染本卡 —
 * 条目名 + "明天 HH:mm 小象来问你" 倒计时 + 两个动作:
 *   - 放进愿望单 → 写待回访记录 (localStorage, 次日回访条接棒)
 *   - 现在就要 → 同样写记录 (userChoseBuy=true, 次日回访直接走祝福语义)
 * 任一动作后卡片进入已确认态 (不重复写)。
 *
 * 视觉红线: 与 micro-challenge-card 同款中性 chat 卡底色 (不碰拦截卡配色);
 * 零金额 — 卡面只有品类与时间。绿色守护关闭时整卡静默。
 */

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { useGreenPref } from '@/hooks/use-green-pref';
import { savePendingCooldown } from '@/components/chat/parts/cooldown-store';
import type { CooldownCardData } from '@/types/cooldown';

const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000;

function itemLabel(data: CooldownCardData, t: ReturnType<typeof useI18n>['t']): string {
  return data.category
    ? t(`chat.cooldown.itemName.${data.category}`)
    : t('chat.cooldown.itemGeneric');
}

export function CooldownCard({ data }: { data: CooldownCardData }) {
  const { t } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const [confirmed, setConfirmed] = useState<'wishlist' | 'buy' | null>(null);

  if (!greenPrefEnabled) return null;

  const act = (userChoseBuy: boolean) => {
    if (confirmed) return; // 防连点重复写记录
    setConfirmed(userChoseBuy ? 'buy' : 'wishlist');
    savePendingCooldown({
      category: data.category,
      askedAt: Date.now(),
      dueAt: Date.now() + COOLDOWN_DURATION_MS,
      userChoseBuy,
    });
  };

  // "明天 HH:mm" = 卡片渲染时刻 + 24h (与记录的 dueAt 同步长, 展示层近似即可)
  const followupTime = new Date(Date.now() + COOLDOWN_DURATION_MS)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm p-3"
      aria-label={t('chat.cooldown.title')}
      data-testid="cooldown-card"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
        <span aria-hidden>🐘</span>
        <span>{t('chat.cooldown.title')}</span>
      </h4>

      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        {itemLabel(data, t)} · {t('chat.cooldown.followupAt', { time: followupTime })}
      </p>

      <div className="mt-2 border-t border-glass-border pt-2">
        {confirmed ? (
          <p className="text-[11px] font-medium text-text-secondary" data-testid="cooldown-confirmed-note">
            {confirmed === 'buy' ? t('chat.cooldown.buyDoneNote') : t('chat.cooldown.wishlistDoneNote')}
          </p>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => act(false)}
              className="flex-1 rounded-lg border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:border-emerald-500/30"
              data-testid="cooldown-wishlist-button"
            >
              {t('chat.cooldown.wishlistButton')}
            </button>
            <button
              type="button"
              onClick={() => act(true)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
              data-testid="cooldown-buy-button"
            >
              {t('chat.cooldown.buyButton')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
