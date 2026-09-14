// Shopping facts memory block — schema + write filter + persistence (落库件).
// Insight ported from anthropics/commerce-agents (async memory extraction:
// "facts" as typed key-value blocks with hard length caps, 64/200 chars).
// Copyright 2026 Anthropic PBC. SPDX-License-Identifier: Apache-2.0 (模式借鉴).
//
// Symy 适配 (A3 移植, 2026-09-07): 购物偏好 (尺码/品类偏好/预算) 结构化落库,
// 替代散落在 Letta 对话记忆里的不可查询文本。本批只交付 schema + 写过滤 + 存取件;
// 提取管道 (night 扫当日对话 → buildShoppingFact → 本模块落库) 属后续批次。
//
// OPEN QUESTIONS (留给提取管道批次决策):
//  1) 提取管道形态: night lane 扫对话纯文本 (commerce-agents: 提取模型只读纯文本,
//     严禁读工具返回 — 防卡片载荷里的注入伪装成用户偏好)。
//  2) 是否同步写 Letta core memory 的 shopping_facts block: 先落本表 (可查询、
//     可审计), Letta block 同步等提取管道定形后再接。
//  3) confidence/source 字段暂不启用 — 提取管道落地时若需要再迁移加列 (零 DDL 红线
//     指外部 SYMY 库; 本库 migrations 正常走)。

import 'server-only'; // server-only — 落库件只可在服务端使用 (architecture guard #12)

import { sanitizeLabel } from '@/lib/fencing';
import { logger } from '@/lib/logger';

/** 事实三类目: 品类/材质等偏好、尺码、预算 (backlog A3 照抄边界) */
export const SHOPPING_FACT_CATEGORIES = ['preference', 'size', 'budget'] as const;
export type ShoppingFactCategory = (typeof SHOPPING_FACT_CATEGORIES)[number];

/** 照抄 commerce-agents 记忆块上限: key ≤64, value ≤200 */
export const SHOPPING_FACT_KEY_MAX = 64;
export const SHOPPING_FACT_VALUE_MAX = 200;

export interface ShoppingFact {
  category: ShoppingFactCategory;
  key: string;
  value: string;
}

/** 落库通道的最小结构面 — 测试注入 stub, 生产传 createAdminClient() 结果 */
export interface ShoppingFactsStore {
  from(table: string): {
    upsert(
      rows: Array<Record<string, unknown>>,
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string; code?: string } | null }>;
  };
}

/** 读取通道的最小结构面 — 与 ShoppingFactsStore 同理, 只暴露 load 所需方法 */
export interface ShoppingFactsReadStore {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{
        data: Array<{
          category: unknown;
          key: unknown;
          value: unknown;
          /** batch25-b: 读侧按新→旧排序用 (ISO timestamptz 字符串) */
          updated_at?: unknown;
        }> | null;
        error: { message: string; code?: string } | null;
      }>;
    };
  };
}

/**
 * 表缺失 (migration 140 未跑) 判定: PG undefined_table (42P01) 与 PostgREST
 * schema-cache miss (PGRST205) 两种形态。零 DDL 铁律下表缺席是常态而非事故,
 * 命中即走降级 (warn 级 + degraded 标记), 不许毒死记忆管线。
 */
export function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const HEX_LIKE = /^(?:0x)?[0-9a-f]{16,}$/i;
const LONG_DIGIT_RUN = /^\d{11,}$/; // 订单号/手机号形态
const EMAIL_LIKE = /^\S+@\S+\.\S+$/;
const URL_LIKE = /^(?:https?:\/\/|www\.)/i;
const HANDLE_LIKE = /^@[\w.-]{2,}$/;
const OPAQUE_TOKEN_LIKE = /^[A-Za-z0-9_-]{24,}$/; // session/agent id 等 opaque 串

/**
 * 写过滤 (identifier 形态拒绝): 事实值必须是人话 ("怕挤脚"、"春秋穿 42"),
 * 不是任何机器标识。UUID/长 hex/11 位以上纯数字/邮箱/URL/@handle/24+ opaque 串
 * 一律拒绝 — 提取模型抽到 ID 形态时宁可丢弃也不让标识符污染偏好库 (PII/凭证风险)。
 * 刻意偏保守: 边界含糊的值按标识符处理。
 */
export function isIdentifierShaped(text: string): boolean {
  const value = text.trim();
  return (
    UUID_LIKE.test(value) ||
    HEX_LIKE.test(value) ||
    LONG_DIGIT_RUN.test(value) ||
    EMAIL_LIKE.test(value) ||
    URL_LIKE.test(value) ||
    HANDLE_LIKE.test(value) ||
    OPAQUE_TOKEN_LIKE.test(value)
  );
}

/**
 * schema 校验 + 规范化。key 超长直接拒 (key 是结构化标签, 截断会产生语义碰撞);
 * value 过 fencing 卫生化 (控制字符/不可见字符清除 + 折行压平) 后截到 200。
 * 任一规则不过 → null, 调用方跳过该条 (批量写永不因单条脏数据失败)。
 */
