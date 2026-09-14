'use client';

/**
 * GuardProfileExportSetting — 设置页「守护档案」区块 (batch58-b)
 *
 * 自包含组件 (与 TimeValueSetting 同模式): 一处看清守护配置全貌
 * (强度/范围/深夜时段/时薪) + 三轨成果聚合, 并导出两份文本:
 *   - 完整版: 含累计省钱估算, app 内预览 + 复制, 仅用户自见。
 *   - 分享版: 结构性 amount-free (buildGuardProfileShareText 入参类型无金额),
 *     小象第一人称, 适合发社群。
 *
 * 复制走 useCopyToClipboard (clipboard API + textarea 降级);
 * 成果事件经 fetchGuardStyleEvents 复用 56-c 读取通道, 失败静默降级
 * (只导出配置部分)。零 DDL / 无新依赖。
 */

import { useEffect, useMemo, useState } from 'react';
import { FileText, ScrollText } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/i18n/provider';
import { useBuddyStateRQ } from '@/hooks/use-buddy-state-rq';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useGuardIntensity } from '@/hooks/use-guard-intensity';
import { useGuardScope } from '@/hooks/use-guard-scope';
import { useNightWindow } from '@/hooks/use-night-window';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { fetchGuardStyleEvents } from '@/hooks/use-guard-style-profile';
import { moneyToHours } from '@/lib/freedom-time';
import { getGuardRank } from '@/lib/guard-rank';
import { normalizeInterceptCategory } from '@/features/butterfly/green-alt-copy';
import { buildGuardProfileExport, renderGuardProfileExport, type GuardProfileExportData } from '@/lib/guard-profile-export';
import type { GuardStyleEventInput } from '@/lib/guard-style-profile';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function GuardProfileExportSetting({ isDemo = false }: { isDemo?: boolean }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { buddyState } = useBuddyStateRQ(isDemo);
  const { guardIntensity } = useGuardIntensity();
  const { guardScope } = useGuardScope();
  const { nightWindow } = useNightWindow();
  const { hourlyRate } = useHourlyRate(isDemo);
  const [events, setEvents] = useState<GuardStyleEventInput[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const fullCopy = useCopyToClipboard();
  const shareCopy = useCopyToClipboard();
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGuardStyleEvents()
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch(() => {
        // safe to ignore: 档案是非关键路径, 拉取失败降级为只导出配置部分
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(
    () =>
      buildGuardProfileExport({
        locale,
        rawIntensity: guardIntensity,
        rawScope: guardScope,
        rawNightWindow: nightWindow,
        hourlyRate,
        events: loadFailed ? [] : events,
        evidenceEvents: loadFailed ? [] : events,
      }),
    [locale, guardIntensity, guardScope, nightWindow, hourlyRate, events, loadFailed],
  );

  const exportData = useMemo<GuardProfileExportData>(() => {
    const validEvents = loadFailed ? [] : (events || []);
    const guardEvents = validEvents.filter((event) => event.eventType === 'challenge_completed');
    const recoveryEvents = validEvents.filter((event) => event.eventType === 'mindful_recovery');
    const altCount = recoveryEvents.filter((event) => event.metadata?.kind === 'green_alt_adoption').length;
    const reuseCount = recoveryEvents.filter((event) => event.metadata?.kind === 'reuse_adoption').length;
    const guardedAmount = validEvents.reduce((sum, event) => {
      const raw = event.metadata?.savedAmount ?? event.metadata?.estSaved;
      const amount = Number(raw);
      return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
    }, 0);
    const categoryCounts = new Map<string, number>();
    for (const event of validEvents) {
      const metadata = event.metadata || {};
      const rawCategory = typeof metadata.category === 'string' ? metadata.category : String(metadata.itemTitle ?? '');
      const category = normalizeInterceptCategory(rawCategory);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const sixMonthEvents = validEvents.filter((event) => {
      const time = new Date(event.createdAt || 0).getTime();
      return Number.isFinite(time) && time >= sixMonthsAgo.getTime();
    });
    const monthCounts = new Map<string, number>();
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - offset);
      monthCounts.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    for (const event of sixMonthEvents) {
      if (event.eventType !== 'challenge_completed') continue;
      const date = new Date(event.createdAt || 0);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthCounts.has(key)) monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    }
    const summaryAmount = sixMonthEvents.reduce((sum, event) => {
      const raw = event.metadata?.savedAmount ?? event.metadata?.estSaved;
      const amount = Number(raw);
      return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
    }, 0);
    const moments = validEvents
      .map((event) => {
        const raw = event.metadata?.savedAmount ?? event.metadata?.estSaved;
        const amount = Number(raw);
        return {
          eventType: event.eventType || '',
          occurredAt: String(event.createdAt || ''),
          amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        };
      })
      .filter((moment) => moment.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('profile.user');
    const totalIntercepts = guardEvents.length;
    const badges = buddyState?.badges?.length || 0;
    const rank = getGuardRank({
      totalIntercepts,
      streakDays: buddyState?.streak || 0,
      badgesUnlocked: badges,
    });

    return {
      locale,
      username: displayName,
      avatarUrl: user?.user_metadata?.avatar_url || null,
      rankName: `${rank.emoji} ${t(rank.nameKey)}`,
      totalIntercepts,
      longestStreakDays: buddyState?.streak || 0,
      unlockedBadges: badges,
      freedomHours: moneyToHours(guardedAmount, hourlyRate),
      months: [...monthCounts].map(([monthKey, intercepts]) => ({ monthKey, intercepts })),
      topCategories: [...categoryCounts]
        .filter(([name]) => name !== 'other')
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      greenAdoptionRate: altCount + reuseCount > 0 ? altCount / (altCount + reuseCount) : 0,
      moments: moments.map((moment) => ({ ...moment, freedomHours: moneyToHours(moment.amount, hourlyRate) })),
      summaryCount: sixMonthEvents.length,
      summaryHours: moneyToHours(summaryAmount, hourlyRate),
    };
  }, [buddyState?.badges?.length, buddyState?.streak, events, hourlyRate, loadFailed, locale, t, user]);

  const exportSections = useMemo(() => renderGuardProfileExport(exportData), [exportData]);
  const canExport = exportData.summaryCount >= 5;

  const handleExport = () => {
    if (!canExport || isExporting) return;
    setIsExporting(true);
    const title = document.title;
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.opener = null;
      printWindow.document.title = `symy-guard-profile-${new Date().toISOString().slice(0, 10)}`;
      printWindow.document.body.innerHTML = `
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: system-ui, sans-serif; color: #17202a; margin: 0; }
          section { break-inside: avoid; margin-bottom: 28px; }
          h1, h2 { margin: 0 0 12px; }
          h2 { font-size: 18px; border-bottom: 1px solid #d7e0e8; padding-bottom: 6px; }
          .cover { text-align: center; padding-top: 140px; }
          .cover .rank { font-size: 24px; }
          .cover .avatar { width: 88px; height: 88px; border-radius: 50%; background: #e8f4f2; color: #14827a; display: flex; align-items: center; justify-content: center; font-size: 34px; margin: 24px auto; }
          .cover .name { font-size: 28px; }
          .cover .date { color: #607080; margin-top: 10px; }
          ul { list-style: none; padding: 0; margin: 0; }
          li { padding: 7px 0; border-bottom: 1px solid #edf2f5; }
        </style>
        ${exportSections.sections.map((section, index) => `
          <section class="${section.id === 'cover' ? 'cover' : ''}">
            ${section.id === 'cover' ? '<div class="avatar">🐘</div>' : ''}
            ${section.id === 'cover' ? `<div class="rank">${escapeHtml(section.lines[0])}</div><div class="name">${escapeHtml(section.lines[1])}</div><div class="date">${escapeHtml(section.lines[2])}</div>` : `<h2>${escapeHtml(section.title)}</h2><ul>${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`}
            ${index === 0 ? '<h1 style="position:absolute;left:-9999px">Symy Guard Profile</h1>' : ''}
          </section>
        `).join('')}
      `;
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } finally {
      setIsExporting(false);
      document.title = title;
    }
  };

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill"
      data-testid="guard-profile-export-block"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <ScrollText className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.guardProfileTitle')}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.guardProfileDesc')}</p>

        {loadFailed && (
          <p className="text-[11px] text-text-tertiary mb-1" data-testid="guard-profile-load-failed">
            {t('profile.guardProfileLoadFailed')}
          </p>
        )}

        <pre
          className="mb-2 max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words text-[11px] leading-relaxed text-text-secondary bg-glass-fill border border-glass-border rounded-lg p-2.5"
          data-testid="guard-profile-full-preview"
        >
          {result.fullText}
        </pre>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fullCopy.copy(result.fullText)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all cursor-pointer"
            data-testid="guard-profile-copy-full"
          >
            {fullCopy.copied ? t('profile.guardProfileCopied') : t('profile.guardProfileCopyFull')}
          </button>
          <button
            onClick={() => void shareCopy.copy(result.shareText)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
              shareCopy.copied
                ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary'
                : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'
            }`}
            data-testid="guard-profile-copy-share"
          >
            {shareCopy.copied ? t('profile.guardProfileCopied') : t('profile.guardProfileCopyShare')}
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={!canExport || isExporting}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="guard-profile-export-pdf"
          >
            {isExporting ? <FileText className="w-3 h-3 animate-pulse" /> : <FileText className="w-3 h-3" />}
            {isExporting
              ? t('profile.guardProfileExport.loading')
              : canExport
                ? t('profile.guardProfileExport.button')
                : t('profile.guardProfileExport.insufficient')}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-text-tertiary/70">{t('profile.guardProfileShareNote')}</p>
      </div>
    </div>
  );
}
