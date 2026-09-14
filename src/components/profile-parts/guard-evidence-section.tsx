'use client';

import { BookOpenCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import {
  buildGuardLedgerEvidence,
  explainGuardedHours,
  type GuardEvidenceEventInput,
  type GuardEvidenceSource,
} from '@/lib/guard-ledger-provenance';

const SOURCE_LABEL_KEYS: Record<GuardEvidenceSource, string> = {
  auto_challenge: 'profile.guardEvidence.sources.autoChallenge',
  chat_decision: 'profile.guardEvidence.sources.chatDecision',
  green_alt: 'profile.guardEvidence.sources.greenAlt',
  commitment: 'profile.guardEvidence.sources.commitment',
  manual: 'profile.guardEvidence.sources.manual',
  reset_audit: 'profile.guardEvidence.sources.resetAudit',
};

export function GuardEvidenceSection({ events }: { events: GuardEvidenceEventInput[] | null }) {
  const { t } = useI18n();
  const evidence = buildGuardLedgerEvidence(events);
  const explanation = explainGuardedHours(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <div
      className="mt-4 border-t border-white/10 pt-3"
      data-testid="guard-evidence-section"
    >
      <div className="flex items-center gap-1.5">
        <BookOpenCheck className="h-3.5 w-3.5 text-emerald-300/80" aria-hidden="true" />
        <h4 className="text-xs font-semibold text-[#a7f3d0]">
          {t('profile.guardEvidence.title')}
        </h4>
        <span className="ml-auto text-[10px] text-[#88a292]">
          {t('profile.guardEvidence.private')}
        </span>
      </div>

      {evidence.status === 'insufficient' ? (
        <p className="mt-2 text-xs leading-relaxed text-[#88a292]" data-testid="guard-evidence-empty">
          {t('profile.guardEvidence.empty')}
        </p>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-2" data-testid="guard-evidence-summary">
            {evidence.summary.filter((item) => item.count > 0).map((item) => (
              <div key={item.source} className="rounded-xl border border-emerald-300/15 bg-white/5 p-2.5">
                <dt className="text-[10px] text-[#88a292]">{t(SOURCE_LABEL_KEYS[item.source])}</dt>
                <dd className="mt-1 text-xs font-semibold text-[#f0faf2]">
                  {t('profile.guardEvidence.countDays', { count: item.count, days: item.days })}
                  {!item.includedInWinCalculations && (
                    <span className="ml-1 font-normal text-[10px] text-[#88a292]">
                      {t('profile.guardEvidence.excluded')}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="mt-2 space-y-1.5" data-testid="guard-evidence-rows">
            {evidence.latestRows.map((row) => (
              <li key={`${row.id}-${row.date}-${row.source}`} className="rounded-lg bg-white/5 px-2.5 py-2 text-[11px] text-[#b6cbbe]">
                <span className="font-semibold text-[#f0faf2]">{row.date}</span>
                <span className="mx-1.5">·</span>
                {t(SOURCE_LABEL_KEYS[row.source])}
                <span className="mx-1.5">·</span>
                {row.subject}
                <span className="mx-1.5">·</span>
                {row.category}
                {!row.includedInWinCalculations && (
                  <span className="ml-1 text-[10px] text-[#88a292]">
                    {t('profile.guardEvidence.excluded')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="mt-2" data-testid="guard-evidence-explain">
        <summary className="cursor-pointer text-[11px] font-semibold text-emerald-200">
          {t('profile.guardEvidence.explainHours')}
        </summary>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[#88a292]">
          {t('profile.guardEvidence.hoursFormula', {
            window: explanation.timeWindow,
            timezone: explanation.timezone,
          })}
        </p>
      </details>
    </div>
  );
}
