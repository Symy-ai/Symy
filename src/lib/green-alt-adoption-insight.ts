/**
 * Green Alt Adoption Insight — 替代采纳诊断聚合 (batch65-c)
 *
 * 只读消费既有 health_events:
 * - 采纳: mindful_recovery + metadata.kind='green_alt_adoption';
 * - 拒绝: manual_adjustment + metadata.source='green_alt_rejection';
 * - 7 天复购观察: challenge_failed 的同类别类目（品类字段不足时不计数）。
 *
 * 本模块只诊断“替代建议是否真的改变行为”，不重复拦截卡/冲动触发卡口径；
 * 输出仅含次数、天数、比例与 category id，结构上无金额与碳数值。
 */

import { greenAltCategoryOf, type GreenAltCategory } from './green-alt-category';
import {
  GREEN_ALT_REJECTION_SOURCE,
  isGreenAltRejectionReason,
  type GreenAltRejectionReason,
} from './green-alt-preference';

export const GREEN_ALT_INSIGHT_WINDOW_DAYS = 90;
export const GREEN_ALT_INSIGHT_MIN_SAMPLES = 5;
const DAY_MS = 86400000;

export interface GreenAltInsightEventInput {
  id?: string;
  eventType?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface GreenAltInsightCategoryCount {
  category: GreenAltCategory;
  count: number;
}

export interface GreenAltInsightReasonCount {
  reason: GreenAltRejectionReason;
  count: number;
}

export interface GreenAltAdoptionInsight {
  status: 'insufficient' | 'ok';
  totalSuggestions: number;
  adoptions: number;
  rejections: number;
  adoptionRate: number;
  activeDays: number;
  topAdoptionCategories: GreenAltInsightCategoryCount[];
  topRejectionReasons: GreenAltInsightReasonCount[];
  nonRepurchasesWithin7Days: number;
  observedAdoptions: number;
}

function eventTime(event: GreenAltInsightEventInput): number | null {
  if (!(event && event.createdAt)) return null;
  const date = event.createdAt instanceof Date ? event.createdAt : new Date(String(event.createdAt));
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function metadataOf(event: GreenAltInsightEventInput): Record<string, unknown> | null {
  return event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
}

function sortCounts<T>(rows: T[], countOf: (row: T) => number, keyOf: (row: T) => string): T[] {
  return rows.sort((a, b) => {
    const diff = countOf(b) - countOf(a);
    return diff !== 0 ? diff : keyOf(a).localeCompare(keyOf(b));
  });
}

function countRows<K extends string>(counts: Map<K, number>): Array<{ category: K; count: number }> {
  return [...counts.entries()].map(([key, count]) => ({ category: key, count }));
}

function normalizedGuardCategory(value: unknown): GreenAltCategory | null {
  return typeof value === 'string' && value.length > 0 ? (value as GreenAltCategory) : null;
}

function dedupKey(event: GreenAltInsightEventInput, fallbackPrefix: string): string {
  if (typeof event.triggerId === 'string' && event.triggerId) return `t:${event.triggerId}`;
  const meta = metadataOf(event);
  const identity = [JSON.stringify(meta ?? null), String(event.createdAt ?? ''), event.id ?? ''].join('|');
  return `${fallbackPrefix}:${identity}`;
}

export function aggregateGreenAltAdoptionInsight(
  events: readonly GreenAltInsightEventInput[] | null | undefined,
  now: Date = new Date(),
): GreenAltAdoptionInsight {
  const empty: GreenAltAdoptionInsight = {
    status: 'insufficient',
    totalSuggestions: 0,
    adoptions: 0,
    rejections: 0,
    adoptionRate: 0,
    activeDays: 0,
    topAdoptionCategories: [],
    topRejectionReasons: [],
    nonRepurchasesWithin7Days: 0,
    observedAdoptions: 0,
  };
  if (!events || events.length === 0) return empty;

  const nowMs = now.getTime();
  const windowStartMs = nowMs - GREEN_ALT_INSIGHT_WINDOW_DAYS * DAY_MS;
  const seen = new Set<string>();
  const adoptionCategories = new Map<GreenAltCategory, number>();
  const rejectionReasons = new Map<GreenAltRejectionReason, number>();
  const days = new Set<string>();
  const adoptedEvents: Array<{ atMs: number; category: GreenAltCategory }> = [];
  const laterFailures: Array<{ atMs: number; category: GreenAltCategory }> = [];
  let adoptions = 0;
  let rejections = 0;

  for (const event of events) {
    const atMs = eventTime(event);
    if (atMs === null || atMs < windowStartMs || atMs > nowMs) continue;
    const meta = metadataOf(event);
    

    if (event.eventType === 'mindful_recovery' && meta?.kind === 'green_alt_adoption') {
      const entryId = meta.entryId;
      if (typeof entryId !== 'string' || entryId.length === 0) continue;
      const key = dedupKey(event, 'adoption');
      if (seen.has(key)) continue;
      seen.add(key);
      adoptions += 1;
      days.add(new Date(atMs).toISOString().slice(0, 10));
      const metadataCategory = typeof meta.category === 'string' && meta.category.length > 0
        ? meta.category as GreenAltCategory
        : 'other';
      const category = metadataCategory !== 'other' ? metadataCategory : greenAltCategoryOf(entryId);
      adoptionCategories.set(category, (adoptionCategories.get(category) ?? 0) + 1);
      if (category !== 'other') adoptedEvents.push({ atMs, category });
    } else if (event.eventType === 'manual_adjustment' && meta?.source === GREEN_ALT_REJECTION_SOURCE) {
      const entryId = meta.entryId;
      const reason = meta.reason;
      if (typeof entryId !== 'string' || entryId.length === 0 || !isGreenAltRejectionReason(reason)) continue;
      const key = dedupKey(event, 'rejection');
      if (seen.has(key)) continue;
      seen.add(key);
      rejections += 1;
      days.add(new Date(atMs).toISOString().slice(0, 10));
      rejectionReasons.set(reason, (rejectionReasons.get(reason) ?? 0) + 1);
    } else if (event.eventType === 'challenge_failed') {
      const category = normalizedGuardCategory(meta?.category) as GreenAltCategory | null;
      if (category && category !== 'other') laterFailures.push({ atMs, category });
    }
  }

  const repurchased = adoptedEvents.filter((adopted) => laterFailures.some((failure) =>
    failure.category === adopted.category &&
    failure.atMs >= adopted.atMs &&
    failure.atMs - adopted.atMs <= 7 * DAY_MS,
  )).length;

  const totalSuggestions = adoptions + rejections;
  if (totalSuggestions < GREEN_ALT_INSIGHT_MIN_SAMPLES) return { ...empty, totalSuggestions, adoptions, rejections, observedAdoptions: adoptions };

  return {
    status: 'ok',
    totalSuggestions,
    adoptions,
    rejections,
    adoptionRate: Math.round((adoptions / totalSuggestions) * 100),
    activeDays: days.size,
    topAdoptionCategories: sortCounts(countRows(adoptionCategories), (r) => r.count, (r) => r.category).slice(0, 2),
    topRejectionReasons: sortCounts(
      [...rejectionReasons.entries()].map(([reason, count]) => ({ reason, count })),
      (row) => row.count,
      (row) => row.reason,
    ).slice(0, 1),
    nonRepurchasesWithin7Days: adoptedEvents.length - repurchased,
    observedAdoptions: adoptions,
  };
}
