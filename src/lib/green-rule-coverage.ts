import type { GreenAlternativeEntry } from './green-alt-types';

const WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

export interface GreenRuleCoverageEvent {
  eventType?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface GreenRuleCoverageGap {
  key: string;
  count: number;
}

export interface GreenRuleCoverageResult {
  status: 'noData' | 'noEntries' | 'healthy' | 'partial';
  totalEntries: number;
  totalEvents: number;
  matchedEvents: number;
  coverageRate: number;
  activeDays: number;
  categoryGaps: readonly GreenRuleCoverageGap[];
  triggerGaps: readonly GreenRuleCoverageGap[];
  recentEntryIds: readonly string[];
  topTriggeredEntryIds: readonly GreenRuleCoverageGap[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function textOf(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return '';
  return ['itemTitle', 'item', 'title']
    .map((key) => (typeof metadata[key] === 'string' ? String(metadata[key]) : ''))
    .filter(Boolean)
    .join(' ');
}

function categoryOf(metadata: Record<string, unknown> | null | undefined): string {
  const category = metadata?.category ?? metadata?.categoryName;
  return typeof category === 'string' && normalize(category) ? category : 'unclassified';
}

function bump(map: Map<string, number>, key: string): void {
  map.set(normalize(key), (map.get(normalize(key)) ?? 0) + 1);
}

function top(map: Map<string, number>, limit: number): GreenRuleCoverageGap[] {
  return [...map]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function analyzeGreenRuleCoverage(
  entries: readonly GreenAlternativeEntry[],
  rawEvents: readonly GreenRuleCoverageEvent[] | null | undefined,
  now: Date = new Date(),
): GreenRuleCoverageResult {
  if (entries.length === 0) {
    return {
      status: 'noEntries', totalEntries: 0, totalEvents: 0, matchedEvents: 0, coverageRate: 0,
      activeDays: 0, categoryGaps: [], triggerGaps: [], recentEntryIds: [], topTriggeredEntryIds: [],
    };
  }

  const events = (rawEvents ?? [])
    .filter((event) => {
      const date = event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt ?? 0);
      return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime() && now.getTime() - date.getTime() <= WINDOW_DAYS * DAY_MS;
    });

  if (events.length === 0) {
    return {
      status: 'noData', totalEntries: entries.length, totalEvents: 0, matchedEvents: 0, coverageRate: 0,
      activeDays: 0, categoryGaps: [], triggerGaps: [], recentEntryIds: entries.slice(-5).map((entry) => entry.id).reverse(), topTriggeredEntryIds: [],
    };
  }

  const normalizedEntries = entries.map((entry) => ({
    id: entry.id,
    triggers: [...entry.triggers.zh, ...entry.triggers.en].map(normalize).filter(Boolean),
  }));
  const categoryCounts = new Map<string, number>();
  const triggerCounts = new Map<string, number>();
  const entryCounts = new Map<string, number>();
  const days = new Set<string>();
  let matchedEvents = 0;

  for (const event of events) {
    const date = event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt as string);
    days.add(date.toISOString().slice(0, 10));
    const itemText = normalize(textOf(event.metadata));
    const text = itemText;
    const matches = normalizedEntries.filter((entry) => entry.triggers.some((trigger) => text.includes(trigger)));
    if (matches.length > 0) {
      matchedEvents += 1;
      for (const match of matches) bump(entryCounts, match.id);
      continue;
    }
    bump(categoryCounts, categoryOf(event.metadata));
    if (text) bump(triggerCounts, text);
  }

  const categoryGaps = top(categoryCounts, 5);
  const triggerGaps = top(triggerCounts, 5);
  return {
    status: categoryGaps.length === 0 && triggerGaps.length === 0 ? 'healthy' : 'partial',
    totalEntries: entries.length,
    totalEvents: events.length,
    matchedEvents,
    coverageRate: matchedEvents / events.length,
    activeDays: days.size,
    categoryGaps,
    triggerGaps,
    recentEntryIds: entries.slice(-5).map((entry) => entry.id).reverse(),
    topTriggeredEntryIds: top(entryCounts, 5),
  };
}
