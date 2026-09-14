/**
 * context-trust — shopping advice evidence builder (pure, zero IO).
 *
 * Evidence is kept small and traceable: current conversation, explicit facts,
 * long-term behavior, then inference. Inference is always labeled as such and
 * conflicts are surfaced instead of silently resolved.
 */

export const TRUST_EVIDENCE_SOURCES = ['conversation', 'fact', 'history', 'inference'] as const;
export type TrustEvidenceSource = (typeof TRUST_EVIDENCE_SOURCES)[number];

export type ContextTrustCorrectionKind = 'not_me' | 'expired' | 'different_context';
export const CONTEXT_TRUST_CORRECTIONS: readonly ContextTrustCorrectionKind[] = [
  'not_me',
  'expired',
  'different_context',
];

export interface TrustEvidenceSignal {
  id: string;
  zh: string;
  en: string;
}

export interface TrustEvidenceItem {
  source: TrustEvidenceSource;
  zh: string;
  en: string;
  /** Only meaningful for inference; facts and current words remain facts. */
  inferred?: boolean;
  stale?: boolean;
}

export interface TrustEvidence {
  signals: TrustEvidenceSignal[];
  time: TrustEvidenceItem[];
  facts: TrustEvidenceItem[];
  history: TrustEvidenceItem[];
  /** Explicit-over-implicit conflicts shown to the user, never auto-hidden. */
  conflicts: TrustEvidenceItem[];
  /** Minimal card is allowed when only current conversation evidence exists. */
  minimal: boolean;
}

export interface ContextTrustInput {
  signal: string;
  words: ReadonlyArray<{ id: string; zh: string; en: string }>;
  facts?: ReadonlyArray<{
    category: 'preference' | 'size' | 'budget';
    key: string;
    value: string;
    updatedAt?: string | Date;
    stale?: boolean;
  }>;
  history?: ReadonlyArray<{ description: string; occurredAt?: string | Date }>;
  /** The most recent same-topic user correction, if any. */
  correction?: {
    kind: ContextTrustCorrectionKind;
    topic: string;
    occurredAt?: string | Date;
  } | null;
  now?: Date;
}

const FACT_STALE_DAYS = 180;
const HISTORY_REPETITION = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function atMs(value: string | Date | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function daysAgo(value: string | Date | undefined, now: Date): number | null {
  const parsed = atMs(value);
  return parsed === null ? null : Math.max(0, Math.round((now.getTime() - parsed) / DAY_MS));
}

export function buildTrustEvidence(input: ContextTrustInput): TrustEvidence | null {
  if (!input.words.length) return null;

  const now = input.now ?? new Date();
  const signals = input.words.map((word) => ({ ...word }));
  const facts: TrustEvidenceItem[] = [];
  const conflicts: TrustEvidenceItem[] = [];
  const hasFreshFact = input.facts?.some((fact) => !fact.stale && (daysAgo(fact.updatedAt, now) ?? Infinity) <= FACT_STALE_DAYS);

  for (const fact of input.facts ?? []) {
    const isStale = fact.stale || (daysAgo(fact.updatedAt, now) ?? 0) > FACT_STALE_DAYS;
    facts.push({
      source: 'fact',
      zh: `${fact.category === 'preference' ? '偏好' : fact.category === 'size' ? '尺码' : '预算'}：${fact.value}`,
      en: `${fact.category === 'preference' ? 'Preference' : fact.category === 'size' ? 'Size' : 'Budget'}: ${fact.value}`,
      stale: isStale,
    });
  }

  const history = (input.history ?? []).map<TrustEvidenceItem>((event) => ({
    source: 'history',
    zh: `相似场景：${event.description}`,
    en: `Similar context: ${event.description}`,
  }));

  if (input.correction) {
    const elapsed = daysAgo(input.correction.occurredAt, now) ?? 0;
    facts.push({
      source: 'conversation',
      zh: `你刚纠正过：${input.correction.topic} 不按之前那样理解`,
      en: `You just corrected this: ${input.correction.topic} should not be interpreted as before`,
    });
    if (elapsed <= 7) {
      history.push({
        source: 'inference',
        zh: '推测：这类建议需要先确认，不再沿用旧理解',
        en: 'Inferred: this kind of advice needs confirmation before reusing the old interpretation',
        inferred: true,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const event of input.history ?? []) {
    const key = event.description.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [, count] of counts) {
    if (count < HISTORY_REPETITION) continue;
    history.push({
      source: 'inference',
      zh: `推测：相似情况出现过 ${count} 次，可能是重复模式`,
      en: `Inferred: similar situations appeared ${count} times, possibly a repeating pattern`,
      inferred: true,
    });
  }

  if (facts.some((fact) => fact.stale) && facts.some((fact) => !fact.stale)) {
    conflicts.push({
      source: 'fact',
      zh: '部分事实较久未更新，我会把它们和较新的话分开看',
      en: 'Some facts have not been refreshed recently; I will separate them from newer input',
      stale: true,
    });
  }

  if (input.facts?.length && input.history?.length) {
    conflicts.push({
      source: 'inference',
      zh: '显式偏好与长期行为不完全一致时，以你明确说过的话优先',
      en: 'When explicit preferences and long-term behavior differ, what you explicitly said takes priority',
      inferred: true,
    });
  }

  const hasSupportingEvidence = !!hasFreshFact || history.length > 0;
  return {
    signals,
    time: [{
      source: 'conversation',
      zh: '依据你这句话里正在发生的信号',
      en: 'Based on the signal in what you just said',
    }],
    facts,
    history,
    conflicts,
    minimal: !hasSupportingEvidence,
  };
}

export function isContextTrustCorrection(value: unknown): value is ContextTrustCorrectionKind {
  return typeof value === 'string' && CONTEXT_TRUST_CORRECTIONS.includes(value as ContextTrustCorrectionKind);
}
