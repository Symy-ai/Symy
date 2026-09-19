/**
 * /transparency/finance — 财务公开页 (batch83-a)
 *
 * BP 0918 p11 三重公开最后一块「财务公开」: 月度收支、会员数、成本结构
 * (业务公开 = /transparency 已上线, 治理公开 = 开源仓库)。数据来自
 * src/data/finance/*.json 静态文件 (owner 手动月更, git 历史即账本留痕),
 * 零 DDL; 空数据降级为"待更新", 不展示编造数字。
 *
 * 红线 (BP 原话): 收入只来自会员费, 账目天然干净; 公开的是我们自己的账,
 * 不是用户的数据 — 密钥与用户隐私永不公开。本页是治理公开页非分享面,
 * 口径必须随数注明。
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  formatMemberCount,
  formatSignedUsd,
  formatUsd,
  loadFinanceMonths,
  summarizeFinanceMonths,
} from '@/lib/finance-public';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';
  return {
    title: isZh ? '财务公开 — Symy' : 'Financial Transparency — Symy',
    description: isZh
      ? '月度收支、会员数、成本结构——我们自己的账，全部公开。收入只来自会员费。'
      : 'Monthly revenue & costs, members, cost structure — our own books, all in the open. Membership fees are our only revenue.',
    alternates: { canonical: '/transparency/finance' },
  };
}

export default async function FinancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const months = await loadFinanceMonths();
  const {
    totalRevenueUsd,
    totalCostsUsd,
    cumulativeNetUsd,
    isAllZeroPlaceholder,
  } = summarizeFinanceMonths(months);

  return (
    <div className="min-h-screen bg-surface-outer px-4 py-12" data-testid="finance-page">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-2" data-testid="finance-title">
          {t('transparency.financeTitle')}
        </h1>
        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-6">
          {t('transparency.financeSubtitle')}
        </p>

        {months.length === 0 ? (
          <p
            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400"
            data-testid="finance-empty"
          >
            {t('transparency.financeEmpty')}
          </p>
        ) : (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            {isAllZeroPlaceholder && (
              <p
                className="mb-3 text-xs text-amber-700 dark:text-amber-400"
                data-testid="finance-placeholder"
              >
                {t('transparency.financePlaceholder')}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="finance-table">
                <thead>
                  <tr className="text-left text-xs text-text-tertiary">
                    <th className="py-2 pr-3 font-medium">{t('transparency.financeColMonth')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('transparency.financeColMembers')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('transparency.financeColRevenue')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('transparency.financeColCosts')}</th>
                    <th className="py-2 font-medium text-right">{t('transparency.financeColNet')}</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-t border-emerald-500/10" data-testid={`finance-row-${m.month}`}>
                      <td className="py-2 pr-3 text-text-primary">{m.month}</td>
                      <td className="py-2 pr-3 text-right text-text-secondary tabular-nums">
                        {formatMemberCount(m.members, locale)}
                      </td>
                      <td className="py-2 pr-3 text-right text-text-secondary tabular-nums">
                        ${formatUsd(m.revenueUsd.membership + m.revenueUsd.other, locale)}
                      </td>
                      <td className="py-2 pr-3 text-right text-text-secondary tabular-nums">
                        ${formatUsd(m.costsUsd.infra + m.costsUsd.ai + m.costsUsd.team, locale)}
                      </td>
                      <td className="py-2 text-right text-text-primary tabular-nums">
                        {formatSignedUsd(m.netUsd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-emerald-500/30 font-semibold" data-testid="finance-cumulative">
                    <td className="py-2 pr-3 text-text-primary">{t('transparency.financeCumulative')}</td>
                    <td className="py-2 pr-3 text-right text-text-tertiary">—</td>
                    <td className="py-2 pr-3 text-right text-text-primary tabular-nums">
                      ${formatUsd(totalRevenueUsd, locale)}
                    </td>
                    <td className="py-2 pr-3 text-right text-text-primary tabular-nums">
                      ${formatUsd(totalCostsUsd, locale)}
                    </td>
                    <td className="py-2 text-right text-text-primary tabular-nums">
                      {formatSignedUsd(cumulativeNetUsd, locale)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4" data-testid="finance-notes">
          <p className="text-xs text-text-tertiary mb-2">{t('transparency.financeNotesTitle')}</p>
          <div className="space-y-2 text-xs leading-snug text-text-tertiary">
            <p>{t('transparency.financeNoteMembership')}</p>
            <p>{t('transparency.financeNotePrivacy')}</p>
            <p>{t('transparency.financeNoteCaliber')}</p>
          </div>
        </div>

        <p className="mt-6 text-xs text-text-tertiary">
          <a
            href={`/${locale}/transparency`}
            className="underline"
            data-testid="finance-back-link"
          >
            {t('transparency.financeBack')}
          </a>
        </p>
      </div>
    </div>
  );
}
