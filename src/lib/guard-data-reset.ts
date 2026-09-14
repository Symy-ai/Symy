/**
 * guard-data-reset — 守护数据清除规划 (batch59-b)
 *
 * "轻装上阵": 用户有权查看规模、清除或重置自己的守护数据。本模块是纯规划层:
 * 输入事件列表 + 清除轨道, 输出将删除的条数/覆盖天数与保留清单 — 让用户
 * 在确认前看清自己在删什么。
 *
 * 口径红线:
 * - 金额结构性分离: estSaved/savedAmount 合计只出现在 GuardDataResetPrivateImpact
 *   (App 内私享提醒, 58-b in-app 先例); GuardDataResetPlan 类型上无任何金额字段,
 *   供庆祝面/保留清单等非私享场景安全使用。
 * - 非羞辱: 本模块只算"轻装"的规模, 不区分成败 (challenge_failed 等本就不在
 *   读取通道里, 58-a 同口径)。
 * - 纯函数 / 零 IO / 零 DDL; estSaved 字段缺失/非法容错为 0 (momentSaved 同款)。
 */

/** 清除轨道: 仅拦截挑战 / 仅替代与复用 / 全部守护记录 */
export type GuardResetLane = 'challenge' | 'alt_reuse' | 'all';

export const GUARD_RESET_LANES: readonly GuardResetLane[] = ['challenge', 'alt_reuse', 'all'];

/** 聚合输入: 一条 health_events 的最小形状 (与 guard-moments 同款) */
export interface GuardResetEventInput {
  eventType?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

/** 数据规模总览 (只读, 无金额) */
export interface GuardDataOverview {
  status: 'empty' | 'insufficient' | 'ok';
  totalEvents: number;
  activeDays: number;
  /** 最早记录日期 (本地时区); 无有效记录为 null */
  earliestDate: Date | null;
}

/** 清除规划 (amount-free): 条数/天数/保留清单, 无任何金额字段 */
export interface GuardDataResetPlan {
  lane: GuardResetLane;
  /** 将删除的条数 (triggerId 去重后, 58-a 同口径) */
  eventCount: number;
  /** 将删除事件覆盖的自然天数 (本地时区, 去重) */
  coveredDays: number;
  /** 保留清单: 各轨道留下的条数 */
  retained: { challenge: number; alt: number; reuse: number };
}

/**
 * 清除的金额影响 — App 内私享 only (确认弹层"知情提醒"),
 * 永不进庆祝面/分享面 (结构性分离: 需要金额的场景必须显式取本类型)。
 */
export interface GuardDataResetPrivateImpact {
  /** 将删除事件的省钱估算合计 (guard=savedAmount, alt/reuse=estSaved) */
  estSavedTotal: number;
}

function classifyLane(e: GuardResetEventInput): 'challenge' | 'alt' | 'reuse' | null {
  if (e.eventType === 'challenge_completed') return 'challenge';
  const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
  if (e.eventType === 'mindful_recovery' && meta) {
    if (meta.kind === 'green_alt_adoption') return 'alt';
    if (meta.kind === 'reuse_adoption') return 'reuse';
  }
  return null;
}

/** 该条省钱估算: guard=savedAmount, alt/reuse=estSaved; 无效/非正数为 0 */
function eventSaved(e: GuardResetEventInput, lane: 'challenge' | 'alt' | 'reuse'): number {
  const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
  if (!meta) return 0;
  const raw = lane === 'challenge' ? meta.savedAmount : meta.estSaved;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseDate(e: GuardResetEventInput): Date | null {
  const d = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
  return Number.isFinite(d.getTime()) ? d : null;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 数据规模总览: N 条 · 覆盖 M 天 · 最早记录日期; 不足 5 条 insufficient (58-b warm note 同阈值) */
export function summarizeGuardData(
  events: GuardResetEventInput[] | null | undefined,
): GuardDataOverview {
  const valid = collectGuardEvents(events);
  if (valid.length === 0) {
    return { status: 'empty', totalEvents: 0, activeDays: 0, earliestDate: null };
  }

  const days = new Set<string>();
  let earliest: Date | null = null;
  for (const { event } of valid) {
    const d = parseDate(event);
    if (!d) continue;
    days.add(dayKey(d));
    if (!earliest || d < earliest) earliest = d;
  }

  return {
    status: valid.length < 5 ? 'insufficient' : 'ok',
    totalEvents: valid.length,
    activeDays: days.size,
    earliestDate: earliest,
  };
}

/** 归一 + 去重后的守护事件 (三轨, triggerId 去重) */
function collectGuardEvents(
  events: GuardResetEventInput[] | null | undefined,
): Array<{ lane: 'challenge' | 'alt' | 'reuse'; event: GuardResetEventInput }> {
  if (!events) return [];
  const seen = new Set<string>();
  const out: Array<{ lane: 'challenge' | 'alt' | 'reuse'; event: GuardResetEventInput }> = [];
  for (const e of events) {
    if (!e) continue;
    const lane = classifyLane(e);
    if (!lane) continue;
    if (typeof e.triggerId === 'string' && e.triggerId) {
      if (seen.has(e.triggerId)) continue;
      seen.add(e.triggerId);
    }
    out.push({ lane, event: e });
  }
  return out;
}

/**
 * 规划一次清除: 将删除的条数/天数 + 保留清单 (amount-free)。
 * 单独调 planGuardDataResetPrivateImpact 拿金额合计 — 两类型结构性分离。
 */
export function planGuardDataReset(
  events: GuardResetEventInput[] | null | undefined,
  lane: GuardResetLane,
): GuardDataResetPlan {
  const valid = collectGuardEvents(events);
  const days = new Set<string>();
  let count = 0;
  const retained = { challenge: 0, alt: 0, reuse: 0 };

  for (const { lane: itemLane, event } of valid) {
    const inLane =
      lane === 'all' ||
      (lane === 'challenge' && itemLane === 'challenge') ||
      (lane === 'alt_reuse' && (itemLane === 'alt' || itemLane === 'reuse'));
    if (inLane) {
      count += 1;
      const d = parseDate(event);
      if (d) days.add(dayKey(d));
    } else {
      retained[itemLane] += 1;
    }
  }

  return { lane, eventCount: count, coveredDays: days.size, retained };
}

/** 将删除事件的省钱估算合计 (App 内私享 only); estSaved 缺失/非法容错为 0 */
export function planGuardDataResetPrivateImpact(
  events: GuardResetEventInput[] | null | undefined,
  lane: GuardResetLane,
): GuardDataResetPrivateImpact {
  const valid = collectGuardEvents(events);
  let total = 0;
  for (const { lane: itemLane, event } of valid) {
    const inLane =
      lane === 'all' ||
      (lane === 'challenge' && itemLane === 'challenge') ||
      (lane === 'alt_reuse' && (itemLane === 'alt' || itemLane === 'reuse'));
    if (inLane) total += eventSaved(event, itemLane);
  }
  return { estSavedTotal: total };
}
