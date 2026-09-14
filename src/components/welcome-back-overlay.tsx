'use client';

/**
 * WelcomeBackOverlay — 回归欢迎全屏时刻
 *
 * 面子: 小象欢迎回来 + 守护者段位还在;
 * 里子: 累计赢回自由小时 + 一键 CTA 重新守护.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { getGuardRank, type GuardRankStats } from '@/lib/guard-rank';
import { moneyToFreedomLabel } from '@/lib/freedom-time';

export interface WelcomeBackOverlayProps {
  /** 小象形象图 (可选) */
  elephantImageSrc?: string;
  /** 累计守护金额 — 用于自由小时换算 */
  totalSaved: number;
  /** 时薪, 默认 DEFAULT_HOURLY_RATE */
  hourlyRate?: number;
  /** 段位统计 (可选); 缺省时不渲染段位行 */
  guardRankStats?: GuardRankStats;
  /** 关闭后回调 */
  onClose: () => void;
  /** CTA 点击 — 默认跳转到挑战对话 */
  onNavigateChat?: () => void;
  /** 是否为 demo 模式 */
  isDemo?: boolean;
}

export function WelcomeBackOverlay({
  elephantImageSrc,
  totalSaved,
  hourlyRate,
  guardRankStats,
  onClose,
  onNavigateChat,
}: WelcomeBackOverlayProps) {
  const { t, locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [closed, setClosed] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setFadingOut(true);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      setClosed(true);
      setFadingOut(false);
      onClose();
    }, 400);
  }, [onClose]);

  const handleCta = useCallback(() => {
    handleClose();
    if (onNavigateChat) onNavigateChat();
  }, [handleClose, onNavigateChat]);

  if (!mounted || closed) return null;

  const rank = guardRankStats ? getGuardRank(guardRankStats) : null;
  const hoursLabel = moneyToFreedomLabel(totalSaved, locale, hourlyRate);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'var(--surface-1)',
        pointerEvents: fadingOut ? 'none' : 'auto',
      }}
      onClick={handleClose}
      role='button'
      className={`flex items-center justify-center transition-opacity duration-400 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="w-full h-full max-w-md mx-auto flex flex-col items-center justify-center px-8 py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-glass-fill/60 border border-glass-border flex items-center justify-center mb-6 overflow-hidden">
          {elephantImageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={elephantImageSrc} alt="" className="w-14 h-14" />
          ) : (
            <span className="text-4xl">🐘</span>
          )}
        </div>

        <p className="text-2xl font-semibold text-text-primary mb-3">
          {t('welcomeBack.eyebrow')}
        </p>
        <p className="text-sm text-text-tertiary mb-10">
          {t('welcomeBack.subtitle')}
        </p>

        <div className="w-16 h-px bg-glass-border mb-10" />

        {rank && (
          <div className="mb-8">
            <p className="text-sm text-text-tertiary mb-1">
              {t('welcomeBack.rankStillThere')}
            </p>
            <p className="text-base text-text-primary font-medium">
              <span className="mr-1">{rank.emoji}</span>
              <span>{t(`profile.guardRank.${rank.id}`, { defaultValue: rank.id })}</span>
            </p>
          </div>
        )}

        <p className="text-sm text-text-tertiary mb-2">
          {t('welcomeBack.ledgerLine', { hours: hoursLabel })}
        </p>

        <div className="flex-1 min-h-8" />

        <div className="w-16 h-px bg-glass-border mb-8" />

        <button
          onClick={handleCta}
          className="px-8 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer border border-glass-border rounded-full hover:border-glass-border-strong bg-glass-fill/50"
        >
          {t('welcomeBack.cta')}
        </button>
      </div>
    </div>,
    document.body
  );
}
