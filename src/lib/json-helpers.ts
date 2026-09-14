/**
 * JSONB Typed Helpers — Supabase JSONB 列的统一类型转换层
 *
 * 🔧 ARCH fix (Round 78 — JSONB 类型安全漏洞):
 *    旧代码: 全项目 22+ 处 `as unknown as Json` / `as unknown as SomeType[]`
 *    根因: Supabase JSONB 列返回 `Json` 类型 (string|number|boolean|null|[]|{}),
 *          但业务代码需要 typed 对象/数组。开发者被迫写 `as unknown as` 双重断言,
 *          既丑陋又无运行时验证 — 数据库一行坏数据可以让 TS 编译通过但运行时崩溃。
 *
 *    修复: 本模块提供两个方向的统一转换:
 *      - toJson(value) — 把 typed 对象/数组安全转成 Json (写入 DB 前)
 *      - parseJsonField<T>(value, defaultValue, validate?) — 把 Json 安全转成 typed (读 DB 后)
 *
 *    架构收益:
 *      1. 单一转换点 — Supabase 升级 JSON 类型时只改一处
 *      2. 可选运行时验证 — validate 函数捕获实际数据损坏
 *      3. 消除 `as unknown as` 视觉噪音
 *      4. 明确表达意图 — `toJson(x)` = "把 x 存为 JSON"; `parseJsonField(x, [])` = "从 JSON 读数组"
 *
 * 用法:
 *   写入:
 *     .insert({ metadata: toJson(input.metadata) })           // 替代 (input.metadata || {}) as unknown as Json
 *     .update({ badges: toJson(allBadges) })                  // 替代 allBadges as unknown as Json
 *
 *   读取 (无验证):
 *     const list = parseJsonField<StoryChapter[]>(row.chapters, [])
 *     // 替代 row.chapters as unknown as StoryChapter[] ?? []
 *
 *   读取 (带验证 — 推荐 critical 数据):
 *     const list = parseJsonField<Badge[]>(row.badges, [],
 *       (v): v is Badge[] => Array.isArray(v) && v.every(isBadge))
 *     // validate 返回 false → 用 defaultValue, 并 logger.warn
 */

import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';

/**
 * 把 typed 值安全转换为 Supabase Json 类型 (写入 DB 前)。
 *
 * 接受 unknown 是因为业务代码常持有 `Record<string, unknown>` (如 input.metadata),
 * 它在结构上可能是 JSON-compatible 但 TS 不肯自动 narrowing 到 Json。
 * 调用方负责确保 value 是 JSON 可序列化的 (string/number/boolean/null/array/plain-object)。
 *
 * 此函数仅做类型断言 (无运行时开销), 但语义上明确表达 "我要把这个存为 JSONB"。
 * 集中类型断言到一处, 业务代码无需重复 `as unknown as Json`。
 *
 * 替代: `value as unknown as Json` — 双重断言 + 视觉噪音 + 重复
 */
export function toJson(value: unknown): Json {
  // 集中 cast — 调用方负责确保 value 是 JSON 可序列化
  return value as Json;
}

/**
 * 把 Json 值安全转换为 typed T (读 DB 后)。
 *
 * - 无 validate 参数: 仅做类型断言 (零开销, 与 `as` 等价, 但语义更清晰)
 * - 有 validate 参数: 运行时验证, 失败则返回 defaultValue 并 logger.warn
 *   (捕获数据库坏数据, 防止运行时崩溃)
 *
 * 接受 unknown 是因为业务代码常持有 unknown (RPC 返回 Json, Supabase SDK 把它当 unknown;
 * JSON.parse 返回 any)。validate 函数做运行时 narrowing。
 *
 * 替代: `value as unknown as SomeType[]` — 无验证, 数据库坏数据直接 crash
 *
 * @param value        - 从 DB 读出的 Json 值 (可能为 null/undefined/unknown)
 * @param defaultValue - validate 失败或 value 为 null 时的回退值
 * @param validate     - 可选 type guard, 运行时验证 value 是否符合 T
 */
export function parseJsonField<T>(
  value: unknown,
  defaultValue: T,
  validate?: (v: unknown) => v is T,
): T {
  // null / undefined → 默认值 (DB 列允许 NULL, 业务代码需兜底)
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // 无 validate → 直接断言 (与 as 等价, 但语义清晰)
  if (!validate) {
    return value as unknown as T;
  }

  // 有 validate → 运行时验证
  if (validate(value)) {
    return value;
  }

  // 验证失败 → 记录 + 回退 (不静默吞错, 但也不 crash)
  logger.warn(
    '[json-helpers] parseJsonField validation failed, using default. ' +
      `value type=${Array.isArray(value) ? 'array' : typeof value}, ` +
      `value preview=${safePreview(value)}`,
  );
  return defaultValue;
}

/**
 * 把 Json 值安全转换为 typed T[] (读 DB 后)。
 *
 * parseJsonField 的数组特化版, 默认 validate 为 Array.isArray,
 * 确保 value 至少是数组 (不是数组则用 defaultValue)。
 *
 * 替代: `value as unknown as SomeType[]` — 无数组检查, value 是字符串也通过编译
 *
 * @param value        - 从 DB 读出的 Json 值
 * @param defaultValue - 默认数组 (通常传 [])
 */
export function parseJsonArray<T>(
  value: unknown,
  defaultValue: T[],
): T[] {
  return parseJsonField<T[]>(
    value,
    defaultValue,
    (v): v is T[] => Array.isArray(v),
  );
}

/**
 * 把 Json 值安全转换为 typed Record<string, T> (读 DB 后)。
 *
 * parseJsonField 的对象特化版, 默认 validate 检查 value 是 plain object (非数组非 null)。
 *
 * 替代: `value as unknown as Record<string, unknown>` — 无对象检查
 */
export function parseJsonObject<T extends Record<string, unknown>>(
  value: unknown,
  defaultValue: T,
): T {
  return parseJsonField<T>(
    value,
    defaultValue,
    (v): v is T => typeof v === 'object' && v !== null && !Array.isArray(v),
  );
}

// ============================================================
// 内部辅助
// ============================================================

const MAX_PREVIEW_LENGTH = 200;

function safePreview(value: unknown): string {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (str === undefined) return 'undefined';
    return str.length > MAX_PREVIEW_LENGTH
      ? str.substring(0, MAX_PREVIEW_LENGTH) + '...(truncated)'
      : str;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return '(unserializable)';
  }
}
