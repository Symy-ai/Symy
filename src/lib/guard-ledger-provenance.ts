/**
 * guard-ledger-provenance — read-only evidence classification over health_events.
 *
 * This module never changes an existing total. It only labels rows and exposes
 * count/day evidence plus an amount-free explanation for guarded hours.
 */

export const GUARD_EVIDENCE_SOURCES = [
  'auto_challenge',
  'chat_decision',
  'green_alt',
  'commitment',
  'manual',
  'reset_audit',
] as const;

export type GuardEvidenceSource = (typeof GUARD_EVIDENCE_SOURCES)[number];

export interface GuardEvidenceEventInput {
  id?: string | null;
  eventType?: string | null;
  triggerSource?: string | null;
  triggerId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface GuardEvidenceSummaryItem {
  source: GuardEvidenceSource;
  count: number;
  days: number;
  includedInWinCalculations: boolean;
}

export interface GuardEvidenceRow {
  id: string;
  date: string;
  source: GuardEvidenceSource;
  subject: string;
  category: string;
  includedInWinCalculations: boolean;
}

export interface GuardLedgerEvidence {
  status: 'insufficient' | 'ok';
  summary: GuardEvidenceSummaryItem[];
  latestRows: GuardEvidenceRow[];
  excludedRows: number;
}

export interface GuardedHoursExplanation {
  formula: 'guarded_amount_divided_by_private_hourly_rate';
  timeWindow: 'all_time';
  includedSources: GuardEvidenceSource[];
  deduplicationRule: 'trigger_id_else_id_else_source_event_created_at';
  timezone: string;
}

const CHAT_DECISION_SOURCES = new Set([
  'prepurchase',
  'prepurchase_followup',
  'compare_decision',
]);

const WIN_SOURCES = new Set<GuardEvidenceSource>(['auto_challenge', 'chat_decision', 'green_alt']);

function metadataOf(event: GuardEvidenceEventInput): Record<string, unknown> | null {
  return event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
}

export function classifyGuardEvidenceSource(
  event: GuardEvidenceEventInput,
): GuardEvidenceSource | null {
  const metadata = metadataOf(event);
  const source = typeof metadata?.source === 'string' ? metadata.source : null;
  const kind = typeof metadata?.kind === 'string' ? metadata.kind : null;

  if (event.eventType === 'manual_adjustment' && source === 'data_reset') return 'reset_audit';
  if (event.eventType === 'mindful_recovery') {
    if (kind === 'green_alt_adoption' || kind === 'reuse_adoption') return 'green_alt';
    return null;
  }
  if (event.eventType === 'challenge_completed' || event.eventType === 'challenge_failed') {
    return 'auto_challenge';
  }
  if (event.eventType === 'challenge_reward' && event.triggerSource === 'deposit_api') {
    return 'auto_challenge';
  }
  if (event.eventType === 'manual_adjustment') {
    if (source && CHAT_DECISION_SOURCES.has(source)) return 'chat_decision';
    if (source === 'green_commitment' || source === 'green_commitment_settlement') {
      return 'commitment';
    }
    return 'manual';
  }
  return null;
}

function eventTime(event: GuardEvidenceEventInput): number | null {
  const time = new Date(event.createdAt ?? 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : null;
}

function evidenceKey(
  event: GuardEvidenceEventInput,
  source: GuardEvidenceSource,
  fallbackIndex: number,
): string {
  const time = eventTime(event);
  return (
    event.triggerId ||
    event.id ||
    `${source}:${event.eventType || 'unknown'}:${time ?? 'unknown'}:${fallbackIndex}`
  );
}

function localDateKey(time: number): string {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function evidenceSubject(event: GuardEvidenceEventInput): string {
  const metadata = metadataOf(event);
  for (const key of ['subject', 'itemName', 'itemTitle', 'sideA', 'side_a']) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
  }
  if (event.description?.trim()) return event.description.trim().slice(0, 120);
  return '—';
}

function evidenceCategory(event: GuardEvidenceEventInput): string {
  const metadata = metadataOf(event);
  for (const key of ['category', 'categoryId']) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 40);
  }
  return 'other';
}

export function buildGuardLedgerEvidence(
  events: GuardEvidenceEventInput[] | null | undefined,
  latestCount = 3,
): GuardLedgerEvidence {
  const summary = new Map<GuardEvidenceSource, { count: number; days: Set<string> }>();
  const seen = new Set<string>();
  const rows: Array<GuardEvidenceRow & { time: number }> = [];
  let excludedRows = 0;

  (events || []).forEach((event, index) => {
    const source = classifyGuardEvidenceSource(event);
    if (!source) return;
    const key = evidenceKey(event, source, index);
    if (seen.has(key)) return;
    seen.add(key);

    const time = eventTime(event);
    if (!time) return;
    const dateKey = localDateKey(time);
    const current = summary.get(source) || { count: 0, days: new Set<string>() };
    current.count += 1;
    current.days.add(dateKey);
    summary.set(source, current);

    const includedInWinCalculations = WIN_SOURCES.has(source) && event.eventType !== 'challenge_failed';
    if (!includedInWinCalculations) excludedRows += 1;
    rows.push({
      id: event.id || key,
      date: dateKey,
      source,
      subject: evidenceSubject(event),
      category: evidenceCategory(event),
      includedInWinCalculations,
      time,
    });
  });

  rows.sort((a, b) => b.time - a.time || a.id.localeCompare(b.id));
  const totalRows = rows.length;

  return {
    status: totalRows ? 'ok' : 'insufficient',
    summary: GUARD_EVIDENCE_SOURCES.map((source) => ({
      source,
      count: summary.get(source)?.count ?? 0,
      days: summary.get(source)?.days.size ?? 0,
      includedInWinCalculations: WIN_SOURCES.has(source),
    })),
    latestRows: rows.slice(0, Math.max(0, latestCount)).map(({ time: _time, ...row }) => row),
    excludedRows,
  };
}

export function explainGuardedHours(
  timezone = 'UTC',
): GuardedHoursExplanation {
  return {
    formula: 'guarded_amount_divided_by_private_hourly_rate',
    timeWindow: 'all_time',
    includedSources: ['auto_challenge', 'chat_decision', 'green_alt'],
    deduplicationRule: 'trigger_id_else_id_else_source_event_created_at',
    timezone,
  };
}
