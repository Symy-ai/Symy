import 'server-only'; // 🔧 ARCH fix Round 74: server-only — prevents client bundle leak
/**
 * API Error Response Utility — Structured error responses with requestId for log correlation.
 *
 * 🔧 ARCH fix Round 74 (Finding 17): 14+ routes return generic 500 "Internal server error"
 *    with no detail, no error code, no correlation ID. Debugging production issues is difficult.
 *
 * 根因修复: 提供 createApiError helper, 统一生成结构化错误响应:
 *    - code: machine-readable error code (DB_ERROR, UPSTREAM_TIMEOUT, etc.)
 *    - message: human-readable error message (safe to expose)
 *    - requestId: UUID for log correlation (client can report this, ops can search logs)
 *
 * 复杂度转移: 业务代码不再需要手动构造 error response, 架构层统一格式.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/error-utils';

/** Machine-readable error codes (safe to expose to client) */
export type ApiErrorCode =
  | 'INTERNAL'        // Unexpected error (500)
  | 'DB_ERROR'        // Database operation failed (500)
  | 'UPSTREAM_ERROR'  // External API (Letta, OpenAI, etc.) failed (502)
  | 'UPSTREAM_TIMEOUT'// External API timed out (504)
  | 'RATE_LIMITED'    // Rate limit exceeded (429)
  | 'NOT_FOUND'       // Resource not found (404)
  | 'CONFLICT'        // Version conflict / duplicate (409)
  | 'VALIDATION'      // Input validation failed (400)
  | 'UNAUTHORIZED'    // Auth required (401)
  | 'FORBIDDEN'       // Auth OK but no permission (403)
  | 'DEGRADED';       // Service partially available (200 with degraded flag)

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  requestId: string;
  /** Optional detail (safe to expose — no internal paths/SQL) */
  detail?: string;
}

/**
 * Create a structured API error response.
 *
 * Automatically:
 *   1. Generates a requestId (UUID) for log correlation
 *   2. Logs the error with requestId + code + context
 *   3. Returns NextResponse.json with structured body
 *
 * @param status - HTTP status code (400, 401, 403, 404, 409, 429, 500, 502, 504)
 * @param code - Machine-readable error code
 * @param message - Human-readable message (safe to expose)
 * @param err - The original error (logged with full detail, NOT exposed to client)
 * @param context - Additional context for logging (route name, user ID, etc.)
 *
 * @example
 * ```ts
 * try {
 *   await db.query(...);
 * } catch (err) {
 *   return createApiError(500, 'DB_ERROR', 'Failed to save buddy state', err, { route: 'POST /api/buddy/state', userId: user.id });
 * }
 * ```
 */
export function createApiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  err?: unknown,
  context?: Record<string, unknown>,
): NextResponse {
  const requestId = randomUUID();
  const errMsg = err ? getErrorMessage(err) : undefined;

  // Log with full detail for server-side debugging
  logger.error(`[API Error] ${code} ${status} ${requestId}`, {
    code,
    status,
    requestId,
    message,
    error: errMsg,
    context,
  });

  // Return structured response (safe to expose — no internal details)
  const body: ApiErrorBody = {
    error: message,
    code,
    requestId,
  };

  return NextResponse.json(body, { status });
}
