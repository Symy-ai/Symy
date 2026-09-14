/**
 * context-trust-evidence — server-side privacy-safe evidence reads.
 *
 * Reuses health_events without exposing raw event text: history is projected to
 * short category labels, while corrections consume the existing audit rows.
 */

import type {
  ContextTrustCorrectionKind,
  ContextTrustInput,
} from '@/lib/context-trust';

export interface EvidenceStore {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): PromiseLike<{ data?: unknown[] | null; error?: { message?: string } | null }>;
        };
      };
    };
  };
}

interface EventRow {
  event_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

const HISTORY_LIMIT = 6;
const CORRECTION_LIMIT = 20;
const HISTORY_EVENT_TYPES = ['challenge_completed', 'challenge_failed'] as const;

function metadataCategory(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.category;
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

export async function loadContextTrustEvidence(
  userId: string,
  store: EvidenceStore,
): Promise<{
  history: ContextTrustInput['history'];
  correction: ContextTrustInput['correction'];
}> {
  const [historyResult, correctionResult] = await Promise.all([
    store.from('health_events')
      .select('event_type,metadata,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT * 4),
    store.from('health_events')
      .select('event_type,metadata,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CORRECTION_LIMIT),
  ]);

  const history = ((historyResult.data ?? []) as EventRow[])
    .filter((row) => HISTORY_EVENT_TYPES.includes(row.event_type as never))
    .map((row) => ({
      description: metadataCategory(row.metadata) ?? 'shopping decision',
      occurredAt: row.created_at ?? undefined,
    }))
    .slice(0, HISTORY_LIMIT);

  let correction: ContextTrustInput['correction'] = null;
  for (const row of (correctionResult.data ?? []) as EventRow[]) {
    const metadata = row.metadata;
    if (row.event_type !== 'manual_adjustment' || metadata?.source !== 'context_trust_correction') continue;
    const signalId = typeof metadata.signalId === 'string' ? metadata.signalId : '';
    const reason = metadata.reason;
    if (!signalId || reason !== 'not_me' && reason !== 'expired' && reason !== 'different_context') continue;
    correction = {
      kind: reason as ContextTrustCorrectionKind,
      topic: signalId,
      occurredAt: row.created_at ?? undefined,
    };
    break;
  }

  return { history, correction };
}
