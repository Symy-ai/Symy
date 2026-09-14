/**
 * alt-adoption-profile — 绿色替代采纳足迹聚合 (batch55-c)
 *
 * adoption 落账 (a0d60605: health_events mindful_recovery +
 * trigger_id 前缀 'green-alt-adoption:' + metadata.kind='green_alt_adoption')
 * 的第一个用户视角聚合消费方: 总采纳次数 / 最近 30 天次数 / Top-3 替代 /
 * 覆盖域数 — "我的替代足迹"。
 *
 * 口径红线:
 * - 输出类型结构面无金额: estSaved 只做 Top-3 的内部排序权重 (同 count 时
 *   节省更高的靠前), 永不进入输出字段 (红线测试锁定)。
 * - 词条显示名与 category 从 green-alternatives 词条表解析 (首 trigger 作
 *   显示名, 未注册词条不参选 Top-3 但仍计入次数)。
 * - 样本不足 (<3 条有效采纳) → status='insufficient' 稳定降级, 不造伪画像。
 * - 纯函数 / 零 IO: 读取由调用方 (alt-adoption-context) 完成。
 * - 零 DDL / 只读, 与 impulse-trigger-profile 同款防御 (无效 createdAt 跳过,
 *   triggerId 去重)。
 */

import { GREEN_ALTERNATIVES } from './green-alternatives';
import { greenAltCategoryOf, type GreenAltCategory } from './green-alt-category';
import type { GreenLocale } from './green-alt-types';

/** 样本量阈值: 少于该条采纳不出足迹结论 (与 impulse-trigger-profile 同档) */
export const ALT_ADOPTION_MIN_SAMPLE_SIZE = 3;

/** adoption 落库约定 (与 /api/green-alt/adoption 同款) */
export const ALT_ADOPTION_TRIGGER_PREFIX = 'green-alt-adoption:';

/** 聚合输入: 一条采纳记录的最小形状 (health_events 子集) */
export interface AltAdoptionEventInput {
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

/** Top 替代行 — zh/en 显示名来自词条表, 无金额 */
export interface AltAdoptionTopEntry {
  entryId: string;
  labelZh: string;
  labelEn: string;
  category: GreenAltCategory;
  count: number;
}

/** 足迹聚合结果 — 纯计数与标签, 结构上无金额 */
export interface AltAdoptionProfile {
  /** 'insufficient' = 样本不足, 调用方渲染鼓励降级文案, 不渲染伪足迹 */
  status: 'insufficient' | 'ok';
  totalAdoptions: number;
  /** 最近 30 天有效采纳次数 (以 now 为锚, 本地时间) */
  last30Days: number;
  /** Top-3 替代 (count 降序, 同 count 内部 estSaved 权重降序, 再 entryId 稳定排序) */
  topEntries: AltAdoptionTopEntry[];
  /** 覆盖的生活领域数 (去重非 other 品类) */
  categoriesCovered: number;
}

/** 词条 id → 显示名 (词条表首 trigger; 未注册回退 id) */
export function greenAltDisplayLabel(entryId: string, locale: GreenLocale): string {
  const entry = GREEN_ALTERNATIVES.find((e) => e.id === entryId);
  if (!entry) return entryId;
  const first = entry.triggers[locale][0];
  return first ?? entryId;
}

function emptyProfile(): AltAdoptionProfile {
  return { status: 'insufficient', totalAdoptions: 0, last30Days: 0, topEntries: [], categoriesCovered: 0 };
}

const DAY_MS = 86400000;

/**
 * 聚合采纳记录为替代足迹。
 * metadata.kind !== 'green_alt_adoption' / entryId 非字符串 / createdAt 解析失败
 * 的条目跳过; triggerId 去重 (落账同词条同日幂等, 双保险)。
 * 有效采纳 < ALT_ADOPTION_MIN_SAMPLE_SIZE → insufficient 稳定降级。
 */
export function aggregateAltAdoptionProfile(
  events: AltAdoptionEventInput[] | null | undefined,
  now: Date = new Date(),
): AltAdoptionProfile {
  if (!events || events.length === 0) return emptyProfile();

  const countPerEntry = new Map<string, number>();
  /** 内部排序权重: 词条累计 estSaved (只用于排序, 不进输出) */
  const weightPerEntry = new Map<string, number>();
  const categories = new Set<GreenAltCategory>();
  const seen = new Set<string>();
  const nowMs = now.getTime();
  let total = 0;
  let last30 = 0;

  for (const e of events) {
    if (!e) continue;
    const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
    if (!meta || meta.kind !== 'green_alt_adoption') continue;
    const entryId = meta.entryId;
    if (typeof entryId !== 'string' || entryId.length === 0) continue;
    const date = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
    const t = date.getTime();
    if (!Number.isFinite(t)) continue;
    if (typeof e.triggerId === 'string' && e.triggerId) {
      if (seen.has(e.triggerId)) continue;
      seen.add(e.triggerId);
    }

    total += 1;
    if (nowMs - t < 30 * DAY_MS) last30 += 1;
    countPerEntry.set(entryId, (countPerEntry.get(entryId) || 0) + 1);
    const saved = Number(meta.estSaved);
    if (Number.isFinite(saved) && saved > 0) {
      weightPerEntry.set(entryId, (weightPerEntry.get(entryId) || 0) + saved);
    }
    const category = greenAltCategoryOf(entryId);
    if (category !== 'other') categories.add(category);
  }

  if (total < ALT_ADOPTION_MIN_SAMPLE_SIZE) return emptyProfile();

  const topEntries: AltAdoptionTopEntry[] = [...countPerEntry.entries()]
    // 未注册词条 (词表已删改) 拿不到显示名, 不参选 Top-3, 但次数已计入
    .filter(([entryId]) => GREEN_ALTERNATIVES.some((e) => e.id === entryId))
    .map(([entryId, count]) => ({
      entryId,
      labelZh: greenAltDisplayLabel(entryId, 'zh'),
      labelEn: greenAltDisplayLabel(entryId, 'en'),
      category: greenAltCategoryOf(entryId),
      count,
    }))
    .sort((a, b) => {
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      const weightDiff = (weightPerEntry.get(b.entryId) || 0) - (weightPerEntry.get(a.entryId) || 0);
      if (weightDiff !== 0) return weightDiff;
      return a.entryId.localeCompare(b.entryId);
    })
    .slice(0, 3);

  return {
    status: 'ok',
    totalAdoptions: total,
    last30Days: last30,
    topEntries,
    categoriesCovered: categories.size,
  };
}
