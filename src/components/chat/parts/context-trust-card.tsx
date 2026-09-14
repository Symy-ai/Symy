'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import {
  CONTEXT_TRUST_CORRECTIONS,
  type ContextTrustCorrectionKind,
  type TrustEvidence,
  type TrustEvidenceItem,
} from '@/lib/context-trust';
import { readTrustCorrections, reportTrustCorrection } from './context-trust-correction';

function EvidenceList({ title, items, testId }: { title: string; items: TrustEvidenceItem[]; testId: string }) {
  const { locale, t } = useI18n();
  if (!items.length) return null;
  return (
    <div data-testid={testId}>
      <p className="text-[11px] font-medium text-text-secondary">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={`${testId}-${index}`} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-primary">
            <span aria-hidden>{item.source === 'conversation' ? '💬' : item.source === 'fact' ? '📌' : item.source === 'history' ? '🔁' : '🔍'}</span>
            <span>
              {locale === 'en' ? item.en : item.zh}
              {item.inferred ? ` · ${t('chat.contextTrust.inferred')}` : ''}
              {item.stale ? ` · ${t('chat.contextTrust.stale')}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContextTrustCard({ evidence, onCorrected }: {
  evidence: TrustEvidence;
  onCorrected?: (kind: ContextTrustCorrectionKind) => void;
}) {
  const { locale, t } = useI18n();
  const [correction, setCorrection] = useState<ContextTrustCorrectionKind | null>(() => {
    const latest = readTrustCorrections()
      .filter((entry) => evidence.signals.some((signal) => signal.id === entry.signalId))
      .at(-1);
    return latest?.reason ?? null;
  });

  const handleCorrection = (kind: ContextTrustCorrectionKind) => {
    if (correction) return;
    setCorrection(kind);
    onCorrected?.(kind);
    void Promise.all(evidence.signals.map((signal) => reportTrustCorrection(signal.id, kind)));
  };

  return (
    <aside
      className="mt-3 rounded-xl border border-glass-border bg-glass-fill p-3 backdrop-blur-sm"
      aria-label={t('chat.contextTrust.title')}
      data-testid="context-trust-card"
    >
      <h4 className="text-xs font-medium text-text-primary">🐘 {t('chat.contextTrust.title')}</h4>
      {evidence.minimal ? (
        <p className="mt-1.5 text-[11px] text-text-secondary" data-testid="context-trust-minimal">
          {t('chat.contextTrust.minimal')}
        </p>
      ) : (
        <div className="mt-2 space-y-2" data-testid="context-trust-details">
          <p className="text-[11px] leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">{t('chat.contextTrust.whyNow')} </span>
            {evidence.signals.map((signal) => locale === 'en' ? signal.en : signal.zh).join(' · ')}
          </p>
          <EvidenceList title={t('chat.contextTrust.time')} items={evidence.time} testId="context-trust-time" />
          <EvidenceList title={t('chat.contextTrust.facts')} items={evidence.facts} testId="context-trust-facts" />
          <EvidenceList title={t('chat.contextTrust.history')} items={evidence.history} testId="context-trust-history" />
          <EvidenceList title={t('chat.contextTrust.conflicts')} items={evidence.conflicts} testId="context-trust-conflicts" />
        </div>
      )}

      <div className="mt-2 border-t border-glass-border pt-2">
        {correction ? (
          <p className="text-[11px] text-text-secondary" data-testid="context-trust-corrected">
            {t(`chat.contextTrust.ack.${correction}`)}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="context-trust-corrections">
            <span className="text-[11px] text-text-secondary">{t('chat.contextTrust.notQuite')}</span>
            {CONTEXT_TRUST_CORRECTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => handleCorrection(kind)}
                className="rounded-lg border border-glass-border px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-300"
                data-testid={`context-trust-correct-${kind}`}
              >
                {t(`chat.contextTrust.correction.${kind}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
