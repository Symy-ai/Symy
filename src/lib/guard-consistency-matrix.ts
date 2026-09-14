/**
 * guard-consistency-matrix — 守护行动一致性矩阵 (batch63-b)
 *
 * 把三轨既有事件按"生活域"对齐成一张只读矩阵: 哪些域用户真的把守护变成了
 * 行动 (最稳的域), 哪些域被拦下后仍常放行 (还在拉扯、值得陪一下的域)。
 * 输入是既有 health_events 的 camelCase 子集, 分类完全复用既有 classifier:
 * - 拦截轨 (challenge_completed / challenge_failed): resolveGuardCategory
 *   (guard-category-insight), challenge 事件 wire 形状只有 itemName —
 *   适配进 itemTitle 后走同一分类器 (同 green-commitment 先例), 不造第二套词表。
 * - 绿色替代轨 (mindful_recovery + kind='green_alt_adoption'):
 *   greenAltCategoryOf (词条 id → 域)。
 * - 复用轨 (mindful_recovery + kind='reuse_adoption'):
 *   categoryId 校验走 REUSE_CATEGORIES 既有类目集。
 *
 * 口径红线:
 * - 零 DDL / 只读 / 不新增 API 写路径: 输入全是既有事件, 清除镜像后矩阵归零。
 * - 稳定性简单可解释: 稳定度 = (守护 + 替代 + 复用) / 全部相关事件;
 *   域样本 < MATRIX_MIN_DOMAIN_SAMPLE 时该域 insufficient, 不出百分比结论。
 * - other (分类器兜底桶) 不成域: 进 unclassified 计数, 不出矩阵行、不参选称号。
 * - 分享/荣誉面零金额: 分享面结构只有 category / 次数 / 天数 / 称号
 *   (buildGuardConsistencyShare, 红线测试锁定); 金额估算只存在于
 *   privateEstSavedByCategory 私享字段, 仅 app 内展示。
 * - 措辞非羞辱: needsCare 语义是"还在拉扯, 值得陪一下", 调用方文案不出现
 *   失败/失控类词。
 * - 纯函数 / 零 IO: 读取由调用方 (hook) 完成; 无效 createdAt 跳过,
 *   triggerId 按轨去重 (防御上游重复落库, 同 guard-win-rate 双保险)。
 */

import { resolveGuardCategory, OTHER_CATEGORY, type GuardInsightCategory } from './guard-category-insight';
import { greenAltCategoryOf } from './green-alt-category';
import { REUSE_CATEGORIES } from './reuse-categories';

/** 域样本阈值: 该域相关事件少于该值不出稳定度结论 (与既有画像阈值同档) */
export const MATRIX_MIN_DOMAIN_SAMPLE = 3;

/** 矩阵称号 — 展示层映射到 profile.guardMatrix.title.* 既有 key */
export type GuardMatrixTitle = 'steadiest' | 'needsCare';

/** 聚合输入: 一条三轨事件的最小形状 (health_events camelCase 子集) */
export interface GuardMatrixEventInput {
  eventType?: string | null;
  metadata?: Record<string, unknown> | null;
  triggerId?: string | null;
  id?: string | null;
  createdAt?: string | Date | null;
}

/** 域行 — 四个结果计数 + 活跃天数 + 稳定度 (结构上无金额) */
export interface GuardConsistencyRow {
  /** 既有 classifier 的品类 id (三轨词表并集, other 除外) */
  category: string;
  /** 拦截后守护 (challenge_completed) */
  guarded: number;
  /** 绿色替代采纳 */
  adoptedAlt: number;
  /** 复用采纳 */
  reused: number;
  /** 拦截后放行 (challenge_failed) — 中性事实, 非失败 */
  released: number;
  /** 该域有任一结果的本地自然天数 (去重) */
  activeDays: number;
  /** 稳定度 0..1 = 行动 / 相关事件; insufficient 时恒 0 (不出伪结论) */
  stability: number;
  status: 'ok' | 'insufficient';
}

/** 矩阵聚合结果 — rows 之外只有一个明确命名的私享金额字段 */
export interface GuardConsistencyMatrix {
  /** 'empty' 无有效事件; 'insufficient' 有事件但无域达样本阈值; 'ok' 至少一域可结论 */
  status: 'empty' | 'insufficient' | 'ok';
  rows: GuardConsistencyRow[];
  /** 最稳的守护域 (仅 ok 行参选; 单域时也是它) */
  steadiestCategory: string | null;
  /** 还在拉扯的域 (ok 行中放行最多者; 与最稳域不同行; 无则 null) */
  needsCareCategory: string | null;
  /** 归不到具体域的有效事件数 (other / 未知 reuse 类目等) — 不静默丢数据 */
  unclassified: number;
  /** 全部有效事件覆盖的本地自然天数 (并集, 含未归类事件的天) */
  activeDays: number;
  /** 私享估算节省按域汇总 (守护 savedAmount + 采纳 estSaved) — 仅 app 内展示, 永不进分享面 */
  privateEstSavedByCategory: Record<string, number>;
}

