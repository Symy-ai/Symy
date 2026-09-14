/**
 * weekly-review — 小象引导式周复盘纯派生 (batch52-b)
 *
 * 周日晚小象发起 3–4 轮复盘对话: 数据回顾 → 自评 → 选最骄傲守护时刻 → 总结卡。
 * 本文件只管数据:
 * - 周界/三指标口径 100% 复用 weeklyGuardCompare (batch50-c), 禁止自写日期切周;
 * - 「本周复盘过没有」由 manual_adjustment 事件 metadata.week_key (周一日期,
 *   对齐 triggerId 式 key 约定) 去重判断 — 一周最多主动发起一次, 复用既有
 *   一次性派生锁防打扰, 不新增 cron;
 * - 自评与所选时刻写 manual_adjustment + metadata.source='weekly_review' (零 DDL)。
 *
 * 口径红线:
 * - 金额只在私有数据面; 分享面 (weekly-review-share) 结构上拿不到金额。
 * - 本周完全无守护数据 → status='noData', 前端走引导态, 不渲染假数据。
 */

import {
  localWeekStart,
  weeklyGuardCompare,
  type WeeklyGuardCompareResult,
  type WeeklyGuardEventInput,
} from '@/lib/weekly-guard-compare';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import type { CompletedWeeklyReview, WeeklyReviewCandidate, WeeklyReviewRating } from '@/types/weekly-review';

/** 复盘事件在 metadata.source 的标记 (manual_adjustment 的语义子类型) */
export const WEEKLY_REVIEW_SOURCE = 'weekly_review';

/** 最骄傲时刻候选上限 (本周有结局拦截太多时只给最近的几条, 不做长列表) */
export const MAX_PROUD_CANDIDATES = 4;

export type WeeklyReviewStatus = 'noData' | 'due' | 'reviewed';

export interface WeeklyReviewDerivation {
  status: WeeklyReviewStatus;
  /** 本周周一日期 (YYYY-MM-DD, localWeekStart 复用) — 写入 metadata.week_key */
  weekKey: string;
  /** 本周 vs 上周三指标 (batch50-c 同款聚合, 调用方不再另算) */
  compare: WeeklyGuardCompareResult;
  /** 最骄傲时刻候选 (本周有结局拦截, 最近在前, 去重 + 截断) */
  candidates: WeeklyReviewCandidate[];
  /** 本周已完成的复盘 (status='reviewed' 时非空), 供入口回看总结卡 */
  completed: CompletedWeeklyReview | null;
}

function metaOf(e: WeeklyGuardEventInput): Record<string, unknown> | null {
  return e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
}

/** 周复盘事件是否为本流写入 (供消费方过滤) */
export function isWeeklyReviewEvent(e: WeeklyGuardEventInput): boolean {
  if (e.eventType !== 'manual_adjustment') return false;
  const meta = metaOf(e);
  return !!meta && meta.source === WEEKLY_REVIEW_SOURCE;
}

/** 本周周一日期 key — 周界计算复用 weeklyGuardCompare 的 localWeekStart */
export function weekKeyOf(now: Date): string {
  const start = localWeekStart(now);
  const mm = String(start.getMonth() + 1).padStart(2, '0');
  const dd = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-${mm}-${dd}`;
}

function normalizeRating(v: unknown): WeeklyReviewRating | null {
  return v === 'exceeded' || v === 'okay' || v === 'tough' ? v : null;
}

/** 从既有复盘事件读回本周已完成的自评/所选时刻 (幂等: 取 weekKey 匹配的最近一条) */
function parseCompletedReview(
  events: WeeklyGuardEventInput[] | null | undefined,
  weekKey: string,
): CompletedWeeklyReview | null {
  let latest: { review: CompletedWeeklyReview; createdAt: string } | null = null;
  for (const e of events || []) {
    if (!isWeeklyReviewEvent(e)) continue;
    const meta = metaOf(e)!;
    if (meta.week_key !== weekKey) continue;
    const rating = normalizeRating(meta.rating);
    if (!rating) continue;
    const proudKey = typeof meta.proud_key === 'string' && meta.proud_key ? meta.proud_key : null;
    const proudLabel = typeof meta.proud_item === 'string' && meta.proud_item ? meta.proud_item : null;
    // 多条时取 createdAt 最近的
    if (!latest || e.createdAt > latest.createdAt) {
      latest = { review: { rating, proudKey, proudLabel }, createdAt: e.createdAt };
    }
  }
  return latest ? latest.review : null;
}

/**
 * 纯函数: 派生周复盘状态 + 候选时刻。
 * events 需含 challenge_completed / challenge_failed / challenge_reward /
 * manual_adjustment 四类 (调用方一次性拉齐, 与 use-weekly-review 约定)。
 */
export function deriveWeeklyReview(
  events: WeeklyGuardEventInput[] | null | undefined,
  now: Date,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): WeeklyReviewDerivation {
  const list = events || [];
  const weekStart = localWeekStart(now);
  const weekKey = weekKeyOf(now);
  const compare = weeklyGuardCompare(list, now, hourlyRate);

  // 候选: 本周有结局的拦截 (completed+failed, triggerId 去重), 最近在前, 截断
  const seen = new Set<string>();
  const settled: WeeklyGuardEventInput[] = [];
  for (const e of list) {
    if (!e || (e.eventType !== 'challenge_completed' && e.eventType !== 'challenge_failed')) continue;
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    const local = new Date(t);
    const inWeek = new Date(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes(), local.getSeconds(), local.getMilliseconds());
    if (inWeek < weekStart) continue;
    const key = e.triggerId || e.id || '';
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    settled.push(e);
  }
  settled.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const candidates: WeeklyReviewCandidate[] = settled.slice(0, MAX_PROUD_CANDIDATES).map((e) => {
    const meta = metaOf(e);
    const itemName = meta && typeof meta.itemName === 'string' && meta.itemName ? meta.itemName : null;
    return { key: e.triggerId || e.id || e.createdAt, itemName };
  });

  const completed = parseCompletedReview(list, weekKey);
  const thisHasData = compare.thisWeek.intercepts > 0 || compare.thisWeek.guardedAmount > 0;
  let status: WeeklyReviewStatus;
  if (!thisHasData) status = 'noData';
  else if (completed) status = 'reviewed';
  else status = 'due';

  return { status, weekKey, compare, candidates, completed };
}
