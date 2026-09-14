'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Heart, Leaf, Package, ShoppingCart, Sprout } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { formatPrice } from '@/lib/product-card-format';
import { cn } from '@/lib/utils';
// 🌱 绿色优先链路: 词表评估 → 三档分类 → 稳定排序 (green-first-rank 组合层)
import { rankCardsByGreenLevel, type GreenRankedCard } from '@/lib/green-first-rank';
// 🌱 query 意图接线 (batch22-c note / batch25-c 分档): 搜索词含绿色意图 → 意图加成参与卡片分档；顶部另有独立引导语（只陈述查询事实，不参与分档）
import { queryHasGreenIntent } from '@/lib/green-rules';
// 🌱 绿色守护开关: 关闭时不评估不重排, 徽章/置顶/引导语整体静默 (设置页 Toggle, localStorage 持久化)
import { useGreenPref } from '@/hooks/use-green-pref';
import { GreenFirstNote } from './green-first-note';
import { GreenIntentNote } from './green-intent-note';
import type { ProductCardData } from '@/types/product-card';

const FAVORITES_KEY = 'symy-product-favorites';

function readFavorites(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    // safe to ignore: corrupted favorites storage degrades to empty set
    return new Set();
  }
}

export function ProductCards({ cards, query }: { cards: ProductCardData[]; query?: string }) {
  const { t } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const [imageFailed, setImageFailed] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [adding, setAdding] = useState<string | null>(null);

  // 绿色优先排序: high 在前、medium 次之、unknown 殿后, 同档保持原序 (价格/相关度序)。
  // 关闭绿色守护 → 整体静默: 不重排、无角标、无顶部引导语。
  const { ranked, hasHigh } = useMemo(
    () => rankCardsByGreenLevel(cards, greenPrefEnabled, query ?? ''),
    [cards, greenPrefEnabled, query],
  );

  const toggleFavorite = (card: ProductCardData) => {
    const next = new Set(favorites);
    if (next.has(card.product_ref)) next.delete(card.product_ref);
    else next.add(card.product_ref);
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
    } catch {
    }
  };

  const addToCart = async (card: ProductCardData) => {
    setAdding(card.product_ref);
    try {
      const response = await fetch('/api/hands/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'add',
          payload: {
            product_ref: card.product_ref,
            quantity: 1,
            title: card.title,
            price_cents: card.price_cents,
            currency: card.currency,
            marketplace_url: card.marketplace_url,
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.alert(t('chat.products.addedToCart'));
    } catch {
      window.alert(t('chat.products.addFailed'));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      {hasHigh ? <GreenFirstNote /> : null}
      {/* 🌱 query 意图 note: 只看搜索词本身, 与卡片分档独立; 守护关闭同静默; 排在优选 note 之后 */}
      {greenPrefEnabled && queryHasGreenIntent(query ?? '') ? <GreenIntentNote /> : null}
      <div className="grid gap-2 mt-3 mb-1 sm:grid-cols-2 min-[1800px]:grid-cols-3">
      {ranked.map(({ card, signal, level }: GreenRankedCard<ProductCardData>) => {
        const soldOut = card.in_stock === false;
        const favorite = favorites.has(card.product_ref);
        // 🌱 绿色守护关闭时 ranked 里 signal 全 undefined / level 全 unknown → 徽章与琥珀提醒整体静默
        const greenPick = level === 'high';
        // 绿色之选已给正向信号时不再叠加琥珀提醒（如"再生塑料"两词表同时命中）
        const greenerTip = !!signal?.non_green_flag && !greenPick;
        return (
          <article
            key={card.product_ref}
            className={cn(
              'overflow-hidden rounded-xl border border-glass-border bg-glass-fill backdrop-blur-sm text-left',
              soldOut && 'opacity-60 grayscale'
            )}
            aria-label={card.title}
          >
            <div className="relative aspect-square bg-white/5">
              {card.image_url && !imageFailed[card.product_ref] ? (
                <Image
                  src={card.image_url}
                  alt={card.title}
                  fill
                  sizes="200px"
                  className="object-cover"
                  unoptimized
                  onError={() => setImageFailed((prev) => ({ ...prev, [card.product_ref]: true }))}
                />
              ) : (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center"
                  aria-label="Package icon fallback"
                >
                  <Package className="w-8 h-8 text-text-tertiary" aria-hidden />
                  <span className="text-xs text-text-secondary line-clamp-2">{card.title}</span>
                </div>
              )}
              {soldOut ? (
                <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                  {t('chat.products.soldOut')}
                </span>
              ) : null}
              {card.compliance?.includes('ALCOHOL_CNY') ? (
                <span className="absolute top-2 right-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-black">
                  {t('chat.products.adultsOnly')}
                </span>
              ) : null}
            </div>

            <div className="space-y-2 p-2.5">
              <h4 className="text-xs font-medium leading-snug line-clamp-2">{card.title}</h4>
              {greenPick || greenerTip ? (
                <div className="flex flex-wrap gap-1">
                  {greenPick ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Leaf className="w-3 h-3" aria-hidden />
                      {t('chat.products.greenPick')}
                    </span>
                  ) : null}
                  {greenerTip ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Sprout className="w-3 h-3" aria-hidden />
                      {t('chat.products.greenerOptions')}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-2">
                <strong className="text-sm text-cyan-500 dark:text-cyan-300">{formatPrice(card, t('chat.products.priceSeeLink'))}</strong>
                {card.unit_label ? <span className="text-[10px] text-text-tertiary">{card.unit_label}</span> : null}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                <a
                  href={card.marketplace_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-lg bg-cyan-500/90 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:pointer-events-none"
                  onClick={(event) => {
                    if (!card.marketplace_url) event.preventDefault();
                  }}
                >
                  {t('chat.products.buy')}
                </a>
                <button
                  type="button"
                  onClick={() => addToCart(card)}
                  disabled={adding === card.product_ref}
                  className="flex items-center justify-center rounded-lg border border-glass-border px-2 py-1.5 text-[11px] hover:bg-white/10 disabled:opacity-50"
                  aria-label={t('chat.products.addToCart')}
                >
                  {adding === card.product_ref ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(card)}
                  className={cn(
                    'flex items-center justify-center rounded-lg border border-glass-border px-2 py-1.5 hover:bg-white/10',
                    favorite ? 'text-red-400' : 'text-text-secondary'
                  )}
                  aria-label={favorite ? t('chat.products.unfavorite') : t('chat.products.favorite')}
                >
                  <Heart className={cn('w-3.5 h-3.5', favorite && 'fill-current')} />
                </button>
              </div>
            </div>
          </article>
        );
      })}
      </div>
    </div>
  );
}
