/**
 * Guard Category Insight — 品类级守护透视 (batch46-a)
 *
 * 从既有守护事件 (health_events challenge_reward, 含 guard_ledger 同源 metadata)
 * 聚合出按品类分组的守护统计, 供个人页"品类透视卡"展示。
 *
 * 口径红线:
 * - 零 DDL: 只消费已有 metadata (metadata.category 优先, 缺失时从
 *   metadata.itemTitle 用现有 normalizeInterceptCategory 前端派生), 不新建表/列。
 * - 金额 (estSaved) 只允许出现在私有展开详情, 永不进分享/荣誉面。
 * - 无 category 且派生不出的旧事件归入 other; other 永远排最后, 不参与 top 3。
 */

import { normalizeInterceptCategory } from '@/features/butterfly/green-alt-copy';

/** 展示层品类 id — InterceptCategory 的超集 (多一个 other 桶) */
export type GuardInsightCategory =
  | 'electronics'
  | 'clothing'
  | 'beauty'
  | 'home'
  | 'food'
  | 'other';

export const OTHER_CATEGORY: GuardInsightCategory = 'other';

/** 已知品类 id 直通表 — normalizeInterceptCategory 的正则不覆盖字面 'electronics' */
const KNOWN_CATEGORY_IDS: ReadonlySet<string> = new Set(['electronics', 'clothing', 'beauty', 'home', 'food']);

/** 聚合输入: 一条守护事件的最小形状 (health_events camelCase 子集) */
export interface GuardCategoryEventInput {
  metadata?: Record<string, unknown> | null;
}

/** 单品类聚合结果 */
export interface GuardCategoryInsight {
  category: GuardInsightCategory;
  /** 拦截次数 */
  count: number;
  /** 该品类累计省下的估算金额 (仅私有详情可见) */
  estSaved: number;
  /** estSaved / hourlyRate 换算出的回归自我的小时数 */
  hoursReclaimed: number;
}

/** 从事件 metadata 解析品类: metadata.category 优先, 否则从 itemTitle 派生, 再无则 other */
export function resolveGuardCategory(metadata: Record<string, unknown> | null | undefined): GuardInsightCategory {
  if (!metadata || typeof metadata !== 'object') return OTHER_CATEGORY;

  const rawCategory = metadata.category;
  if (typeof rawCategory === 'string' && rawCategory.trim()) {
    const id = rawCategory.trim().toLowerCase();
    if (KNOWN_CATEGORY_IDS.has(id)) return id as GuardInsightCategory;
    const normalized = normalizeInterceptCategory(rawCategory);
    return normalized === 'default' ? OTHER_CATEGORY : normalized;
  }

  const title = metadata.itemTitle ?? metadata.title;
  if (typeof title === 'string' && title.trim()) {
    const normalized = normalizeInterceptCategory(title);
    return normalized === 'default' ? OTHER_CATEGORY : normalized;
  }

  return OTHER_CATEGORY;
}

/**
 * 按品类聚合守护事件。
 *
 * 输出顺序: 非 other 品类按 count 降序 (同 count 按品类名稳定排序),
 * other (若有) 恒排最后。调用方展示 top 3 时应跳过 other。
 * 空输入 / 全部无效金额防御性 count 为 0 时返回空数组。
 */
export function aggregateGuardCategoryInsights(
  events: GuardCategoryEventInput[] | null | undefined,
  hourlyRate = 25,
): GuardCategoryInsight[] {
  if (!events || events.length === 0) return [];
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 25;

  const counts = new Map<GuardInsightCategory, number>();
  const saved = new Map<GuardInsightCategory, number>();

  for (const e of events) {
    const meta = e && e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
    const category = resolveGuardCategory(meta);
    counts.set(category, (counts.get(category) || 0) + 1);
    const amount = Number(meta?.amount);
    if (Number.isFinite(amount) && amount > 0) {
      saved.set(category, (saved.get(category) || 0) + amount);
    }
  }

  const rows: GuardCategoryInsight[] = [];
  for (const category of counts.keys()) {
    const count = counts.get(category) || 0;
    if (count <= 0) continue;
    const estSaved = saved.get(category) || 0;
    rows.push({
      category,
      count,
      estSaved,
      hoursReclaimed: estSaved / rate,
    });
  }

  if (rows.length === 0) return [];

  rows.sort((a, b) => {
    if (a.category === OTHER_CATEGORY) return 1;
    if (b.category === OTHER_CATEGORY) return -1;
    if (b.count !== a.count) return b.count - a.count;
    return a.category.localeCompare(b.category);
  });

  return rows;
}

/** 供展示的主面 top 3 — 排除 other, 不足 3 个就有几个给几个 */
export function topGuardCategories(insights: GuardCategoryInsight[] | null | undefined, topN = 3): GuardCategoryInsight[] {
  return (insights || []).filter((r) => r.category !== OTHER_CATEGORY).slice(0, topN);
}
