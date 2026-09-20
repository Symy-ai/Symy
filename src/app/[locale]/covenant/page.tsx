/**
 * /covenant — the Guard Grove covenant (batch105-c)
 *
 * BP v0920 p3-4: the covenant is a calm identity statement, not a marketing
 * pitch. The page stays static except for the existing public collective total.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';

const covenantArticles = [
  'explore',
  'conserve',
  'selfRestraint',
] as const;

const rationalReasons = ['incentives', 'visibility', 'practice'] as const;

function formatCollectiveHours(hours: number, locale: string) {
  const safeHours = Math.max(0, hours);
  if (safeHours < 1) {
    const minutes = Math.max(1, Math.round(safeHours * 60));
    return locale === 'zh' ? `${minutes} 分钟` : `${minutes} min`;
  }
  const display = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(safeHours);
  return locale === 'zh' ? `${display} 小时` : `${display} hours`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return {
    title: isZh ? '新契约 — Symy' : 'The Covenant — Symy',
    description: isZh
      ? '探索更大宇宙，尽量少占家乡资源。三个条款，一份可以晒的身份契约。'
      : 'Explore a larger universe while taking fewer resources from home. Three articles and an identity worth sharing.',
    alternates: {
      canonical: '/covenant',
      languages: { en: '/en/covenant', zh: '/zh/covenant' },
    },
    openGraph: {
      title: isZh ? '新契约' : 'The Covenant',
      images: [{ url: `/${locale}/covenant/og`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [{ url: `/${locale}/covenant/og`, width: 1200, height: 630 }],
    },
  };
}

export default async function CovenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  let collective: { hours: number; guards: number } | null = null;
  try {
    const snapshot = await loadTransparencyWeekly();
    collective = { hours: snapshot.hoursWon.total, guards: snapshot.guards };
  } catch {
    // The covenant remains available when the aggregate ledger is unavailable.
  }

  return (
    <div className="min-h-screen bg-surface-outer px-4 py-12" data-testid="covenant-page">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-3 text-center">
          <h1 className="text-2xl font-bold text-text-primary" data-testid="covenant-title">
            {t('covenant.title')}
          </h1>
          <p className="text-sm text-text-secondary" data-testid="covenant-subtitle">
            {t('covenant.subtitle')}
          </p>
        </header>

        <section className="space-y-4" aria-labelledby="covenant-articles-title">
          <h2
            id="covenant-articles-title"
            className="text-lg font-semibold text-text-primary"
            data-testid="covenant-articles-title"
          >
            {t('covenant.articlesTitle')}
          </h2>
          <ol className="space-y-3">
            {covenantArticles.map((article, index) => (
              <li
                key={article}
                className="rounded-xl border border-border-primary bg-glass-fill/40 p-4"
                data-testid={`covenant-article-${article}`}
              >
                <span className="text-xs font-semibold text-text-tertiary">
                  {t('covenant.articleNumber', { number: index + 1 })}
                </span>
                <p className="mt-1 text-sm leading-6 text-text-primary">
                  {t(`covenant.articles.${article}`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4" aria-labelledby="covenant-reasons-title">
          <h2
            id="covenant-reasons-title"
            className="text-lg font-semibold text-text-primary"
            data-testid="covenant-reasons-title"
          >
            {t('covenant.reasonsTitle')}
          </h2>
          <ul className="space-y-3">
            {rationalReasons.map((reason) => (
              <li
                key={reason}
                className="rounded-xl border border-border-primary bg-glass-fill/40 p-4 text-sm leading-6 text-text-secondary"
                data-testid={`covenant-reason-${reason}`}
              >
                {t(`covenant.reasons.${reason}`)}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4 text-center" aria-labelledby="covenant-collective-title">
          <h2
            id="covenant-collective-title"
            className="text-lg font-semibold text-text-primary"
            data-testid="covenant-collective-title"
          >
            {t('covenant.collectiveTitle')}
          </h2>
          {collective ? (
            <div
              className="rounded-xl border border-border-primary bg-glass-fill/40 p-6"
              data-testid="covenant-collective-stats"
            >
              <p className="text-3xl font-bold gradient-text">
                {formatCollectiveHours(collective.hours, locale)}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                {t('covenant.wonBackTogether', {
                  hours: formatCollectiveHours(collective.hours, locale),
                  guards: new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(
                    collective.guards,
                  ),
                })}
              </p>
            </div>
          ) : (
            <p
              className="rounded-xl border border-border-primary bg-glass-fill/40 p-6 text-xs text-text-secondary"
              data-testid="covenant-collective-unavailable"
            >
              {t('covenant.collectiveUnavailable')}
            </p>
          )}
        </section>

        <Link
          href={`/${locale}/trust`}
          className="block text-center text-xs font-medium text-text-primary underline"
          data-testid="covenant-trust-link"
        >
          {t('covenant.trustLink')}
        </Link>
      </div>
    </div>
  );
}
