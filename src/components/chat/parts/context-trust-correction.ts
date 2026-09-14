'use client';

import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ContextTrustCorrectionKind } from '@/lib/context-trust';

const STORAGE_KEY = 'symy-context-trust-corrections';
const LOG_LIMIT = 20;

export interface LocalTrustCorrection {
  signalId: string;
  reason: ContextTrustCorrectionKind;
  at: number;
}

export function readTrustCorrections(): LocalTrustCorrection[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is LocalTrustCorrection =>
      !!entry && typeof entry === 'object' &&
      typeof (entry as LocalTrustCorrection).signalId === 'string' &&
      typeof (entry as LocalTrustCorrection).reason === 'string' &&
      typeof (entry as LocalTrustCorrection).at === 'number');
  } catch {
    // safe to ignore: malformed local cache should never block chat corrections.
    return [];
  }
}

export async function reportTrustCorrection(signalId: string, reason: ContextTrustCorrectionKind): Promise<void> {
  const at = Date.now();
  const log = readTrustCorrections();
  log.push({ signalId, reason, at });
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-LOG_LIMIT)));
  } catch {
    // Session-only privacy fallback: the current React state still applies.
  }

  try {
    await apiFetch('/api/buddy/health-events', {
      method: 'POST',
      body: {
        eventType: 'manual_adjustment',
        triggerSource: 'manual',
        triggerId: `context-trust-correction:${new Date(at).toISOString().slice(0, 10)}:${signalId}`,
        description: 'Context trust card correction',
        metadata: { source: 'context_trust_correction', signalId, reason },
      },
    });
  } catch (error) {
    // safe to ignore: correction UI already applied; audit can retry on a later click.
    logger.warn('[context-trust] correction report failed:', error instanceof Error ? error.message : String(error));
  }
}
