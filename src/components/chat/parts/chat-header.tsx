'use client';

/**
 * ChatHeader — Chat tab header (owner 09-06: chat is now a primary tab).
 *
 * Contains: cart button (opens ChatCartPanel bottom sheet) + children (banners).
 */

import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { ChatCartPanel } from './cart-panel';

export interface ChatHeaderProps {
  buddyState?: unknown;
  health?: unknown;
  accentClass?: string;
  gradientClass?: string;
  children?: React.ReactNode;
}

export function ChatHeader({ children }: ChatHeaderProps) {
  const { t } = useI18n();
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="relative z-10 px-4 pt-4 pb-2 border-b border-glass-border backdrop-blur-xl bg-surface-1/60">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          🐘 Symy
        </span>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-label={t('chat.cart.title', { defaultValue: 'Cart' })}
          className="flex items-center gap-1.5 rounded-full border border-glass-border bg-glass-fill px-3 py-1.5 text-[11px] font-medium text-text-secondary hover:text-emerald-300 hover:border-emerald-300/40 transition-colors"
        >
          <ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />
          {t('chat.cart.button', { defaultValue: '购物车' })}
        </button>
      </div>
      {children}
      <ChatCartPanel open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
