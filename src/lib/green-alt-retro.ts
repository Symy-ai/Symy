/**
 * green-alt-retro — 绿色采纳后复盘的证据词表与事件形状 (batch68-a, 纯函数零 IO)
 *
 * 采纳 (green-alt-adoption) 之后, Symy 在下一轮自然对话中追问一次原因。用户
 * 回答 (4 个非羞辱选项, 或自由文本) 落账复用既有 health_events manual_adjustment
 * 纯审计通道 (零 DDL): trigger_id 前缀 'green-alt-retro:', metadata.source=
 * 'green_alt_retro'。证据两路消费:
 *   1. already_have / rent_borrow 映射进既有 green-alt-preference 偏好形状
 *      (already_have→already_have, rent_borrow→wrong_channel) — 后续同域推荐
 *      由 suggestAlternativeWithPreference 自动 reuse-first 排序与表达;
 *   2. 全部原因 (含 freeform) 的定性行注入 Letta context — 自由文本只保存
 *      定性词与原话, 不做金额或碳推断。
 *
 * 口径红线: 复盘面零金额零碳数值; 事件纯审计不动 buddy_state 计数。
 */

import { greenAltCategoryOf, isKnownGreenAltEntry, type GreenAltCategory } from './green-alt-category';
import type { GreenAltRejectionReason } from './green-alt-preference';

/** 4 个非羞辱复盘选项 (顺序即卡片展示顺序) */
export const GREEN_ALT_RETRO_OPTIONS = ['already_have', 'rent_borrow', 'try_once', 'reduce_idle'] as const;

export type GreenAltRetroOptionId = (typeof GREEN_ALT_RETRO_OPTIONS)[number];

/** 选项 id + 自由文本回落 */
export type GreenAltRetroReason = GreenAltRetroOptionId | 'freeform';

export function isGreenAltRetroOptionId(value: unknown): value is GreenAltRetroOptionId {
  return typeof value === 'string' && (GREEN_ALT_RETRO_OPTIONS as readonly string[]).includes(value);
}

/** manual_adjustment 通道的语义子类型标记 (与 green_alt_rejection / green_alt_adoption 同款) */
export const GREEN_ALT_RETRO_SOURCE = 'green_alt_retro';
/** trigger_id 前缀 (落账与 context 读取共用同一约定) */
export const GREEN_ALT_RETRO_TRIGGER_PREFIX = 'green-alt-retro:';

/** 自由文本原话保存上限 (定性词 + 原话, 截断防脏数据) */
export const GREEN_ALT_RETRO_NOTE_MAX_CHARS = 160;

/** 自由文本 → 定性词表 (zh/en)。只收定性描述, 金额/数字词一律不进证据。 */
const QUALITATIVE_ZH: readonly RegExp[] = [
  /省事/, /方便/, /顺手/, /环保/, /闲置/, /试试|试一次/, /轻便/, /耐用/, /不占地方/, /家里[有就]/, /租[来借的]?/, /借/,
];
const QUALITATIVE_EN: readonly RegExp[] = [
  /\bhandy\b|\bconvenient\b|\beasy\b|\bsimple\b/i, /\breus\w*/i, /\btry\b|\btrial\b/i, /\bidle\b|\bunused\b|\bdeclutter\w*/i,
  /\brent\w*/i, /\bborrow\w*/i, /\balready (?:have|own|got)\b/i, /\bwork(?:s|ed)? (?:fine|well|great)\b/i,
];

export interface GreenAltRetroEventInput {
  entryId: string;
  reason: GreenAltRetroReason;
  /** 自由文本原话 (仅 reason='freeform'; 调用方传入原始文本, 这里统一净化截断) */
  note?: string | undefined;
  now?: Date;
}

/** manual_adjustment 通道落账载荷 — 直接对应 health_events insert 列 + metadata */
export interface GreenAltRetroEventPayload {
  eventType: 'manual_adjustment';
  triggerSource: 'manual';
  triggerId: string;
  description: string;
  metadata: {
    source: typeof GREEN_ALT_RETRO_SOURCE;
    entryId: string;
    category: GreenAltCategory;
    reason: GreenAltRetroReason;
    /** 仅 freeform: 净化截断后的原话 */
    note?: string;
    /** 仅 freeform: 从原话提取的定性词 (零金额零碳) */
    keywords?: string[];
  };
}

/** 自由文本原话净化: 折叠空白 + 去控制符 + 截断 (防 prompt/DB 脏数据) */
export function sanitizeGreenAltRetroNote(note: string): string {
  if (typeof note !== 'string') return '';
  return note
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GREEN_ALT_RETRO_NOTE_MAX_CHARS);
}

