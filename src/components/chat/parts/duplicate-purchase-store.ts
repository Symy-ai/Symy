'use client';

import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { DuplicatePrecheckCardData, DuplicatePrecheckDecision } from '@/types/duplicate-purchase';

const REUSE_PENDING_KEY = 'symy-duplicate-precheck-reuse-pending';

function localDateKey(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';
}

function triggerId(card: DuplicatePrecheckCardData, decision: DuplicatePrecheckDecision, now = Date.now()): string {
  return `duplicate-precheck:${localDateKey(now)}:${slug(card.itemTitle)}:${decision}`;
}

/**
 * 「家里有」确认 → 物品清单落一条 (batch81-c, BP 建库护城河)。
 * 仅 reuse 决策写入 (wait = 还没确认家里有); 'it' 是抽取失败的兜底标题,
 * 落库只会污染清单, 跳过。best-effort: 表未建 (503) / 网络失败只 warn。
 */
export function saveInventoryItemFromChat(card: DuplicatePrecheckCardData): void {
  if (card.itemTitle === 'it') return;
  apiFetch('/api/inventory', {
    method: 'POST',
    body: { item_name: card.itemTitle, category: card.category, source: 'chat' },
  }).catch((err: unknown) => {
    logger.warn('[duplicate-precheck] inventory save failed:', err instanceof Error ? err.message : String(err));
  });
}

export function reportDuplicateDecision(card: DuplicatePrecheckCardData, decision: DuplicatePrecheckDecision): void {
  const now = Date.now();
  apiFetch('/api/buddy/health-events', {
    method: 'POST',
    body: {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: triggerId(card, decision, now),
      description: 'Duplicate-purchase precheck decision',
      metadata: {
        source: 'duplicate_precheck',
        item: card.itemTitle,
        category: card.category,
        decision,
      },
    },
  }).catch((err: unknown) => {
    logger.warn('[duplicate-precheck] decision report failed:', err instanceof Error ? err.message : String(err));
  });
  // reuse = 确认「家里有」→ 顺手建库 (wait 不写)
  if (decision === 'reuse') saveInventoryItemFromChat(card);
}

export function savePendingReuseConfirmation(card: DuplicatePrecheckCardData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REUSE_PENDING_KEY, JSON.stringify({
      itemTitle: card.itemTitle,
      category: card.category,
      decisionId: triggerId(card, 'reuse'),
      askedAt: Date.now(),
      dueAt: Date.now() + 24 * 60 * 60 * 1000,
    }));
  } catch {
    // best-effort follow-up
  }
}

export function getDueReuseConfirmation(now = Date.now()): { card: DuplicatePrecheckCardData; decisionId: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REUSE_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { itemTitle?: unknown; category?: unknown; decisionId?: unknown; dueAt?: unknown };
    if (typeof parsed.itemTitle !== 'string' || typeof parsed.category !== 'string' || typeof parsed.decisionId !== 'string' || typeof parsed.dueAt !== 'number' || parsed.dueAt > now) return null;
    return { card: { itemTitle: parsed.itemTitle, category: parsed.category as DuplicatePrecheckCardData['category'] }, decisionId: parsed.decisionId };
  } catch {
    // safe to ignore: corrupted localStorage entry is treated as "no pending confirmation"
    return null;
  }
}

export function clearPendingReuseConfirmation(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(REUSE_PENDING_KEY); } catch { /* best-effort */ }
}


export function reportReuseConclusion(
  decisionId: string,
  avoidedPurchase: boolean,
  onReportFailure?: () => void,
): Promise<void> {
  return apiFetch<void>('/api/buddy/health-events', {
    method: 'POST',
    body: {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: `${decisionId}:conclusion`,
      description: 'Duplicate-purchase reuse follow-up conclusion',
      metadata: { source: 'duplicate_precheck', decision: 'reuse', followUpAvoidedPurchase: avoidedPurchase },
    },
  }).catch((err: unknown) => {
    logger.warn('[duplicate-precheck] conclusion report failed:', err instanceof Error ? err.message : String(err));
    onReportFailure?.();
  });
}
