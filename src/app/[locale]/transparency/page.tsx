/**
 * /transparency — 公开透明度页 (batch81-a)
 *
 * BP 承诺的治理公开页: 平台级北极星指标全公开, "每周透明度报告 = 内容引擎"。
 * 无登录态、无个人数据 — 数据来自 loadTransparencyWeekly (服务端直调, 不自我
 * fetch), 快照结构上只有平台聚合桶。
 *
 * 红线 (owner 09-06): 平台聚合 (我们自己的账) 可以展示; 用户级金额永不出现。
 * 金额只在"为用户省下"平台总额语境出现; 赢回小时注明换算口径 (默认时薪 $25/h,
 * 来源: 自由时间换算) — 本页是治理公开页非分享面, 口径必须随数注明。
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';
import { TransparencyShareButton } from './share-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';
  const image = `/${locale}/transparency/og`;

  return {
    title: isZh ? '每周透明度报告 — Symy' : 'Weekly Transparency Report — Symy',
    description: isZh
      ? '拦截次数、为用户省下的金额、赢回的小时——北极星指标，全部公开。'
      : 'Intercepts, money saved for users, hours won back — our north-star metrics, all in the open.',
    alternates: { canonical: '/transparency' },
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { images: [{ url: image, width: 1200, height: 630 }] },
  };
}

function formatInt(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(Math.max(0, Math.round(n)));
}

function formatHours(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(Math.max(0, n));
}

export default async function TransparencyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const snapshot: TransparencySnapshot = await loadTransparencyWeekly();

  const generatedDate = snapshot.generatedAt.slice(0, 10);

  const weekTag = t('transparency.thisWeek');
  const cards = [
    {
      testId: 'transparency-intercepts',
      label: t('transparency.interceptsLabel'),
      hero: formatInt(snapshot.intercepts.week, locale),
      heroTag: weekTag,
      sub: `${t('transparency.allTime')} ${formatInt(snapshot.intercepts.total, locale)}`,
    },
    {
      testId: 'transparency-saved',
      label: t('transparency.savedLabel'),
      hero: `$${formatInt(snapshot.savedUsd.week, locale)}`,
      heroTag: weekTag,
      sub: `${t('transparency.allTime')} $${formatInt(snapshot.savedUsd.total, locale)}`,
    },
    {
      testId: 'transparency-hours',
      label: t('transparency.hoursLabel'),
      hero: formatHours(snapshot.hoursWon.week, locale),
      heroTag: weekTag,
      sub: `${t('transparency.allTime')} ${formatHours(snapshot.hoursWon.total, locale)}`,
    },
    {
      testId: 'transparency-guards',
      label: t('transparency.guardsLabel'),
      hero: formatInt(snapshot.guards, locale),
      heroTag: '',
      sub: t('transparency.guardsHint'),
    },
  ];

  return (
    <div className="min-h-screen bg-surface-outer px-4 py-12" data-testid="transparency-page">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-2" data-testid="transparency-title">
          {t('transparency.title')}
        </h1>
        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-6">
          {t('transparency.subtitle')}
        </p>

        {snapshot.degraded && (
          <p
            className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400"
            data-testid="transparency-degraded"
          >
            {t('transparency.degradedNote')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <div
              key={card.testId}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
              data-testid={card.testId}
            >
              <p className="text-xs text-text-tertiary mb-1">{card.label}</p>
              <p className="text-2xl font-bold text-text-primary" data-testid={`${card.testId}-hero`}>
                {card.hero}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-text-tertiary">{card.sub}</p>
              {card.heroTag && (
                <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {card.heroTag}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-2 text-xs text-text-tertiary" data-testid="transparency-caliber">
          <p>{t('transparency.caliberNote')}</p>
          <p>{t('transparency.hoursCaliberNote')}</p>
          <p className="font-medium text-text-secondary">{t('transparency.privacyNote')}</p>
        </div>

        <p className="mt-6 text-xs text-text-tertiary">
          {t('transparency.generatedAt', { time: generatedDate })}
        </p>

        <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/20 p-5 text-center">
          <p className="text-sm font-semibold text-text-primary" data-testid="transparency-footer-slogan">
            {t('transparency.footerSlogan')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{t('transparency.footerNote')}</p>
          <TransparencyShareButton
            intercepts={formatInt(snapshot.intercepts.week, locale)}
            savedUsd={formatInt(snapshot.savedUsd.week, locale)}
            hoursWon={formatHours(snapshot.hoursWon.week, locale)}
          />
        </div>
      </div>
    </div>
  );
}
