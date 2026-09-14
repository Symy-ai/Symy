/**
 * Impulse Trigger Profile — 冲动触发画像聚合 (batch52-c)
 *
 * 消费拦截原因数据的第一个聚合消费方: 把用户历史拦截记录
 * (health_events challenge_completed, 含 metadata.itemName/itemTitle)
 * 聚合成"你的冲动触发画像" — Top 3 触发原因 / 最常被拦品类 / 危险时段分布。
 *
 * 口径红线:
 * - 零 DDL / 只读: 原因不落库, 与 intercept-reason-chip 展示层同源 — 用
 *   classifyInterceptReason(itemName) 本地派生, 复用同一份 i18n 词表
 *   (chat.interceptReason.*), 不造第二套标签词表。
 * - 品类/时段复用既有聚合器: resolveGuardCategory (guard-category-insight)
 *   + aggregateImpulseWindows (impulse-window), 口径与品类卡/时段卡一致。
 * - 分享/荣誉面禁金额: ImpulseTriggerProfile 输出类型无任何金额字段,
 *   只有次数/天数/标签 — 类型层面保证。
 * - 空数据/单条数据稳定降级: status='insufficient', 不抛错不假数据。
 * - 措辞非羞辱: 归因对象是"触发"不是"你控制不住" (文案在 i18n 层约束)。
 */

import { classifyInterceptReason } from '@/lib/intercept-reason';
import { resolveGuardCategory, type GuardInsightCategory } from '@/lib/guard-category-insight';
import { aggregateImpulseWindows, type ImpulseWindowSummary } from '@/lib/impulse-window';

/** 样本量阈值: 少于该条拦截数不出画像结论 (与 impulse-window MIN_SAMPLE_SIZE 同档) */
export const PROFILE_MIN_SAMPLE_SIZE = 3;

/** 触发原因的稳定标识 — 展示层映射到 chat.interceptReason.* 既有 key */
export type ImpulseTriggerReasonId = 'non_green' | 'impulse' | 'unknown' | `non_green.${string}`;

/** 聚合输入: 一条拦截记录的最小形状 (health_events challenge_completed 子集) */
export interface ImpulseTriggerEventInput {
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

/** 单条 Top 原因行 */
export interface ImpulseTriggerReasonRow {
  reasonId: ImpulseTriggerReasonId;
  count: number;
  /** 占有效样本比 0..1 */
  share: number;
}

/** 画像聚合结果 — 纯计数与标签, 结构上无金额 */
export interface ImpulseTriggerProfile {
  /** 'insufficient' = 样本不足, 调用方渲染引导态, 不渲染伪画像 */
  status: 'insufficient' | 'ok';
  /** 有效拦截样本量 (时间戳解析失败的条目不计) */
  totalIntercepts: number;
  /** 有拦截记录的自然天数 (本地时区, 去重) */
  activeDays: number;
  /** Top 3 触发原因 (按 count 降序, 同 count 按 reasonId 稳定排序; 不足 3 有几个给几个) */
  topReasons: ImpulseTriggerReasonRow[];
  /** 最常被拦品类 (count 降序; other 不参选, 无非 other 品类时为 null) */
  topCategory: GuardInsightCategory | null;
  topCategoryCount: number;
  /** 危险时段分布 (复用 impulse-window 4 桶, 含样本不足判定) */
  window: ImpulseWindowSummary;
  /** 针对性守护建议 id — 由 Top 原因派生, 展示层映射到 profile.impulseTriggerAdvice.* */
  adviceId: 'non_green' | 'impulse' | null;
}

/** 事件条目 → 触发原因稳定 id (与 interceptReasonTextKey 的 key 段一致) */
export function resolveTriggerReasonId(metadata: Record<string, unknown> | null | undefined): ImpulseTriggerReasonId {
  const title = metadata?.itemName ?? metadata?.itemTitle;
  if (typeof title !== 'string' || !title.trim()) return 'unknown';
  const reason = classifyInterceptReason(title);
  if (reason.kind === 'non_green' && reason.category) return `non_green.${reason.category}`;
  // classifyInterceptReason 现实现只产 non_green/impulse/unknown; budget 由预算层判定, 不在词表内归 unknown
  return reason.kind === 'impulse' ? 'impulse' : 'unknown';
}

/** reasonId → intercept-reason-chip 既有 i18n key (复用 chat.interceptReason.* 词表, 不造第二套) */
export function impulseTriggerReasonTextKey(reasonId: ImpulseTriggerReasonId): string {
  if (reasonId.startsWith('non_green.')) {
    return `chat.interceptReason.nonGreen.${reasonId.slice('non_green.'.length)}`;
  }
  return `chat.interceptReason.${reasonId}`;
}

function emptyProfile(): ImpulseTriggerProfile {
  return {
    status: 'insufficient',
    totalIntercepts: 0,
    activeDays: 0,
    topReasons: [],
    topCategory: null,
    topCategoryCount: 0,
    window: aggregateImpulseWindows([]),
    adviceId: null,
  };
}

/**
 * 聚合拦截记录为触发画像。
 * createdAt 解析失败 (NaN) 的条目丢弃, 不计入 totalIntercepts;
 * totalIntercepts < PROFILE_MIN_SAMPLE_SIZE 返回 insufficient 稳定降级。
 */
export function aggregateImpulseTriggerProfile(
  events: ImpulseTriggerEventInput[] | null | undefined,
): ImpulseTriggerProfile {
  if (!events || events.length === 0) return emptyProfile();

  const reasonCounts = new Map<ImpulseTriggerReasonId, number>();
  const categoryCounts = new Map<GuardInsightCategory, number>();
  const days = new Set<string>();
  const datedInputs: ImpulseTriggerEventInput[] = [];
  let total = 0;

  for (const e of events) {
    if (!e) continue;
    const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
    const date = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
    if (!Number.isFinite(date.getTime())) continue;

    total += 1;
    datedInputs.push({ createdAt: date });
    days.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);

    const reasonId = resolveTriggerReasonId(meta);
    reasonCounts.set(reasonId, (reasonCounts.get(reasonId) || 0) + 1);

    const category = resolveGuardCategory(meta);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  if (total < PROFILE_MIN_SAMPLE_SIZE) return emptyProfile();

  const topReasons: ImpulseTriggerReasonRow[] = [...reasonCounts.entries()]
    .map(([reasonId, count]) => ({ reasonId, count, share: count / total }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.reasonId.localeCompare(b.reasonId)))
    .slice(0, 3);

  let topCategory: GuardInsightCategory | null = null;
  let topCategoryCount = 0;
  for (const [category, count] of categoryCounts) {
    if (category === 'other') continue;
    if (count > topCategoryCount || (count === topCategoryCount && topCategory !== null && category.localeCompare(topCategory) < 0)) {
      topCategory = category;
      topCategoryCount = count;
    }
  }

  const topReasonKind = topReasons[0]?.reasonId.startsWith('non_green') ? 'non_green' : topReasons[0]?.reasonId;

  return {
    status: 'ok',
    totalIntercepts: total,
    activeDays: days.size,
    topReasons,
    topCategory,
    topCategoryCount,
    window: aggregateImpulseWindows(datedInputs),
    adviceId: topReasonKind === 'non_green' || topReasonKind === 'impulse' ? topReasonKind : null,
  };
}