/** 原话 → 定性词 (去重, 上限 6; 非自由文本/空原话 → 空数组) */
export function qualitativeKeywordsFromNote(note: string | undefined): string[] {
  if (!note) return [];
  const found: string[] = [];
  for (const pattern of [...QUALITATIVE_ZH, ...QUALITATIVE_EN]) {
    const match = note.match(pattern);
    if (match?.[0] && !found.includes(match[0])) found.push(match[0]);
    if (found.length >= 6) break;
  }
  return found;
}

/**
 * 构造一次复盘回答的落账载荷 (纯函数)。
 * entryId 非已知绿色替代词条 → null (调用方不发请求); trigger_id 含 UTC 日期键,
 * 与 rejection/adoption 同约定 (DB 侧唯一索引兜底同日双写)。
 */
export function buildGreenAltRetroEventPayload(input: GreenAltRetroEventInput): GreenAltRetroEventPayload | null {
  const { entryId, reason, note } = input;
  if (typeof entryId !== 'string' || !isKnownGreenAltEntry(entryId)) return null;
  if (!isGreenAltRetroOptionId(reason) && reason !== 'freeform') return null;

  const now = input.now ?? new Date();
  const triggerId = `${GREEN_ALT_RETRO_TRIGGER_PREFIX}${entryId}:${reason}:${now.toISOString().slice(0, 10)}`;
  const metadata: GreenAltRetroEventPayload['metadata'] = {
    source: GREEN_ALT_RETRO_SOURCE,
    entryId,
    category: greenAltCategoryOf(entryId),
    reason,
  };
  if (reason === 'freeform' && note) {
    const sanitized = sanitizeGreenAltRetroNote(note);
    if (sanitized) {
      metadata.note = sanitized;
      const keywords = qualitativeKeywordsFromNote(sanitized);
      if (keywords.length > 0) metadata.keywords = keywords;
    }
  }
  return {
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    triggerId,
    description: 'Green alternative adoption follow-up',
    metadata,
  };
}

/** 聚合输入: 一条复盘记录的最小形状 (health_events 行子集) */
export interface GreenAltRetroEventRowInput {
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface GreenAltRetroParsedEvent {
  entryId: string;
  category: GreenAltCategory;
  reason: GreenAltRetroReason;
  note?: string;
  keywords?: string[];
  atMs: number;
}

/** 解析一条复盘事件行 (metadata.source 必须命中; 非法行静默跳过) */
export function parseGreenAltRetroEvent(event: GreenAltRetroEventRowInput | null | undefined): GreenAltRetroParsedEvent | null {
  if (!event) return null;
  const meta = event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
  if (!meta || meta.source !== GREEN_ALT_RETRO_SOURCE) return null;
  const entryId = meta.entryId;
  if (typeof entryId !== 'string' || entryId.length === 0) return null;
  const reason = meta.reason;
  if (!isGreenAltRetroOptionId(reason) && reason !== 'freeform') return null;
  const date = event.createdAt instanceof Date ? event.createdAt : new Date(String(event.createdAt ?? ''));
  const atMs = date.getTime();
  if (!Number.isFinite(atMs)) return null;
  const note = typeof meta.note === 'string' && meta.note.length > 0 ? meta.note : undefined;
  const keywords = Array.isArray(meta.keywords)
    ? meta.keywords.filter((k): k is string => typeof k === 'string').slice(0, 6)
    : undefined;
  return {
    entryId,
    category: greenAltCategoryOf(entryId),
    reason,
    note,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    atMs,
  };
}

/**
 * 复盘原因 → 既有拒绝偏好词表的只读映射 (冷却表/表达调整共用同一词表):
 * already_have→already_have (reuse-first + 最长冷却), rent_borrow→wrong_channel
 * (租借/借用表达调整); try_once / reduce_idle / freeform 不映射 — 不产冷却,
 * 只进 Letta 定性证据行。映射后的 reason 直接喂 GREEN_ALT_ENTRY_COOLDOWN_DAYS /
 * GREEN_ALT_CATEGORY_COOLDOWN_DAYS (见 green-alt-retro-context 的 gap-fill 合并),
 * green-alt-preference 的解析与排序逻辑零改动。
 */
export function retroReasonToPreferenceReason(reason: GreenAltRetroReason): GreenAltRejectionReason | null {
  if (reason === 'already_have') return 'already_have';
  if (reason === 'rent_borrow') return 'wrong_channel';
  return null;
}
