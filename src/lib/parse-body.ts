/**
 * parseBody — Safe JSON body parsing for API routes.
 *
 * 🔧 ARCH fix (Round 54 R54-Bug6 — request.json().catch(() => ({})) 重复 18 处):
 *    旧代码: 每个 route 手动 `await request.json().catch(() => ({}))` 或 try/catch。
 *    问题: 容易忘记 catch (未处理 promise rejection), 容易用不一致的 fallback 值。
 *    根因修复: 提取共享 helper, 统一 JSON 解析 + fallback + 类型安全。
 *
 * 复杂度转移: 业务代码不再需要手动 catch JSON 解析错误。
 *
 * @example
 * ```ts
 * // Before:
 * const body = await request.json().catch(() => ({}));
 * const name = (body as { name?: string }).name;
 *
 * // After:
 * const { name } = await parseBody<{ name?: string }>(request);
 * ```
 */

import type { NextRequest } from 'next/server';

/**
 * Safely parse JSON body from a NextRequest.
 *
 * @param request - The NextRequest object
 * @param fallback - Value to return if body is not valid JSON (default: {})
 * @returns Parsed body typed as T, or fallback
 */
export async function parseBody<T = Record<string, unknown>>(
  request: NextRequest,
  fallback: T = {} as T,
): Promise<T> {
  try {
    const body = await request.json();
    return (body ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parse JSON body and validate that required fields are present.
 *
 * @param request - The NextRequest object
 * @param requiredFields - Array of field names that must be present
 * @returns `{ success: true, body }` or `{ success: false, error }`
 *
 * @example
 * ```ts
 * const result = await parseBodyWithValidation(request, ['itemName', 'amount']);
 * if (!result.success) {
 *   return NextResponse.json({ error: result.error }, { status: 400 });
 * }
 * const { itemName, amount } = result.body;
 * ```
 */
export async function parseBodyWithValidation<T extends Record<string, unknown>>(
  request: NextRequest,
  requiredFields: (keyof T)[],
): Promise<
  | { success: true; body: T }
  | { success: false; error: string }
> {
  const body = await parseBody<T>(request);

  const missing = requiredFields.filter(field => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missing.join(', ')}`,
    };
  }

  return { success: true, body };
}
