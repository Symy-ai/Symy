/**
 * /trust — 信任页 (batch105-a)
 *
 * BP v0920 p11 的三重公开整合入口: 业务 / 财务 / 治理。
 * 治理文档不复制进站, GitHub 公开仓保持单一真源; 本页只提供清单与链接。
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const GOVERNANCE_REPOSITORY_URL = 'https://github.com/Symy-ai/Symy/tree/main/doc/symy-lab';

const governanceDocuments = [
  { slug: 'README.md', testId: 'trust-governance-readme' },
  { slug: 'constitution.md', testId: 'trust-governance-constitution' },
  { slug: 'dao-jing.md', testId: 'trust-governance-dao-jing' },
  { slug: 'governance-brief.md', testId: 'trust-governance-brief' },
  { slug: 'symbiotic-ai.md', testId: 'trust-governance-symbiotic-ai' },
  { slug: 'dividend-mechanism.md', testId: 'trust-governance-dividend' },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return {
    title: isZh ? '信任 — Symy' : 'Trust — Symy',
    description: isZh
      ? '业务公开、财务公开、治理公开，以及防漂绿与结构性中立边界。'
      : 'Business, financial, and governance disclosure, with anti-greenwashing and structural neutrality boundaries.',
    alternates: { canonical: '/trust' },
  };
}

export default async function TrustPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const disclosures = [
    {
      testId: 'trust-disclosure-business',
      title: t('trust.businessTitle'),
      description: t('trust.businessDescription'),
      href: `/${locale}/transparency`,
      linkText: t('trust.businessLink'),
    },
    {
      testId: 'trust-disclosure-finance',
      title: t('trust.financeTitle'),
      description: t('trust.financeDescription'),
      href: `/${locale}/transparency/finance`,
      linkText: t('trust.financeLink'),
    },
  ] as const;

  return (
    <div className="min-h-screen bg-surface-outer px-4 py-12" data-testid="trust-page">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-3 text-center">
          <h1 className="text-2xl font-bold text-text-primary" data-testid="trust-title">
            {t('trust.title')}
          </h1>
          <p className="text-sm text-text-secondary" data-testid="trust-subtitle">
            {t('trust.subtitle')}
          </p>
        </header>

        <section className="space-y-4" aria-labelledby="trust-disclosures-title">
          <h2
            id="trust-disclosures-title"
            className="text-lg font-semibold text-text-primary"
            data-testid="trust-disclosures-title"
          >
            {t('trust.disclosuresTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {disclosures.map(({ testId, title, description, href, linkText }) => (
              <article
                key={testId}
                className="space-y-3 rounded-xl border border-border-primary bg-glass-fill/40 p-4"
                data-testid={testId}
              >
                <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
                <p className="text-xs leading-5 text-text-secondary">{description}</p>
                <Link
                  href={href}
                  className="inline-block text-xs font-medium text-text-primary underline"
                  data-testid={`${testId}-link`}
                >
                  {linkText}
                </Link>
              </article>
            ))}

            <article
              className="space-y-3 rounded-xl border border-border-primary bg-glass-fill/40 p-4"
              data-testid="trust-disclosure-governance"
            >
              <h3 className="text-sm font-semibold text-text-primary">
                {t('trust.governanceTitle')}
              </h3>
              <p className="text-xs leading-5 text-text-secondary">
                {t('trust.governanceDescription')}
              </p>
              <ul className="space-y-2" data-testid="trust-governance-documents">
                {governanceDocuments.map(({ slug, testId }) => (
                  <li key={slug} className="text-xs leading-5">
                    <a
                      href={`${GOVERNANCE_REPOSITORY_URL}/${slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-primary underline"
                      data-testid={testId}
                    >
                      {t(`trust.governanceDocs.${slug.replace(/\.md$/, '').replace(/-/g, '')}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="trust-anti-greenwashing-title">
          <h2
            id="trust-anti-greenwashing-title"
            className="text-lg font-semibold text-text-primary"
            data-testid="trust-anti-greenwashing-title"
          >
            {t('trust.antiGreenwashingTitle')}
          </h2>
          <ul className="space-y-2" data-testid="trust-anti-greenwashing-principles">
            <li className="text-xs leading-5 text-text-secondary" data-testid="trust-anti-greenwashing-estimates">
              {t('trust.antiGreenwashingEstimates')}
            </li>
            <li className="text-xs leading-5 text-text-secondary" data-testid="trust-anti-greenwashing-caliber">
              {t('trust.antiGreenwashingCaliber')}
            </li>
            <li className="text-xs leading-5 text-text-secondary" data-testid="trust-anti-greenwashing-no-offset">
              {t('trust.antiGreenwashingNoOffset')}
            </li>
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="trust-neutrality-title">
          <h2
            id="trust-neutrality-title"
            className="text-lg font-semibold text-text-primary"
            data-testid="trust-neutrality-title"
          >
            {t('trust.neutralityTitle')}
          </h2>
          <ul className="space-y-2" data-testid="trust-neutrality-lines">
            <li className="text-xs leading-5 text-text-secondary" data-testid="trust-neutrality-ads">
              {t('trust.neutralityAds')}
            </li>
            <li className="text-xs leading-5 text-text-secondary" data-testid="trust-neutrality-bidding">
              {t('trust.neutralityBidding')}
            </li>
            <li className="text-xs leading-5 text-text-secondary" data-testid="trust-neutrality-placement">
              {t('trust.neutralityPlacement')}
            </li>
          </ul>
        </section>

        <Link
          href={`/${locale}/covenant`}
          className="block text-center text-xs font-medium text-text-primary underline"
          data-testid="trust-covenant-link"
        >
          {t('trust.covenantLink')}
        </Link>
      </div>
    </div>
  );
}
