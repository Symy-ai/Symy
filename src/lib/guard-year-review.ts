/**
 * guard-year-review — 年度守护画像纯聚合 (batch66-a)
 *
 * 只读消费既有 health_events：拦截、放行、绿色替代/复用、承诺结算。
 * 输出年度趋势、域稳定度、采纳结构与上一周期对比；金额只作为内部换算输入，
 * 输出仅保留小时/次数/天数。纯函数、零 IO、零 DDL。
 */

import { DEFAULT_HOURLY_RATE, moneyToHours } from '@/lib/freedom-time';
import { resolveGuardCategory, OTHER_CATEGORY } from '@/lib/guard-category-insight';
import { greenAltCategoryOf, type GreenAltCategory } from '@/lib/green-alt-category';
import { REUSE_CATEGORIES, type ReuseCategory } from '@/lib/reuse-categories';
import {
  GREEN_COMMITMENT_SETTLEMENT_SOURCE,
  GREEN_COMMITMENT_SOURCE,
} from '@/lib/green-commitment';
import type { TrendDirection } from '@/lib/weekly-guard-compare';

export const GUARD_YEAR_MIN_ACTIONS = 5;
export const GUARD_YEAR_MIN_MONTHS = 3;
export const GUARD_YEAR_MIN_SCENE_SAMPLE = 3;

const DAY_MS = 86400000;
const REPEAT_PURCHASE_ENTRY_IDS = new Set(['ebook_repurchase', 'music_repurchase']);
const HOARDING_ENTRY_IDS = new Set(['audiobook_stockpile', 'course_backlog_first', 'cloud_storage_declutter']);
const REUSE_CATEGORY_IDS = new Set<ReuseCategory>(REUSE_CATEGORIES.map((category) => category.id));

