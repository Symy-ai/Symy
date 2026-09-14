'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { formatFreedomTime } from '@/lib/freedom-time';
import { useI18n } from '@/i18n/provider';

interface PublicInviteStats {
  found: boolean;
  displayName?: string | null;
  intercepts?: number;
  guardDays?: number;
  freedomHours?: number;
}

function readRefCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('ref')
      ?? localStorage.getItem('symy_ref_code');
  } catch {
    // safe to ignore: ref discovery is best-effort; the landing renders its default hero
    return null;
  }
}

export function LandingRefHero({ isAuthenticated }: { isAuthenticated: boolean }) {
  const locale = useLocale();
  const { t } = useI18n();
  const [stats, setStats] = useState<PublicInviteStats | null>(null);

  useEffect(() => {
    if (isAuthenticated) return;
    const refCode = readRefCode();
    if (!refCode) return;
    const controller = new AbortController();

    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- timeout-guarded progressive enhancement; no hero means normal landing
    apiFetch<PublicInviteStats>(`/api/invite/public-stats?ref=${encodeURIComponent(refCode)}`, {
      signal: controller.signal,
      timeoutMs: 2_000,
      dedupe: false,
    })
      .then((result) => {
        if (!controller.signal.aborted && result.found) setStats(result);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [isAuthenticated]);

  if (!stats) return null;

  const friendName = stats.displayName?.trim();
  const metrics = [
    { value: `${Math.max(0, stats.intercepts ?? 0)}`, label: t('landing.refHero.intercepts', { defaultValue: 'Guards' }) },
    { value: `${Math.max(0, stats.guardDays ?? 0)}`, label: t('landing.refHero.guardDays', { defaultValue: 'Days guarded' }) },
    { value: formatFreedomTime(stats.freedomHours ?? 0, locale), label: t('landing.refHero.freedomHours', { defaultValue: 'Freedom won back' }) },
  ];

  return (
    <section
      data-testid="landing-ref-hero"
      className="relative mb-10 w-full overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-purple-500/10 p-5 text-left shadow-[0_18px_60px_-30px_rgba(16,185,129,0.7)]"
    >
      <div className="absolute inset-x-0 -top-24 h-40 bg-emerald-400/20 blur-3xl" />
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-500 dark:text-emerald-400">
          {t('landing.refHero.eyebrow', { defaultValue: 'A guardian invitation from your friend' })}
        </p>
        <h2 className="mt-2 text-xl leading-snug font-bold text-text-primary">
          {friendName
            ? t('landing.refHero.titleWithName', { name: friendName, defaultValue: '{name} guards every impulse with Symy' })
            : t('landing.refHero.title', { defaultValue: 'Your friend guards every impulse with Symy' })}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          {t('landing.refHero.body', { defaultValue: 'This record comes from real guarding — impulse by impulse, hour by hour, won back.' })}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-glass-border bg-glass-fill/60 px-2 py-3 text-center">
              <p className="text-lg leading-none font-bold gradient-text">{metric.value}</p>
              <p className="mt-1 text-[10px] leading-tight text-text-secondary">{metric.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
          <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
            {t('landing.refHero.inviteRewardDesc', { defaultValue: 'You guard together — Symy covers the time. When a friend completes their first challenge, you both get +30 days of Premium. Every 5 friends → an extra +30 days. At 10 friends → +60 days that step + the Guardian Ambassador badge.' })}
          </p>
        </div>

        <Link
          href={`/${locale}/auth/signup`}
          data-testid="landing-ref-signup"
          className="mt-5 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:from-emerald-400 hover:to-cyan-400 active:scale-[0.98]"
        >
          {t('landing.refHero.cta', { defaultValue: 'Accept the gift — we both get +1 month Premium' })}
        </Link>
      </div>
    </section>
  );
}
