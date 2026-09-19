/**
 * /transparency — 公开透明度页 (batch81-a)
 *
 * BP 承诺的治理公开页: 平台级北极星指标全公开, "每周透明度报告 = 内容引擎"。
 * 无登录态、无个人数据 — 数据来自 loadTransparencyWeekly (服务端直调, 不自我
 * fetch), 快照结构上只有平台聚合桶。
 *
 * 红线 (owner 09-06): 平台聚合 (我们自己的账) 可以展示; 用户级金额永不出现。
 * 金额只在"为用户省下"平台总额语境出现; 赢回小时注明换算口径 (默认时薪 $25/h,
 * 来源: 自由时间换算); CO₂ (batch82-b, 第三北极星指标) 为估算值非实测 — 口径
 * 注明随数可见并链接开源仓库口径文件。本页是治理公开页非分享面, 口径必须随数注明。
 *
 * 增长区块 (batch82-c): K 因子近似值 + 邀请漏斗 (发出/完成/邀请者) —
 * BP 0918 p20 验证期「病毒机制建档」数据层, 来自 invitations 只读聚合;
 * 取数失败整段隐藏, 不展示假数据。
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import { loadGrowthStats } from '@/lib/growth-stats-server';
import { CO2_METHODOLOGY_DOC_URL } from '@/lib/co2-estimate';
import { TransparencyShareButton } from './share-button';
import { TransparencySubscribeForm } from './subscribe-form';

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

/** 小数指标 (小时 / kg) — <10 一位小数, 其余整数量级由 Intl 决定 */
function formatDecimal(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(Math.max(0, n));
}

/** K 因子等比率指标 — 两位小数封顶, 0.3 显示 0.3 不凑整 (诚实原则) */
function formatK(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(Math.max(0, n));
}

export default async function TransparencyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const [snapshot, growth] = await Promise.all([
    loadTransparencyWeekly(),
    loadGrowthStats(),
  ]);

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
      hero: formatDecimal(snapshot.hoursWon.week, locale),
      heroTag: weekTag,
      sub: `${t('transparency.allTime')} ${formatDecimal(snapshot.hoursWon.total, locale)}`,
    },
    {
      testId: 'transparency-co2',
      label: t('transparency.co2Label'),
      hero: formatDecimal(snapshot.co2SavedKg.week, locale),
      heroTag: weekTag,
      sub: `${t('transparency.allTime')} ${formatDecimal(snapshot.co2SavedKg.total, locale)}`,
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

        {/* 增长区块 (batch82-c): K 因子近似值 + 邀请漏斗三数字 — 聚合 only,
            取数失败时整段隐藏 (不展示假数据), 无金额 (邀请奖励是代币不是钱) */}
        {growth && (
          <div
            className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
            data-testid="transparency-growth"
          >
            <p className="text-xs text-text-tertiary mb-2">{t('transparency.growthTitle')}</p>
            <div className="flex items-baseline gap-3">
              <p className="text-2xl font-bold text-text-primary" data-testid="transparency-growth-k-hero">
                {formatK(growth.kFactorApprox, locale)}
              </p>
              <p className="text-xs text-text-tertiary">{t('transparency.growthKFactorLabel')}</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div data-testid="transparency-growth-sent">
                <p className="text-lg font-semibold text-text-primary">
                  {formatInt(growth.invites.total, locale)}
                </p>
                <p className="text-[11px] text-text-tertiary">{t('transparency.growthSentLabel')}</p>
              </div>
              <div data-testid="transparency-growth-completed">
                <p className="text-lg font-semibold text-text-primary">
                  {formatInt(growth.invites.completed, locale)}
                </p>
                <p className="text-[11px] text-text-tertiary">{t('transparency.growthCompletedLabel')}</p>
              </div>
              <div data-testid="transparency-growth-inviters">
                <p className="text-lg font-semibold text-text-primary">
                  {formatInt(growth.uniqueInviters, locale)}
                </p>
                <p className="text-[11px] text-text-tertiary">{t('transparency.growthInvitersLabel')}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-text-tertiary">
              {t('transparency.growthCaliberNote')}
            </p>
          </div>
        )}

        <div className="mt-6 space-y-2 text-xs text-text-tertiary" data-testid="transparency-caliber">
          <p>{t('transparency.caliberNote')}</p>
          <p>{t('transparency.hoursCaliberNote')}</p>
          <p>
            {t('transparency.co2Note')}{' '}
            <a
              href={CO2_METHODOLOGY_DOC_URL}
              target="_blank"
              rel="noreferrer"
              className="underline"
              data-testid="transparency-co2-link"
            >
              src/lib/co2-estimate.ts
            </a>
          </p>
          <p className="font-medium text-text-secondary">{t('transparency.privacyNote')}</p>
        </div>

        {/* 财务公开 (batch83-a): 三重公开最后一块, 月度收支/会员数/成本结构 */}
        <p className="mt-6 text-sm">
          <a
            href={`/${locale}/transparency/finance`}
            className="font-medium text-emerald-600 dark:text-emerald-400 underline"
            data-testid="transparency-finance-link"
          >
            {t('transparency.financeLink')}
          </a>
        </p>

        <p className="mt-6 text-xs text-text-tertiary">
          {t('transparency.generatedAt', { time: generatedDate })}
        </p>

        {/* 周报订阅 (batch84-c): 内容引擎闭环的回访钩子 — 每周报告 → 订阅 → 下周回访。
            表未建 (503) 时显示「即将上线」, 取数失败不影响指标卡渲染 */}
        <TransparencySubscribeForm />

        <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/20 p-5 text-center">
          <p className="text-sm font-semibold text-text-primary" data-testid="transparency-footer-slogan">
            {t('transparency.footerSlogan')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{t('transparency.footerNote')}</p>
          <TransparencyShareButton
            intercepts={formatInt(snapshot.intercepts.week, locale)}
            savedUsd={formatInt(snapshot.savedUsd.week, locale)}
            hoursWon={formatDecimal(snapshot.hoursWon.week, locale)}
          />
        </div>
      </div>
    </div>
  );
}
