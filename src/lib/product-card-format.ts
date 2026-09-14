import type { ProductCardData } from '@/types/product-card';

export function formatPrice(card: ProductCardData, zeroPriceLabel: string): string {
  if (card.price_cents_display) return card.price_cents_display;
  if (card.price_cents === 0) return zeroPriceLabel;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: card.currency || 'CNY' })
    .format(card.price_cents / 100);
}