export interface GuardYearReviewEventInput {
  id?: string | null;
  eventType?: string | null;
  triggerSource?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface GuardYearReviewOptions {
  now?: Date;
  year?: number;
  hourlyRate?: number;
  locale?: string;
}

export interface GuardYearMonthPoint {
  month: number;
  intercepts: number;
  commitments: number;
  adoptions: number;
  released: number;
  hoursReclaimed: number;
  longestStreakDays: number;
}

export interface GuardYearSceneRow {
  category: string;
  categorySource: 'guard' | 'green-alt' | 'reuse' | 'commitment';
  actions: number;
  released: number;
  activeDays: number;
  stability: number;
  status: 'ok' | 'insufficient';
}

export interface GuardYearReviewPrivate {
  hoursReclaimed: number;
  avoidedImpulsePurchases: number;
  avoidedRepeatPurchases: number;
  avoidedHoarding: number;
  reuseAdoptions: number;
}

export interface GuardYearReview {
  status: 'insufficient' | 'ok';
  year: number;
  months: GuardYearMonthPoint[];
  steadiestMonth: number | null;
  steadiestScenes: GuardYearSceneRow[];
  needsCareScenes: GuardYearSceneRow[];
  alternativeAdoptionCategories: Array<{ category: GreenAltCategory; count: number }>;
  longestStreakDays: number;
  activeMonths: number;
  totals: {
    intercepts: number;
    commitments: number;
    adoptions: number;
  };
  yearOverYear: {
    previousYear: number;
    status: 'noBaseline' | 'ok';
    intercepts: TrendDirection;
    adoptions: TrendDirection;
    hours: TrendDirection;
    longestStreakDays: TrendDirection;
  };
  monthOverMonth: {
    currentMonth: number | null;
    previousMonth: number | null;
    status: 'noBaseline' | 'ok';
    intercepts: TrendDirection;
    adoptions: TrendDirection;
    hours: TrendDirection;
  };
  last30Days: {
    actions: number;
    activeDays: number;
    hoursReclaimed: number;
  };
  private: GuardYearReviewPrivate;
}

export interface GuardYearReviewShare {
  year: number;
  intercepts: number;
  commitments: number;
  adoptions: number;
  longestStreakDays: number;
  steadiestMonth: number | null;
}

type ClassifiedEvent =
  | { kind: 'intercept'; category: string; hours: number }
  | { kind: 'released'; category: string }
  | { kind: 'greenAlt'; category: GreenAltCategory; hours: number; entryId: string }
  | { kind: 'reuse'; category: string; hours: number }
  | { kind: 'commitment'; category: string };

interface MutableMonth {
  intercepts: number;
  commitments: number;
  adoptions: number;
  released: number;
  hours: number;
  days: Set<string>;
}

interface MutableScene {
  categorySource: GuardYearSceneRow['categorySource'];
  actions: number;
  released: number;
  days: Set<string>;
}

function metadataOf(event: GuardYearReviewEventInput): Record<string, unknown> | null {
  return event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
}

function dateOf(event: GuardYearReviewEventInput): Date | null {
  if (!event.createdAt) return null;
  const date = event.createdAt instanceof Date ? event.createdAt : new Date(String(event.createdAt));
  return Number.isFinite(date.getTime()) ? date : null;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function positiveNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizedRate(rate: number | undefined): number {
  return Number.isFinite(rate) && (rate as number) > 0 ? (rate as number) : DEFAULT_HOURLY_RATE;
}

function guardHours(metadata: Record<string, unknown> | null, rate: number): number {
  const snapshot = positiveNumber(metadata?.hours_snapshot);
  if (snapshot > 0) return snapshot;
  return moneyToHours(positiveNumber(metadata?.savedAmount), rate);
}

function guardCategory(metadata: Record<string, unknown> | null): string {
  const itemTitle = typeof metadata?.itemTitle === 'string' && metadata.itemTitle.trim()
    ? metadata.itemTitle
    : typeof metadata?.itemName === 'string' ? metadata.itemName : undefined;
  return resolveGuardCategory({ category: metadata?.category, itemTitle });
}

function reuseCategory(metadata: Record<string, unknown> | null): ReuseCategory | null {
  const category = metadata?.categoryId;
  if (typeof category !== 'string' || !REUSE_CATEGORY_IDS.has(category as ReuseCategory)) return null;
  return category as ReuseCategory;
}

function classifyEvent(event: GuardYearReviewEventInput, rate: number): ClassifiedEvent | null {
  const metadata = metadataOf(event);
  if (!event.eventType) return null;

  if (event.eventType === 'challenge_completed') {
    return { kind: 'intercept', category: guardCategory(metadata), hours: guardHours(metadata, rate) };
  }
  if (event.eventType === 'challenge_failed') {
    return { kind: 'released', category: guardCategory(metadata) };
  }
  if (event.eventType === 'mindful_recovery' && metadata?.kind === 'green_alt_adoption') {
    const entryId = typeof metadata.entryId === 'string' ? metadata.entryId : '';
    if (!entryId) return null;
    const row: ClassifiedEvent = {
      kind: 'greenAlt',
      category: greenAltCategoryOf(entryId),
      hours: moneyToHours(positiveNumber(metadata.estSaved), rate),
      entryId,
    };
    return row;
  }
  if (event.eventType === 'mindful_recovery' && metadata?.kind === 'reuse_adoption') {
    const category = reuseCategory(metadata);
    if (!category) return null;
    return { kind: 'reuse', category, hours: moneyToHours(positiveNumber(metadata.estSaved), rate) };
  }
  return null;
}

function commitmentCategory(
  metadata: Record<string, unknown> | null,
  categoriesByRefKey: Map<string, string>,
): string | null {
  if (!metadata || metadata.source !== GREEN_COMMITMENT_SETTLEMENT_SOURCE || metadata.outcome !== 'kept') return null;
  const refKey = typeof metadata.ref_key === 'string' ? metadata.ref_key : '';
  const category = categoriesByRefKey.get(refKey);
  return category && category !== OTHER_CATEGORY ? category : null;
}

function buildCommitmentCategories(events: readonly GuardYearReviewEventInput[]): Map<string, string> {
  const categories = new Map<string, string>();
  for (const event of events) {
    if (event.eventType !== 'manual_adjustment') continue;
    const metadata = metadataOf(event);
    if (!metadata || metadata.source !== GREEN_COMMITMENT_SOURCE) continue;
    const startKey = typeof metadata.start_key === 'string' ? metadata.start_key : '';
    const endKey = typeof metadata.end_key === 'string' ? metadata.end_key : '';
    if (!startKey || !endKey) continue;
    const subject = typeof metadata.subject === 'string' && metadata.subject.trim() ? metadata.subject : undefined;
    categories.set(`${startKey}#${endKey}`, guardCategory({ category: metadata.category, itemTitle: subject }));
  }
  return categories;
}

function emptyMonth(_month: number): MutableMonth {
  return { intercepts: 0, commitments: 0, adoptions: 0, released: 0, hours: 0, days: new Set() };
}

function trend(current: number, previous: number): TrendDirection {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

function longestRun(dayKeys: readonly string[]): number {
  const ordinals = [...new Set(dayKeys)]
    .map((key) => {
      const [year, month, day] = key.split('-').map(Number);
      return Math.floor(Date.UTC(year, month, day) / DAY_MS);
    })
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const ordinal of ordinals) {
    run = ordinal === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = ordinal;
  }
  return best;
}

function publicMonth(month: MutableMonth, index: number): GuardYearMonthPoint {
  return {
    month: index,
    intercepts: month.intercepts,
    commitments: month.commitments,
    adoptions: month.adoptions,
    released: month.released,
    hoursReclaimed: month.hours,
    longestStreakDays: longestRun([...month.days]),
  };
}

function sceneRows(scenes: Map<string, MutableScene>): GuardYearSceneRow[] {
  return [...scenes.entries()].map(([category, scene]) => {
    const sample = scene.actions + scene.released;
    const enough = sample >= GUARD_YEAR_MIN_SCENE_SAMPLE;
    const row: GuardYearSceneRow = {
      category,
      categorySource: scene.categorySource,
      actions: scene.actions,
      released: scene.released,
      activeDays: scene.days.size,
      stability: enough ? scene.actions / sample : 0,
      status: enough ? 'ok' : 'insufficient',
    };
    return row;
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
    if (b.actions !== a.actions) return b.actions - a.actions;
    if (a.status === 'ok' && a.stability !== b.stability) return b.stability - a.stability;
    return a.category.localeCompare(b.category);
  });
}

function monthCompare(months: readonly GuardYearMonthPoint[]): GuardYearReview['monthOverMonth'] {
  const active = months.filter((month) => month.intercepts + month.commitments + month.adoptions > 0);
  const current = active.at(-1) ?? null;
  const previous = current ? months[current.month - 1] ?? null : null;
  if (!current || !previous) {
    return {
      currentMonth: current?.month ?? null,
      previousMonth: null,
      status: 'noBaseline',
      intercepts: 'flat',
      adoptions: 'flat',
      hours: 'flat',
    };
  }
  const previousActive = previous.intercepts + previous.commitments + previous.adoptions > 0;
  return {
    currentMonth: current.month,
    previousMonth: previous.month,
    status: previousActive ? 'ok' : 'noBaseline',
    intercepts: trend(current.intercepts, previous.intercepts),
    adoptions: trend(current.adoptions, previous.adoptions),
    hours: trend(current.hoursReclaimed, previous.hoursReclaimed),
  };
}

function emptyReview(year: number): GuardYearReview {
  return {
    status: 'insufficient',
    year,
    months: Array.from({ length: 12 }, (_, index) => publicMonth(emptyMonth(index), index)),
    steadiestMonth: null,
    steadiestScenes: [],
    needsCareScenes: [],
    alternativeAdoptionCategories: [],
    longestStreakDays: 0,
    activeMonths: 0,
    totals: { intercepts: 0, commitments: 0, adoptions: 0 },
    yearOverYear: {
      previousYear: year - 1,
      status: 'noBaseline',
      intercepts: 'flat',
      adoptions: 'flat',
      hours: 'flat',
      longestStreakDays: 'flat',
    },
    monthOverMonth: {
      currentMonth: null,
      previousMonth: null,
      status: 'noBaseline',
      intercepts: 'flat',
      adoptions: 'flat',
      hours: 'flat',
    },
    last30Days: { actions: 0, activeDays: 0, hoursReclaimed: 0 },
    private: {
      hoursReclaimed: 0,
      avoidedImpulsePurchases: 0,
      avoidedRepeatPurchases: 0,
      avoidedHoarding: 0,
      reuseAdoptions: 0,
    },
  };
}

/**
 * 聚合年度守护画像。无效时间/metadata 静默跳过；样本不足时保留最近 30 天
 * 与稳定空结构，不伪造年度结论。
 */
export function buildGuardYearReview(
  events: readonly GuardYearReviewEventInput[] | null | undefined,
  options: GuardYearReviewOptions = {},
): GuardYearReview {
  const now = options.now ?? new Date();
  const year = Number.isInteger(options.year) ? options.year as number : now.getFullYear();
  const rate = normalizedRate(options.hourlyRate);
  const review = emptyReview(year);
  const months = Array.from({ length: 12 }, (_, index) => emptyMonth(index));
  const previousMonths = Array.from({ length: 12 }, () => emptyMonth(0));
  const scenes = new Map<string, MutableScene>();
  const alternativeCategories = new Map<GreenAltCategory, number>();
  const yearDays = new Set<string>();
  const last30Days = { actions: 0, days: new Set<string>(), hours: 0 };
  const commitmentCategories = buildCommitmentCategories(events ?? []);
  const seen = new Set<string>();

  for (const event of events ?? []) {
    if (!event) continue;
    const date = dateOf(event);
    if (!date) continue;
    const metadata = metadataOf(event);
    const classified = classifyEvent(event, rate);
    const commitment = event.eventType === 'manual_adjustment'
      ? commitmentCategory(metadata, commitmentCategories)
      : null;
    if (!classified && !commitment) continue;

    const kind = commitment ? 'commitment' : (classified as ClassifiedEvent)['kind'];
    const dedupKey = `${kind}:${event.triggerId || event.id || `${date.getTime()}:${event.eventType}`}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const eventYear = date.getFullYear();
    const monthIndex = date.getMonth();
    const bucket = eventYear === year ? months[monthIndex] : eventYear === year - 1 ? previousMonths[monthIndex] : null;
    if (!bucket) continue;
    const day = localDayKey(date);

    if (classified?.kind === 'intercept') {
      bucket.intercepts += 1;
      bucket.hours += classified.hours;
      bucket.days.add(day);
      if (eventYear === year) {
        review.private.avoidedImpulsePurchases += 1;
        review.private.hoursReclaimed += classified.hours;
        const scene = scenes.get(classified.category) ?? { categorySource: 'guard', actions: 0, released: 0, days: new Set() };
        scene.actions += 1;
        scene.days.add(day);
        scenes.set(classified.category, scene);
        yearDays.add(day);
      }
    } else if (classified?.kind === 'released') {
      bucket.released += 1;
      if (eventYear === year) {
        const scene = scenes.get(classified.category) ?? { categorySource: 'guard', actions: 0, released: 0, days: new Set() };
        scene.released += 1;
        scene.days.add(day);
        scenes.set(classified.category, scene);
      }
    } else if (classified?.kind === 'greenAlt') {
      bucket.adoptions += 1;
      bucket.hours += classified.hours;
      bucket.days.add(day);
      if (eventYear === year) {
        review.private.hoursReclaimed += classified.hours;
        if (REPEAT_PURCHASE_ENTRY_IDS.has(classified.entryId)) review.private.avoidedRepeatPurchases += 1;
        if (HOARDING_ENTRY_IDS.has(classified.entryId)) review.private.avoidedHoarding += 1;
        alternativeCategories.set(classified.category, (alternativeCategories.get(classified.category) ?? 0) + 1);
        const scene = scenes.get(classified.category) ?? { categorySource: 'green-alt', actions: 0, released: 0, days: new Set() };
        scene.actions += 1;
        scene.days.add(day);
        scenes.set(classified.category, scene);
        yearDays.add(day);
      }
    } else if (classified?.kind === 'reuse') {
      bucket.adoptions += 1;
      bucket.hours += classified.hours;
      bucket.days.add(day);
      if (eventYear === year) {
        review.private.hoursReclaimed += classified.hours;
        review.private.reuseAdoptions += 1;
        const scene = scenes.get(classified.category) ?? { categorySource: 'reuse', actions: 0, released: 0, days: new Set() };
        scene.actions += 1;
        scene.days.add(day);
        scenes.set(classified.category, scene);
        yearDays.add(day);
      }
    } else if (commitment) {
      bucket.commitments += 1;
      bucket.days.add(day);
      if (eventYear === year) {
        const scene = scenes.get(commitment) ?? { categorySource: 'commitment', actions: 0, released: 0, days: new Set() };
        scene.actions += 1;
        scene.days.add(day);
        scenes.set(commitment, scene);
        yearDays.add(day);
      }
    }

    if (eventYear === year) {
      const nowTime = now.getTime();
      const within30Days = nowTime - date.getTime() <= 30 * DAY_MS && date.getTime() <= nowTime;
      const action = classified?.kind === 'intercept' || classified?.kind === 'greenAlt' || classified?.kind === 'reuse' || Boolean(commitment);
      if (action && within30Days) {
        last30Days.actions += 1;
        last30Days.days.add(day);
        last30Days.hours += classified?.kind === 'released' ? 0
          : classified?.kind === 'intercept' || classified?.kind === 'greenAlt' || classified?.kind === 'reuse'
            ? classified.hours
            : 0;
      }
    }
  }

  review.months = months.map(publicMonth);
  review.totals = {
    intercepts: months.reduce((sum, month) => sum + month.intercepts, 0),
    commitments: months.reduce((sum, month) => sum + month.commitments, 0),
    adoptions: months.reduce((sum, month) => sum + month.adoptions, 0),
  };
  review.longestStreakDays = longestRun([...yearDays]);
  review.activeMonths = months.filter((month) => month.intercepts + month.commitments + month.adoptions > 0).length;
  review.steadiestMonth = review.months.reduce<number | null>((best, month) => {
    const score = month.intercepts + month.commitments + month.adoptions;
    const currentScore = best === null ? 0 : review.months[best].intercepts + review.months[best].commitments + review.months[best].adoptions;
    return score > currentScore ? month.month : best;
  }, null);

  const rows = sceneRows(scenes);
  review.steadiestScenes = rows.filter((row) => row.status === 'ok').slice(0, 3);
  review.needsCareScenes = rows
    .filter((row) => row.status === 'ok' && row.released > 0)
    .sort((a, b) => b.released - a.released || a.stability - b.stability)
    .slice(0, 2);
  review.alternativeAdoptionCategories = [...alternativeCategories.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  review.private.hoursReclaimed = Number(review.private.hoursReclaimed.toFixed(4));
  review.last30Days = {
    actions: last30Days.actions,
    activeDays: last30Days.days.size,
    hoursReclaimed: Number(last30Days.hours.toFixed(4)),
  };
  review.monthOverMonth = monthCompare(review.months);

  const previousTotals = {
    intercepts: previousMonths.reduce((sum, month) => sum + month.intercepts, 0),
    adoptions: previousMonths.reduce((sum, month) => sum + month.adoptions, 0),
    hours: previousMonths.reduce((sum, month) => sum + month.hours, 0),
  };
  const previousDays = new Set<string>();
  for (const month of previousMonths) month.days.forEach((day) => previousDays.add(day));
  const previousStreak = longestRun([...previousDays]);
  const previousHasData = previousTotals.intercepts + previousTotals.adoptions > 0;
  review.yearOverYear = {
    previousYear: year - 1,
    status: previousHasData ? 'ok' : 'noBaseline',
    intercepts: previousHasData ? trend(review.totals.intercepts, previousTotals.intercepts) : 'flat',
    adoptions: previousHasData ? trend(review.totals.adoptions, previousTotals.adoptions) : 'flat',
    hours: previousHasData ? trend(review.private.hoursReclaimed, previousTotals.hours) : 'flat',
    longestStreakDays: previousHasData ? trend(review.longestStreakDays, previousStreak) : 'flat',
  };

  const totalActions = review.totals.intercepts + review.totals.commitments + review.totals.adoptions;
  review.status = totalActions >= GUARD_YEAR_MIN_ACTIONS && review.activeMonths >= GUARD_YEAR_MIN_MONTHS ? 'ok' : 'insufficient';
  return review;
}

/** 分享面投影 — 结构上只有次数/天数/月份，无金额与碳数值。 */
export function buildGuardYearReviewShare(review: GuardYearReview): GuardYearReviewShare {
  return {
    year: review.year,
    intercepts: review.totals.intercepts,
    commitments: review.totals.commitments,
    adoptions: review.totals.adoptions,
    longestStreakDays: review.longestStreakDays,
    steadiestMonth: review.steadiestMonth,
  };
}
