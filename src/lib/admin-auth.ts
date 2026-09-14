import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Admin API 鉴权工具
 *
 * 为 /api/admin/* 路由提供统一的鉴权能力。
 * 请求需携带以下任一凭证：
 *   - Authorization: Bearer <ADMIN_API_KEY>
 *   - X-Admin-Key: <ADMIN_API_KEY>
 *
 * 环境变量：
 *   - ADMIN_API_KEY: Admin API 密钥（必须配置，否则所有请求被拒绝）
 *
 * 用法：
 *   import { verifyAdminAuth } from '@/lib/admin-auth';
 *
 *   export async function GET(request: NextRequest) {
 *     const authResult = verifyAdminAuth(request);
 *     if (!authResult.authorized) {
 *       return NextResponse.json({ error: authResult.error }, { status: 401 });
 *     }
 *     // ... 处理请求 ...
 *   }
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
// 🔧 ARCH fix (Round 56 R56-Bug6 — 提取共享 timingSafeCompare helper)
import { timingSafeCompare } from '@/lib/timing-safe-compare';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export interface AdminAuthResult {
  authorized: boolean;
  error?: string;
  // 🔧 ARCH fix (Round 13 BUG-14): admin actor identity (from X-Admin-Actor header)
  actor?: string;
}

// 🔧 ARCH fix (Round 13 BUG-14): 可选配置 actor 白名单 (逗号分隔)
// 未配置时 actor 可选; 配置后 actor 必须在白名单内 (fail-closed)
const ALLOWED_ACTORS = (process.env.ADMIN_ALLOWED_ACTORS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// 🔧 ARCH fix (Round 14 ADV-R13-10 + ADV-R14-2): 抽取 resolveActor helper
//    actor='unknown' 时 logger.warn, 但仅在未配置 ALLOWED_ACTORS 时 (配置白名单时 'unknown' 会被拒, warn 语义错误)
function resolveActor(request: NextRequest): string {
  const header = request.headers.get('X-Admin-Actor');
  if (header) return header;
  // 🔧 ADV-R14-2: 仅在未配置白名单时 warn (配置白名单时 'unknown' 会被下方 ALLOWED_ACTORS 检查拒绝, 不入审计)
  if (ALLOWED_ACTORS.length === 0) {
    logger.warn(
      `[Admin Auth] X-Admin-Actor header missing — admin request will be logged with actor="unknown". `
      + `Configure X-Admin-Actor header on admin client for audit trail. `
      + `route=${new URL(request.url).pathname}`,
    );
  }
  return 'unknown';
}

/**
 * 验证 Admin API 请求的鉴权信息
 *
 * 支持两种凭证传递方式：
 * 1. Authorization: Bearer <ADMIN_API_KEY>（推荐，标准方式）
 * 2. X-Admin-Key: <ADMIN_API_KEY>（便捷方式，适合 curl/调试）
 *
 * @param request - Next.js 请求对象
 * @returns 鉴权结果
 */
export function verifyAdminAuth(request: NextRequest): AdminAuthResult {
  // 检查环境变量是否配置
  if (!ADMIN_API_KEY) {
    logger.error('[Admin Auth] ADMIN_API_KEY not configured. All admin requests will be rejected.');
    return {
      authorized: false,
      error: 'Admin API not configured. Set ADMIN_API_KEY environment variable.',
    };
  }

  // 方式 1: Authorization Bearer Token
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    // BUG-129 fix: 使用 timing-safe 比较，防止时序攻击
    if (timingSafeCompare(token, ADMIN_API_KEY)) {
      // 🔧 ARCH fix (Round 13 BUG-14 + Round 14 ADV-R13-10): 用 resolveActor helper
      const actor = resolveActor(request);
      if (ALLOWED_ACTORS.length > 0 && !ALLOWED_ACTORS.includes(actor)) {
        return { authorized: false, error: `Actor '${actor}' not in allowlist` };
      }
      return { authorized: true, actor };
    }
    return {
      authorized: false,
      error: 'Invalid admin API key in Authorization header.',
    };
  }

  // 方式 2: X-Admin-Key header
  const adminKey = request.headers.get('X-Admin-Key');
  if (adminKey) {
    // BUG-129 fix: 使用 timing-safe 比较，防止时序攻击
    if (timingSafeCompare(adminKey.trim(), ADMIN_API_KEY)) {
      // 🔧 ARCH fix (Round 13 BUG-14 + Round 14 ADV-R13-10): 用 resolveActor helper
      const actor = resolveActor(request);
      if (ALLOWED_ACTORS.length > 0 && !ALLOWED_ACTORS.includes(actor)) {
        return { authorized: false, error: `Actor '${actor}' not in allowlist` };
      }
      return { authorized: true, actor };
    }
    return {
      authorized: false,
      error: 'Invalid admin API key in X-Admin-Key header.',
    };
  }

  // 无凭证
  return {
    authorized: false,
    error: 'Missing authentication. Provide Authorization: Bearer <key> or X-Admin-Key: <key> header.',
  };
}

/**
 * 检查 ADMIN_API_KEY 环境变量是否已配置
 */
export function isAdminApiKeyConfigured(): boolean {
  return !!ADMIN_API_KEY;
}

/**
 * 便捷函数：返回 boolean 鉴权结果
 *
 * 🔒 防止历史 bug 重现：verifyAdminAuth() 返回对象（始终 truthy），
 *    直接 `if (verifyAdminAuth(req))` 或 `if (!verifyAdminAuth(req))` 都是错的。
 *    新代码应使用此函数，或在调用 verifyAdminAuth() 后检查 `.authorized` 字段。
 *
 * @param request - Next.js 请求对象
 * @returns true 如果鉴权通过，false 否
 */
export function isAdminAuthorized(request: NextRequest): boolean {
  return verifyAdminAuth(request).authorized;
}