/** 分享面行 — category / 次数 / 天数 / 称号, 面子字段 only */
export interface GuardConsistencyShareRow {
  category: string;
  /** 行动次数 = 守护 + 替代 + 复用 (放行计数不上分享面) */
  actions: number;
  activeDays: number;
  title: GuardMatrixTitle | null;
}

/** 分享/公开形状 — 结构上无任何金额字段 (红线测试锁定) */
export interface GuardConsistencyShare {
  rows: GuardConsistencyShareRow[];
  steadiestCategory: string | null;
  needsCareCategory: string | null;
  totalActions: number;
  activeDays: number;
}

const REUSE_CATEGORY_IDS = new Set<string>(REUSE_CATEGORIES.map((c) => c.id));

type TrackKind = 'guarded' | 'released' | 'adoptedAlt' | 'reused';

/** 拦截轨事件 → 既有分类器: challenge wire 形状只有 itemName, 适配进 itemTitle 走 resolveGuardCategory */
function guardEventCategory(meta: Record<string, unknown> | null | undefined): GuardInsightCategory {
  if (!meta || typeof meta !== 'object') return OTHER_CATEGORY;
  const itemTitle = typeof meta.itemTitle === 'string' && meta.itemTitle.trim()
    ? meta.itemTitle
    : typeof meta.itemName === 'string' ? meta.itemName : undefined;
  return resolveGuardCategory({ category: meta.category, itemTitle });
}

/** 一条事件 → [轨, 域 id]; 非三轨事件 / 缺关键 id 返回 null (不计入矩阵) */
function classifyEvent(eventType: string, meta: Record<string, unknown> | null): { kind: TrackKind; category: string } | null {
  if (eventType === 'challenge_completed') return { kind: 'guarded', category: guardEventCategory(meta) };
  if (eventType === 'challenge_failed') return { kind: 'released', category: guardEventCategory(meta) };
  if (eventType !== 'mindful_recovery' || !meta) return null;
  if (meta.kind === 'green_alt_adoption' && typeof meta.entryId === 'string' && meta.entryId) {
    return { kind: 'adoptedAlt', category: greenAltCategoryOf(meta.entryId) };
  }
  if (meta.kind === 'reuse_adoption') {
    // 已知的复用采纳但类目认不出 → other (计入 unclassified), 不静默丢
    const categoryId = typeof meta.categoryId === 'string' && REUSE_CATEGORY_IDS.has(meta.categoryId)
      ? meta.categoryId
      : null;
    return { kind: 'reused', category: categoryId ?? OTHER_CATEGORY };
  }
  return null;
}

