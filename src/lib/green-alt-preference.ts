/**
 * green-alt-preference — 绿色替代拒绝反馈的偏好解析 (batch62-b, 纯函数零 IO)
 *
 * 用户在 GreenAltCard 上可选拒绝原因 (4 个非羞辱选项), 落账复用既有
 * health_events manual_adjustment 纯审计通道 (客户端经 /api/buddy/health-events,
 * metadata.source='green_alt_rejection', trigger_id 前缀 'green-alt-rejection:',
 * 零 DDL)。本模块负责两件事:
 *   1. recordGreenAltRejection — 由 entry+reason 构造落账载荷, 并按冷却窗判定
 *      幂等 (同 entry 同 reason 在冷却期内不产新载荷);
 *   2. resolveGreenAltPreference — 把历史拒绝事件解析为当前有效偏好:
 *      词条级冷却 + 品类级降频, 过期自动失效 (历史行永不删除)。
 *
 * 口径红线:
 * - prefer_buy 只做短冷却 (2 天), 永不永久屏蔽、不产出愧疚文案素材;
 * - already_have 冷却最长 (14 天) — 已有同类, 重复推荐纯打扰;
 * - wrong_channel / prefer_buy 是词条或渠道级反馈, 不降频整个品类;
 * - 只服务推荐排序与 context 摘要, 不做人群画像/负面标签, 结构面无金额。
 */

import { greenAltCategoryOf, isKnownGreenAltEntry, type GreenAltCategory } from './green-alt-category';

export type GreenAltRejectionReason = 'already_have' | 'not_now' | 'wrong_channel' | 'prefer_buy';

export const GREEN_ALT_REJECTION_REASONS: readonly GreenAltRejectionReason[] = [
  'already_have',
  'not_now',
  'wrong_channel',
  'prefer_buy',
];

export function isGreenAltRejectionReason(value: unknown): value is GreenAltRejectionReason {
  return typeof value === 'string' && (GREEN_ALT_REJECTION_REASONS as readonly string[]).includes(value);
}

/** manual_adjustment 通道的语义子类型标记 (与 weekly_review / compare_decision 同款) */
export const GREEN_ALT_REJECTION_SOURCE = 'green_alt_rejection';
/** trigger_id 前缀 (落账与 context 读取共用同一约定) */
export const GREEN_ALT_REJECTION_TRIGGER_PREFIX = 'green-alt-rejection:';

/** 词条级冷却天数 (按原因) — prefer_buy 最短, 保留用户自主权 */
export const GREEN_ALT_ENTRY_COOLDOWN_DAYS: Record<GreenAltRejectionReason, number> = {
  already_have: 14,
  not_now: 7,
  wrong_channel: 7,
  prefer_buy: 2,
};

/** 品类级降频天数 (按原因) — 0 表示不做品类级降频 */
export const GREEN_ALT_CATEGORY_COOLDOWN_DAYS: Record<GreenAltRejectionReason, number> = {
  already_have: 7,
  not_now: 3,
  wrong_channel: 0,
  prefer_buy: 0,
};

const DAY_MS = 86400000;

