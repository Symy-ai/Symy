'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { GREEN_ALTERNATIVES } from '@/lib/green-alternatives';
import { analyzeGreenRuleCoverage, type GreenRuleCoverageEvent } from '@/lib/green-rule-coverage';

async function fetchCoverageEvents(eventType: string): Promise<GreenRuleCoverageEvent[]> {
  const url = new URL('/api/buddy/health-events', window.location.origin);
  url.searchParams.set('event_type', eventType);
  url.searchParams.set('limit', '100');
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('green-rule-coverage-load-failed');
  const data = (await response.json()) as { events?: GreenRuleCoverageEvent[] };
  return data.events ?? [];
}

function exportText(
  result: ReturnType<typeof analyzeGreenRuleCoverage>,
  locale: string,
): string {
  const zh = locale === 'zh';
  const lines = [
    zh ? '🌱 守护规则自检' : '🌱 Guard Rule Self-check',
    zh ? `词库 ${result.totalEntries} 条 · 事件 ${result.totalEvents} 次 · 覆盖 ${result.matchedEvents} 次 · 活跃 ${result.activeDays} 天` : `Library ${result.totalEntries} entries · events ${result.totalEvents} · covered ${result.matchedEvents} · active ${result.activeDays} days`,
  ];
  if (result.categoryGaps.length > 0) lines.push(zh ? `待补品类：${result.categoryGaps.map((gap) => `${gap.key} ${gap.count} 次`).join('、')}` : `Categories to add: ${result.categoryGaps.map((gap) => `${gap.key} x${gap.count}`).join(', ')}`);
  else lines.push(zh ? '待补品类：暂无' : 'Categories to add: none');
  if (result.triggerGaps.length > 0) lines.push(zh ? `学习中表达：${result.triggerGaps.map((gap) => `${gap.key} ${gap.count} 次`).join('、')}` : `Learning expressions: ${result.triggerGaps.map((gap) => `${gap.key} x${gap.count}`).join(', ')}`);
  else lines.push(zh ? '学习中表达：暂无' : 'Learning expressions: none');
  lines.push(zh ? '只读诊断：条目数、次数与天数。' : 'Read-only diagnosis: entries, counts, and days only.');
  return lines.join('\n');
}

export function GuardRuleCoverageSetting() {
  const { t, locale } = useI18n();
  const { copied, copy } = useCopyToClipboard();
  const [events, setEvents] = useState<GreenRuleCoverageEvent[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCoverageEvents('challenge_completed'), fetchCoverageEvents('manual_adjustment')])
      .then(([challenge, manual]) => {
        if (cancelled) return;
        setEvents([...challenge, ...manual]);
        setStatus('ok');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => { cancelled = true; };
  }, []);

  const result = useMemo(() => analyzeGreenRuleCoverage(GREEN_ALTERNATIVES, status === 'ok' ? events : []), [events, status]);
  const percent = Math.round(result.coverageRate * 100);
  const statusKey = status === 'failed' || result.status === 'noData' ? 'noData' : result.status === 'noEntries' ? 'noEntries' : result.status;

  return (
    <section data-testid="guard-rule-coverage-setting" data-status={statusKey} className="p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted"><ShieldCheck className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.guardRuleCoverageTitle')}</p>
          <p className="text-xs text-text-tertiary">{t('profile.guardRuleCoverageDesc')}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2" data-testid="guard-rule-coverage-summary">
        <div>
          <div className="flex justify-between text-xs text-text-secondary"><span>{t('profile.guardRuleCoverageRate')}</span><span>{percent}%</span></div>
          <div className="mt-1 h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-cyan-500/70 transition-all" style={{ width: `${Math.max(percent, 2)}%` }} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [t('profile.guardRuleCoverageEntries'), result.totalEntries],
            [t('profile.guardRuleCoverageEvents'), result.totalEvents],
            [t('profile.guardRuleCoverageDays'), result.activeDays],
          ].map(([label, value]) => (
            <div key={String(label)} className="p-2 rounded-lg border border-glass-border bg-glass-fill">
              <p className="text-sm font-semibold text-text-primary">{value}</p>
              <p className="text-[11px] text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>
        {status === 'failed' || result.status === 'noData' ? <p className="text-xs text-text-tertiary">{t('profile.guardRuleCoverageNoData')}</p> : null}
        {result.status === 'healthy' ? <p className="text-xs text-text-secondary">{t('profile.guardRuleCoverageHealthy')}</p> : null}
        {result.categoryGaps.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-text-secondary">{t('profile.guardRuleCoverageCategoryGaps')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {result.categoryGaps.map((gap) => <span key={gap.key} className="px-2 py-0.5 text-[11px] rounded-lg border border-glass-border bg-glass-fill text-text-secondary">{gap.key} · {gap.count}</span>)}
            </div>
          </div>
        )}
        {result.triggerGaps.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-text-secondary">{t('profile.guardRuleCoverageLearning')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {result.triggerGaps.map((gap) => <span key={gap.key} className="px-2 py-0.5 text-[11px] rounded-lg border border-glass-border bg-glass-fill text-text-secondary">{gap.key} · {gap.count}</span>)}
            </div>
          </div>
        )}
        <button
          data-testid="guard-rule-coverage-copy"
          onClick={() => void copy(exportText(result, locale))}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-glass-border text-text-secondary hover:bg-glass-hover transition-colors"
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          {copied ? t('profile.guardRuleCoverageCopied') : t('profile.guardRuleCoverageExport')}
        </button>
      </div>
    </section>
  );
}
