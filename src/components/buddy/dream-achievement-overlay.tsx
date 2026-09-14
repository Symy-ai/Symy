'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, Share2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { formatCurrency } from '@/lib/format';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { ShareModal } from '@/components/share/share-modal';
import type { DreamFund } from '@/types/buddy-state';

interface DreamAchievementOverlayProps {
  fund: DreamFund | null;
  onClose: () => void;
}

export function DreamAchievementOverlay({ fund, onClose }: DreamAchievementOverlayProps) {
  const { t, locale } = useI18n();
  const { hourlyRate } = useHourlyRate();
  const [displayedFund, setDisplayedFund] = useState<DreamFund | null>(null);
  const [hiding, setHiding] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!fund) return;
    setDisplayedFund(fund);
    setHiding(false);
    setFadingOut(false);
    setShareOpen(false);
  }, [fund]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFadingOut(true);
    setHiding(true);
    onClose();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDisplayedFund(null);
      setHiding(false);
      setFadingOut(false);
    }, 400);
  }, [onClose]);

  useEffect(() => {
    if (!displayedFund || shareOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayedFund, shareOpen, handleClose]);

  if (!displayedFund || hiding) return null;
  const savedHours = moneyToFreedomLabel(displayedFund.current / 100, locale, hourlyRate);

  return (
    <>
      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          data-testid="dream-achievement-overlay"
          onClick={handleClose}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden px-6 text-center transition-opacity duration-400"
          style={{
            background: 'radial-gradient(ellipse at 50% 28%, #1d4a35 0%, #143527 55%, #0c2017 100%)',
            opacity: fadingOut ? 0 : 1,
            pointerEvents: fadingOut ? 'none' : 'auto',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-w-md flex-col items-center py-10"
            style={{ animation: 'stage-up-card-in 0.55s var(--ease-spring) backwards' }}
          >
            <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-300/70">
              {t('buddy.dreamAchieve.title', { defaultValue: 'Dream reached' })}
            </p>
            <div className="relative mt-7 flex h-32 w-32 items-center justify-center rounded-full border border-yellow-300/40 bg-[#0c2017]/70 shadow-2xl">
              <span role="img" aria-hidden="true" className="select-none text-6xl leading-none">🏅</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-emerald-50" data-testid="dream-achievement-fund">{displayedFund.name}</h2>
            <p className="mt-3 max-w-xs text-base leading-relaxed text-emerald-100/90">
              {t('buddy.dreamAchieve.subtitle', { defaultValue: 'We guarded it into being together!' })}
            </p>
            <p className="mt-4 text-xl font-bold text-yellow-200" data-testid="dream-achievement-hours">
              {savedHours}
            </p>
            <div
              className="mt-5 flex items-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2"
              data-testid="dream-achievement-amount"
            >
              <EyeOff className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              <span className="text-sm font-semibold text-emerald-300">
                {t('buddy.dreamAchieve.amountLabel', { defaultValue: 'Actually saved' })}: {formatCurrency(displayedFund.current / 100)}
              </span>
            </div>
            <div className="mt-7 flex items-center gap-3">
              <button
                type="button"
                data-testid="dream-achievement-share"
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-yellow-400 px-5 py-3 text-sm font-bold text-[#0c2017] transition-all hover:from-emerald-400 hover:to-yellow-300 active:scale-[0.98]"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {t('buddy.dreamAchieve.shareButton', { defaultValue: 'Share this moment' })}
              </button>
              <button
                type="button"
                data-testid="dream-achievement-close"
                onClick={handleClose}
                className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-emerald-100 transition-colors hover:border-emerald-300/40"
              >
                {t('buddy.dreamAchieve.closeLabel', { defaultValue: 'Keep going' })}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        zIndexClass="z-[10000]"
        medal={{ itemTitle: displayedFund.name, savedCents: Math.round(displayedFund.current), userName: '', date: new Date().toISOString() }}
      />
    </>
  );
}