export function buildShoppingFact(raw: {
  category?: unknown;
  key?: unknown;
  value?: unknown;
}): ShoppingFact | null {
  const { category, key, value } = raw ?? {};
  if (
    typeof category !== 'string' ||
    !(SHOPPING_FACT_CATEGORIES as readonly string[]).includes(category)
  ) {
    return null;
  }
  if (typeof key !== 'string') return null;
  // key 是结构化标签: 不折叠不截断, 空白/控制字符直接拒 (防语义碰撞与注入载荷混入)
  const normalizedKey = key.trim();
  if (
    normalizedKey.length === 0 ||
    normalizedKey.length > SHOPPING_FACT_KEY_MAX ||
    /\s/.test(normalizedKey) ||
    CONTROL_CHARS.test(normalizedKey)
  ) {
    return null;
  }
  if (typeof value !== 'string') return null;
  // 卫生化 + 截断到块上限 (value 是展示文本, 截断优于整条丢弃)
  const normalizedValue = sanitizeLabel(value, SHOPPING_FACT_VALUE_MAX);
  if (!normalizedValue || isIdentifierShaped(normalizedValue)) return null;
  return { category: category as ShoppingFactCategory, key: normalizedKey, value: normalizedValue };
}

export interface SaveShoppingFactsResult {
  saved: number;
  rejected: number;
  /** true = 表缺失 (migration 140 未跑), 事实仅留内存态; 调用方无须告警 */
  degraded?: boolean;
  error?: string;
}

/**
 * 落库 (executor 写路径): 逐条再过 buildShoppingFact (写入前二次过滤, 模型/管道输出不可信),
 * 合法行 upsert 到 shopping_facts, 冲突键 (user_id, category, key) 覆盖旧值。
 * 非法行计数 rejected, 不抬高整体失败; store 写失败返回 error 字段由调用方决定是否告警。
 */
export async function saveShoppingFacts(
  userId: string,
  facts: Array<{ category?: unknown; key?: unknown; value?: unknown }>,
  store: ShoppingFactsStore,
): Promise<SaveShoppingFactsResult> {
  const rows: Array<Record<string, unknown>> = [];
  let rejected = 0;
  for (const raw of facts ?? []) {
    const fact = buildShoppingFact(raw);
    if (!fact) {
      rejected++;
      continue;
    }
    rows.push({ user_id: userId, ...fact });
  }
  if (!rows.length) return { saved: 0, rejected };
  try {
    const { error } = await store.from('shopping_facts').upsert(rows, {
      onConflict: 'user_id,category,key',
    });
    if (error) {
      if (isMissingTableError(error)) {
        logger.warn('[ShoppingFacts] table missing — facts kept in-memory only (run migration 140)');
        return { saved: 0, rejected, degraded: true };
      }
      logger.error('[ShoppingFacts] upsert failed:', error.message);
      return { saved: 0, rejected, error: error.message };
    }
    return { saved: rows.length, rejected };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[ShoppingFacts] upsert threw:', message);
    return { saved: 0, rejected, error: message };
  }
}

export interface LoadShoppingFactsResult {
  facts: ShoppingFact[];
  /** true = 表缺失 (migration 140 未跑), 空数组属正常降级而非故障 */
  degraded?: boolean;
  error?: string;
}

/**
 * 读取 (提取管道/上下文注入用): 拉取用户全部事实行, 逐行再过 buildShoppingFact
 * 复检 (落库前虽已过滤, 读侧兜底防历史脏行)。表缺失 → 空数组 + degraded 标记,
 * 与写路径同一降级语义, 调用方拿到空事实即可继续, 不炸。
 * batch25-b: select 带 updated_at 并按新→旧排序 (命中 idx_shopping_facts_user_updated
 * 的 user_id 前缀, 内存排序仅作稳定序), 调用方 (管道) 按"新者优先"截断注入条数。
 */
export async function loadShoppingFacts(
  userId: string,
  store: ShoppingFactsReadStore,
): Promise<LoadShoppingFactsResult> {
  try {
    const { data, error } = await store
      .from('shopping_facts')
      .select('category,key,value,updated_at')
      .eq('user_id', userId);
    if (error) {
      if (isMissingTableError(error)) {
        logger.warn('[ShoppingFacts] table missing — returning empty facts (run migration 140)');
        return { facts: [], degraded: true };
      }
      logger.error('[ShoppingFacts] load failed:', error.message);
      return { facts: [], error: error.message };
    }
    const sortedRows = [...(data ?? [])].sort((a, b) =>
      String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
    );
    const facts: ShoppingFact[] = [];
    for (const row of sortedRows) {
      const fact = buildShoppingFact(row);
      if (fact) facts.push(fact);
    }
    return { facts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[ShoppingFacts] load threw:', message);
    return { facts: [], error: message };
  }
}
