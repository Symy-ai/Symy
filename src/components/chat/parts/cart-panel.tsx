"use client";

/**
 * ChatCartPanel — Chat 内购物车面板 (owner 09-06: chat tab 内跳转购物车入口)
 *
 * 底部抽屉: 调 /api/hands/cart (list/remove/checkout) — 服务端透传 hands.symy.ai。
 * 金额显示遵循自由时间铁律? 不 — 购物车是"将要花的钱"语境, 保留原价显示
 * (它是消费场景不是守护成果场景; 里程碑是金额+绿色提示)。
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Leaf, ShoppingCart, Sprout, Trash2, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { evaluateGreenSignal, GREEN_SCORE_BADGE_THRESHOLD } from '@/lib/green-rules';
import { formatFreedomTime, moneyToHours } from '@/lib/freedom-time';
import { formatCurrency } from '@/lib/format';
import { logger } from '@/lib/logger';
import { useGreenPref } from '@/hooks/use-green-pref';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { CheckoutConfirmModal } from './checkout-confirm-modal';
import { CheckoutSuccessPanel } from './checkout-success-panel';

interface CartLine {
  product_ref: string;
  title: string;
  qty: number;
  price_cents: number;
  image_url?: string;
  marketplace_url?: string;
}

interface CheckoutSnapshot {
  greenCount: number;
  totalHours: string;
}

// route 502 细分码 (契约见 /api/hands/cart route.ts) — 前端据此选文案
type HandsCartFailureCode = 'HANDS_AUTH_FAILED' | 'HANDS_UNAVAILABLE';

function handsFailureCode(err: unknown): HandsCartFailureCode {
  const code = err && typeof err === 'object' && 'body' in err
    ? (err as { body?: { code?: unknown } }).body?.code
    : undefined;
  return code === 'HANDS_AUTH_FAILED' ? 'HANDS_AUTH_FAILED' : 'HANDS_UNAVAILABLE';
}

export function ChatCartPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { greenPrefEnabled } = useGreenPref();
  const { hourlyRate } = useHourlyRate();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [loading, setLoading] = useState(false);
  // 🔧 P1 修复: 区分「购物车是空的」vs「购物车暂时连不上」— 不再把失败伪装成空车
  // 🔧 batch74-a: 再区分 upstream 401 (secret 配置错, 管理员已收到 Sentry 通知) 与一般不可达
  const [loadFailedCode, setLoadFailedCode] = useState<HandsCartFailureCode | null>(null);
  // checkout 流程状态
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState<CheckoutSnapshot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [removeConfirmRef, setRemoveConfirmRef] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ ok?: boolean; data?: { cart_lines?: CartLine[]; cart_total_cents?: number }; error?: string }>('/api/hands/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      if (data?.ok === false) {
        // upstream 解包成功但业务层失败 (ok:false) — 同样视为不可达
        setLoadFailedCode('HANDS_UNAVAILABLE');
        setLines([]);
      } else {
        setLines(data?.data?.cart_lines ?? []);
        setTotalCents(data?.data?.cart_total_cents ?? 0);
        setLoadFailedCode(null);
      }
    } catch (err) {
      logger.warn('[ChatCart] list failed:', err instanceof Error ? err.message : String(err));
      setLoadFailedCode(handsFailureCode(err));
      setLines([]);
      setTotalCents(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const remove = async (productRef: string) => {
    try {
      await apiFetch('/api/hands/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', item: { product_ref: productRef, qty: 0 } }),
      });
      setCartError(null);
      await load();
    } catch (err) {
      // safe to ignore: failed remove keeps stale list; next open refreshes
      logger.warn('[ChatCart] remove failed:', err instanceof Error ? err.message : String(err));
      setCartError(t('chat.cart.removeFailed'));
    }
  };

  const checkout = async () => {
    setCheckoutSubmitting(true);
    try {
      await apiFetch('/api/hands/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout' }),
      });
      const greenCount = lines.filter((line) => (
        greenPrefEnabled && evaluateGreenSignal(line.title, [line])[0].green_score >= GREEN_SCORE_BADGE_THRESHOLD
      )).length;
      setLines([]);
      setTotalCents(0);
      setCartError(null);
      setCheckoutSuccess({
        greenCount,
        totalHours: formatFreedomTime(moneyToHours(totalCents / 100, hourlyRate), locale),
      });
      setToastVisible(true);
      window.setTimeout(() => setToastVisible(false), 1500);
      setCheckoutOpen(false);
    } catch (err) {
      const errorCode = err && typeof err === 'object' && 'body' in err
        ? (err as { body?: { code?: unknown } }).body?.code
        : undefined;
      setCartError(errorCode === 'CART_EMPTY' ? t('chat.cart.emptyCheckout') : t('chat.cart.checkoutFailed'));
      setCheckoutOpen(false);
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  if (!open) return null;

  const fmt = (cents: number) => formatCurrency(cents / 100);
  const hasNonGreenLine = greenPrefEnabled && lines.some((line) => evaluateGreenSignal(line.title, [line])[0].non_green_flag);
  const greenCount = lines.filter((line) => (
    greenPrefEnabled && evaluateGreenSignal(line.title, [line])[0].green_score >= GREEN_SCORE_BADGE_THRESHOLD
  )).length;

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-1 rounded-t-3xl flex flex-col max-h-[70vh] animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-glass-border">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            {t('chat.cart.title', { defaultValue: '购物车 / Cart' })}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2">
          {loading && <p className="text-xs text-text-tertiary text-center py-6">…</p>}
          {!loading && lines.length === 0 && (checkoutSuccess ? (
            <CheckoutSuccessPanel greenCount={checkoutSuccess.greenCount} totalHours={checkoutSuccess.totalHours} toastVisible={toastVisible} />
          ) : loadFailedCode ? (
            <p className="text-xs text-text-tertiary text-center py-8">
              {loadFailedCode === 'HANDS_AUTH_FAILED' ? t('chat.cart.adminNotified') : t('chat.cart.unreachable')}
            </p>
          ) : (
            <p className="text-xs text-text-tertiary text-center py-8">{t('chat.cart.empty', { defaultValue: '购物车还是空的——和小象聊聊想买什么吧' })}</p>
          ))}
          {lines.map((l) => {
            const signal = evaluateGreenSignal(l.title, [l])[0];
            const greenPick = greenPrefEnabled && signal.green_score >= GREEN_SCORE_BADGE_THRESHOLD;
            const greenerHint = greenPrefEnabled && signal.non_green_flag && !greenPick;
            return (
              <div key={l.product_ref} className="flex items-center gap-3 rounded-xl border border-glass-border bg-glass-fill p-2.5">
                {l.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote hands image, unoptimized
                  <img src={l.image_url} alt="" className="w-11 h-11 rounded-lg object-cover bg-white/5" />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-white/5 flex items-center justify-center"><ShoppingCart className="w-4 h-4 text-text-tertiary" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{l.title}</p>
                  <p className="text-[10px] text-text-tertiary">×{l.qty}</p>
                  {greenPrefEnabled && (
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {t('chat.cart.hoursBadge', { hours: formatFreedomTime(moneyToHours((l.price_cents * l.qty) / 100, hourlyRate), locale) })}
                    </p>
                  )}
                  {greenPick && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Leaf className="w-3 h-3" aria-hidden />
                      {t('chat.cart.greenPick')}
                    </span>
                  )}
                  {greenerHint && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Sprout className="w-3 h-3" aria-hidden />
                      {t('chat.cart.greenerHint')}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-emerald-400">{fmt(l.price_cents * l.qty)}</p>
                {removeConfirmRef === l.product_ref ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-text-tertiary">{t('chat.cart.removeConfirm')}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void remove(l.product_ref)}
                        className="rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold text-white"
                      >
                        {t('chat.cart.removeYes')}
                      </button>
                      <button onClick={() => setRemoveConfirmRef(null)} className="rounded-full border border-glass-border px-2 py-1 text-[10px] font-semibold text-text-secondary">
                        {t('chat.cart.removeNo')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setRemoveConfirmRef(l.product_ref)}
                    className="text-text-tertiary hover:text-red-400 transition-colors"
                    aria-label={t('chat.cart.remove')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {lines.length > 0 && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-glass-border">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-tertiary">{t('chat.cart.total')}</span>
              <span className="text-sm font-bold text-emerald-400">{fmt(totalCents)}</span>
            </div>
            {greenPrefEnabled && (
              <p className="mt-1 text-right text-[10px] text-text-tertiary">
                {t('chat.cart.totalHoursBadge', { hours: formatFreedomTime(moneyToHours(totalCents / 100, hourlyRate), locale) })}
              </p>
            )}
            {hasNonGreenLine && (
              <p className="mt-1 text-[10px] text-text-tertiary">{t('chat.cart.nonGreenOrderHint')}</p>
            )}
            <button
              onClick={() => setCheckoutOpen(true)}
              className="mt-3 w-full rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
            >
              {t('chat.cart.checkout')}
            </button>
          </div>
        )}
        {cartError && <p className="px-4 py-2 text-center text-xs text-red-400">{cartError}</p>}
      </div>
      {checkoutOpen && (
        <CheckoutConfirmModal
          greenCount={greenCount}
          nonGreenCount={lines.length - greenCount}
          total={fmt(totalCents)}
          totalHours={formatFreedomTime(moneyToHours(totalCents / 100, hourlyRate), locale)}
          submitting={checkoutSubmitting}
          onConfirm={() => void checkout()}
          onCancel={() => setCheckoutOpen(false)}
        />
      )}
    </div>,
    document.body
  );
}
