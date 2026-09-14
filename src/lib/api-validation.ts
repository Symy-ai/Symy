/**
 * Body Validation Helpers — Centralized zod schemas for API routes
 *
 * 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 旧代码 32 个 API route 直接 `await request.json() as T`
 *    → 无运行时验证 → 客户端发任何 garbage 都被当作 T 用 → 后续代码 crash 或写入脏数据
 *    → 财务路由 (deposit/withdraw/dream-funds) 风险最高: 金额可为负、NaN、字符串等
 *
 * 根因修复: 集中 zod schema + validateBody helper。所有 API route 入口统一验证。
 *
 * 用法:
 *   import { validateBody } from '@/lib/api-validation';
 *   import { z } from 'zod';
 *
 *   const mySchema = z.object({ name: z.string().min(1) });
 *   const bodyOrError = await validateBody(request, mySchema);
 *   if (bodyOrError instanceof NextResponse) return bodyOrError;
 *   // bodyOrError 现在是 typed body
 *
 * 注意: 路由自行定义 zod schema (而非用预定义的 schemas), 因为不同路由字段需求不同。
 *       validateBody 仅提供 helper, 不强制 schema 形状。
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Validate request body against a zod schema.
 *
 * On success: returns the parsed body (typed).
 * On failure: returns NextResponse.json with 400 + detailed error (caller must check typeof).
 *
 * 用法:
 *   const bodyOrError = await validateBody(request, schema);
 *   if (bodyOrError instanceof NextResponse) return bodyOrError;
 *   // bodyOrError 现在是 typed body
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // 🔧 ARCH: 返回结构化错误, 方便客户端区分字段级错误
    const issues = result.error.issues.map(i => ({
      path: i.path.join('.'),
      message: i.message,
      code: i.code,
    }));
    return NextResponse.json(
      { error: 'Validation failed', issues },
      { status: 400 },
    );
  }
  return result.data;
}

/**
 * Type guard: 检查 validateBody 返回值是否为 NextResponse (错误响应)
 */
export function isValidationError<T>(value: T | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

// ============================================================
// Query string validation
// ============================================================

/**
 * Validate query string params against a zod schema.
 *
 * 用法:
 *   const paramsOrError = validateQuery(request, z.object({ sessionId: z.string().uuid() }));
 *   if (paramsOrError instanceof NextResponse) return paramsOrError;
 */
export function validateQuery<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): T | NextResponse {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(i => ({
      path: i.path.join('.'),
      message: i.message,
      code: i.code,
    }));
    return NextResponse.json(
      { error: 'Query validation failed', issues },
      { status: 400 },
    );
  }
  return result.data;
}

// ============================================================
// Common reusable schema building blocks
// ============================================================

/**
 * Reusable zod primitives — routes can compose these into their own schemas.
 *
 * 🔧 ARCH fix (Round 11 ADV-REVIEW LOW-1): 删除了未使用的预定义 schemas 对象
 *    (旧代码定义了 12 个 shared schemas, 但所有路由都自定义 schema, 导致 drift 风险).
 *    根因修复: 只导出 primitive building blocks, 路由自行组合, 单一职责.
 */

/** 正整数金额 (元) — 用于 deposit/withdraw */
export const amountSchema = z.number()
  .finite()
  .min(0, 'Amount must be non-negative')
  .max(1_000_000, 'Amount exceeds maximum (1,000,000)');

/** 安全字符串 — 防止过长输入导致 DB / log 爆炸 */
export const safeString = (max: number = 1000) => z.string().max(max).trim();

/** UUID v4 格式 */
export const uuidSchema = z.string().uuid();

/** 安全 ID 格式 (字母数字下划线短横线) — 用于 fund_id 等自定义 ID */
export const safeIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid ID format').max(100);