function localDayKey(createdAt: string | Date | null | undefined): string {
  const d = createdAt instanceof Date ? createdAt : new Date(String(createdAt ?? ''));
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface MutableRow {
  guarded: number;
  adoptedAlt: number;
  reused: number;
  released: number;
  days: Set<string>;
  estSaved: number;
}

function emptyRow(): MutableRow {
  return { guarded: 0, adoptedAlt: 0, reused: 0, released: 0, days: new Set(), estSaved: 0 };
}

function rowActions(row: Pick<MutableRow, 'guarded' | 'adoptedAlt' | 'reused'>): number {
  return row.guarded + row.adoptedAlt + row.reused;
}

/** 金额只进私享累加: 守护轨看 savedAmount, 采纳轨看 estSaved (放行不计金额) */
function privateAmount(meta: Record<string, unknown> | null, kind: TrackKind): number {
  const field = kind === 'guarded' ? 'savedAmount' : kind === 'released' ? null : 'estSaved';
  if (!field || !meta) return 0;
  const amount = Number(meta[field]);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function emptyMatrix(): GuardConsistencyMatrix {
  return {
    status: 'empty',
    rows: [],
    steadiestCategory: null,
    needsCareCategory: null,
    unclassified: 0,
    activeDays: 0,
    privateEstSavedByCategory: {},
  };
}

/**
 * 把三轨事件聚合成域 × 结果一致性矩阵。
 * 有效事件为零 → status='empty'; 无效 createdAt / 非三轨条目跳过;
 * 归不到具体域的 (other / 未知 reuse 类目) 计入 unclassified, 不造域行。
 */
export function buildGuardConsistencyMatrix(
  events: GuardMatrixEventInput[] | null | undefined,
): GuardConsistencyMatrix {
  if (!events || events.length === 0) return emptyMatrix();

  const rowsByCategory = new Map<string, MutableRow>();
  const seen = new Set<string>();
  const allDays = new Set<string>();
  let unclassified = 0;
  let valid = 0;

  for (const e of events) {
    if (!e || typeof e.eventType !== 'string') continue;
    const day = localDayKey(e.createdAt);
    if (!day) continue;
    const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
    const hit = classifyEvent(e.eventType, meta);
    if (!hit) continue;

    // 同轨同 triggerId 幂等去重 (缺 triggerId 回退 id/时间戳, 同 guard-win-rate)
    const dedupKey = `${hit.kind}:${e.triggerId || e.id || String(e.createdAt)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    valid += 1;
    allDays.add(day);
    if (hit.category === OTHER_CATEGORY) {
      unclassified += 1;
      continue;
    }

    let row = rowsByCategory.get(hit.category);
    if (!row) {
      row = emptyRow();
      rowsByCategory.set(hit.category, row);
    }
    row[hit.kind] += 1;
    row.days.add(day);
    row.estSaved += privateAmount(meta, hit.kind);
  }

  if (valid === 0) return emptyMatrix();

  const rows: GuardConsistencyRow[] = [...rowsByCategory.entries()].map(([category, row]) => {
    const sample = row.guarded + row.adoptedAlt + row.reused + row.released;
    const enough = sample >= MATRIX_MIN_DOMAIN_SAMPLE;
    return {
      category,
      guarded: row.guarded,
      adoptedAlt: row.adoptedAlt,
      reused: row.reused,
      released: row.released,
      activeDays: row.days.size,
      // 稳定度 = 行动 (守护/替代/复用) 占该域相关事件比; 放行越多越低, 全放行为 0
      stability: enough ? (sample - row.released) / sample : 0,
      status: enough ? 'ok' : 'insufficient',
    };
  });

  // 排序: ok 行在前 (稳定度降序 → 行动数降序 → 品类名稳定排序), insufficient 行随后
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
    const actionsDiff = rowActions(b) - rowActions(a);
    if (actionsDiff !== 0) return actionsDiff;
    if (a.status === 'ok' && a.stability !== b.stability) return b.stability - a.stability;
    return a.category.localeCompare(b.category);
  });

  const okRows = rows.filter((r) => r.status === 'ok');
  const steadiest = okRows[0] ?? null;

  // needsCare: ok 行中放行最多者 (排除最稳行); 平票取稳定度更低者
  let needsCare: GuardConsistencyRow | null = null;
  for (const r of okRows) {
    if (r === steadiest || r.released < 1) continue;
    if (!needsCare || r.released > needsCare.released || (r.released === needsCare.released && r.stability < needsCare.stability)) {
      needsCare = r;
    }
  }

  const privateEstSavedByCategory: Record<string, number> = {};
  for (const [category, row] of rowsByCategory) {
    if (row.estSaved > 0) privateEstSavedByCategory[category] = row.estSaved;
  }

  return {
    status: okRows.length > 0 ? 'ok' : 'insufficient',
    rows,
    steadiestCategory: steadiest?.category ?? null,
    needsCareCategory: needsCare?.category ?? null,
    unclassified,
    activeDays: allDays.size,
    privateEstSavedByCategory,
  };
}

/**
 * 从矩阵投影出分享/公开形状: 只有 category / 次数 / 天数 / 称号 —
 * 结构上无金额字段 (放行计数也不上分享面, 荣誉框架)。
 */
export function buildGuardConsistencyShare(matrix: GuardConsistencyMatrix): GuardConsistencyShare {
  const rows: GuardConsistencyShareRow[] = matrix.rows.map((r) => ({
    category: r.category,
    actions: r.guarded + r.adoptedAlt + r.reused,
    activeDays: r.activeDays,
    title: r.category === matrix.steadiestCategory
      ? 'steadiest'
      : r.category === matrix.needsCareCategory ? 'needsCare' : null,
  }));

  return {
    rows,
    steadiestCategory: matrix.steadiestCategory,
    needsCareCategory: matrix.needsCareCategory,
    totalActions: rows.reduce((sum, r) => sum + r.actions, 0),
    activeDays: matrix.activeDays,
  };
}