/** 聚合输入: 一条拒绝记录的最小形状 (health_events 子集 / 客户端本地日志) */
export interface GreenAltRejectionEventInput {
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

/** 落账载荷 — 直接作为 /api/buddy/health-events POST body (纯审计, 零 vitality 副作用) */
export interface GreenAltRejectionPayload {
  eventType: 'manual_adjustment';
  triggerSource: 'manual';
  triggerId: string;
  description: string;
  metadata: {
    source: typeof GREEN_ALT_REJECTION_SOURCE;
    entryId: string;
    category: GreenAltCategory;
    reason: GreenAltRejectionReason;
  };
}

export interface GreenAltRejectionOutcome {
  status: 'invalid' | 'duplicate' | 'recorded';
  payload?: GreenAltRejectionPayload;
}

function parseRejectionEvent(event: GreenAltRejectionEventInput | null | undefined): {
  entryId: string;
  reason: GreenAltRejectionReason;
  triggerId: string | null;
  atMs: number;
} | null {
  if (!event) return null;
  const meta = event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
  if (!meta || meta.source !== GREEN_ALT_REJECTION_SOURCE) return null;
  const entryId = meta.entryId;
  if (typeof entryId !== 'string' || entryId.length === 0) return null;
  if (!isGreenAltRejectionReason(meta.reason)) return null;
  const date = event.createdAt instanceof Date ? event.createdAt : new Date(String(event.createdAt ?? ''));
  const atMs = date.getTime();
  if (!Number.isFinite(atMs)) return null;
  return {
    entryId,
    reason: meta.reason,
    triggerId: typeof event.triggerId === 'string' && event.triggerId ? event.triggerId : null,
    atMs,
  };
}

/**
 * 构造一次拒绝的落账载荷并判定幂等 (纯函数)。
 * - entry/reason 非法 → invalid (调用方不发请求);
 * - 冷却窗内已有同 entry 同 reason → duplicate (同窗口重复点击不制造垃圾事件);
 * - 否则 recorded + 载荷 (trigger_id 含 UTC 日期键, DB 侧唯一索引兜底同日双写)。
 */
export function recordGreenAltRejection(
  entryId: string,
  reason: GreenAltRejectionReason,
  recentEvents: GreenAltRejectionEventInput[] | null | undefined,
  now: Date = new Date(),
): GreenAltRejectionOutcome {
  if (typeof entryId !== 'string' || !isKnownGreenAltEntry(entryId)) return { status: 'invalid' };
  if (!isGreenAltRejectionReason(reason)) return { status: 'invalid' };

  const nowMs = now.getTime();
  const windowMs = GREEN_ALT_ENTRY_COOLDOWN_DAYS[reason] * DAY_MS;
  for (const event of recentEvents || []) {
    const parsed = parseRejectionEvent(event);
    if (!parsed) continue;
    if (parsed.entryId === entryId && parsed.reason === reason && nowMs - parsed.atMs < windowMs) {
      return { status: 'duplicate' };
    }
  }

  const triggerId = `${GREEN_ALT_REJECTION_TRIGGER_PREFIX}${entryId}:${reason}:${now.toISOString().slice(0, 10)}`;
  return {
    status: 'recorded',
    payload: {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId,
      description: 'Green alternative rejection feedback',
      metadata: { source: GREEN_ALT_REJECTION_SOURCE, entryId, category: greenAltCategoryOf(entryId), reason },
    },
  };
}

/** 一条当前有效的偏好 (词条级或品类级) */
export interface GreenAltActivePreference {
  reason: GreenAltRejectionReason;
  /** 冷却截止 (ISO 串) — 过期后由 resolve 剔除, 历史行不删 */
  expiresAt: string;
}

export interface GreenAltPreferenceState {
  /** entryId → 词条级有效偏好 (同词条取最近一次拒绝) */
  byEntry: ReadonlyMap<string, GreenAltActivePreference>;
  /** category → 品类级有效偏好 (同品类取失效最晚的那条, 决定降频窗口) */
  byCategory: ReadonlyMap<GreenAltCategory, GreenAltActivePreference>;
}

export function emptyGreenAltPreferenceState(): GreenAltPreferenceState {
  return { byEntry: new Map(), byCategory: new Map() };
}

/**
 * 把历史拒绝事件解析为当前有效偏好 (纯函数, 以 now 为锚)。
 * 非法行静默跳过; 过期条目自动失效 (不删除 — 历史事件行永远保留)。
 */
export function resolveGreenAltPreference(
  events: GreenAltRejectionEventInput[] | null | undefined,
  now: Date = new Date(),
): GreenAltPreferenceState {
  const byEntry = new Map<string, GreenAltActivePreference>();
  const entryAt = new Map<string, number>();
  const byCategory = new Map<GreenAltCategory, GreenAltActivePreference>();
  const categoryExpiry = new Map<GreenAltCategory, number>();
  const nowMs = now.getTime();

  for (const event of events || []) {
    const parsed = parseRejectionEvent(event);
    if (!parsed) continue;

    // 词条级: 同词条最近一次拒绝决定 reason 与冷却截止
    const entryExpires = parsed.atMs + GREEN_ALT_ENTRY_COOLDOWN_DAYS[parsed.reason] * DAY_MS;
    if (entryExpires > nowMs) {
      const prevAt = entryAt.get(parsed.entryId);
      if (prevAt === undefined || parsed.atMs > prevAt) {
        entryAt.set(parsed.entryId, parsed.atMs);
        byEntry.set(parsed.entryId, { reason: parsed.reason, expiresAt: new Date(entryExpires).toISOString() });
      }
    }

    // 品类级: 只统计有降频窗口的原因, 取失效最晚的一条 (同截止取更新的事件)
    const categoryDays = GREEN_ALT_CATEGORY_COOLDOWN_DAYS[parsed.reason];
    if (categoryDays > 0) {
      const category = greenAltCategoryOf(parsed.entryId);
      const categoryExpires = parsed.atMs + categoryDays * DAY_MS;
      if (categoryExpires > nowMs) {
        const prevExpiry = categoryExpiry.get(category);
        if (prevExpiry === undefined || categoryExpires > prevExpiry) {
          categoryExpiry.set(category, categoryExpires);
          byCategory.set(category, { reason: parsed.reason, expiresAt: new Date(categoryExpires).toISOString() });
        }
      }
    }
  }

  return { byEntry, byCategory };
}

/** 词条当前是否在冷却中, 是则带原因 (排序/表达调整用) */
export function greenAltEntryPreference(state: GreenAltPreferenceState, entryId: string): GreenAltActivePreference | null {
  return state.byEntry.get(entryId) ?? null;
}

/** 品类当前是否被降频, 是则带原因 */
export function greenAltCategoryPreference(state: GreenAltPreferenceState, category: GreenAltCategory): GreenAltActivePreference | null {
  return state.byCategory.get(category) ?? null;
}
