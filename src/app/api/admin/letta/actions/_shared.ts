/**
 * Shared types, helpers, and context builder for Letta admin action handlers.
 *
 * Pure extraction from the original monolithic route.ts — behavior unchanged.
 *
 * ARCH fix Round 73 — Audit Finding 3.1: each admin action now declares its own zod
 * schema and validates via `validateActionBody`. This replaces the previous pattern of
 * `ctx.body.field as string` casts which silently accepted malformed input
 * (e.g. `{ agent_id: 12345 }` — number instead of string — would pass the cast and
 * crash downstream).
 */

import { NextRequest, NextResponse } from 'next/server';
import Letta from '@letta-ai/letta-client';
import { verifyAdminAuth, type AdminAuthResult } from '@/lib/admin-auth';
import { logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { logger } from '@/lib/logger';
import type { ZodType } from 'zod';

// ── Environment constants ──────────────────────────────────────────

export const LETTA_API_KEY = process.env.LETTA_API_KEY || '';
export const MCP_API_SECRET = process.env.MCP_API_SECRET || '';
const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_APP_URL || VERCEL_URL;

export function getMcpServerUrl(): string {
  if (!MCP_SERVER_URL) {
    throw new Error('NEXT_PUBLIC_APP_URL or VERCEL_URL is required. Set one in .env or Vercel environment variables.');
  }
  return MCP_SERVER_URL;
}
export const LETTA_API_BASE = 'https://api.letta.com/v1';

// ── Shared helpers ─────────────────────────────────────────────────

/** Create a Letta client instance */
export function getClient(): Letta {
  return new Letta({
    apiKey: LETTA_API_KEY,
    environment: 'cloud',
  });
}

// 🔧 ARCH fix (Round 12 AUDIT-1 M-1): lettaUnsafe helper 已移除
//    旧代码: `export function lettaUnsafe(client: Letta): any { return client as any; }`
//    问题: 12 个 admin actions 用此 helper 绕过 TS 类型检查 → SDK 签名变更不会被发现
//    根因修复: 所有 actions 直接用 ctx.client.agents.* / ctx.client.blocks.* 等 typed API
//    若 SDK 类型不完整, 应在该 action 内部用局部 `as` cast, 而非全局 escape hatch

/** Letta REST API通用请求 */
  // eslint-disable-next-line require-await -- async for API consistency
export async function lettaAPI(path: string, options?: RequestInit) {
  // 🔧 2026-07-15 (ARCH-4 #15 修复): 加 30s timeout — 旧代码无 timeout, Letta 挂起时永久阻塞
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(`${LETTA_API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LETTA_API_KEY}`,
        ...options?.headers,
      },
      signal: options?.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Admin context ──────────────────────────────────────────────────

export interface AdminCtx {
  client: Letta;
  body: Record<string, unknown>;
  /** The action string (already extracted from body) */
  action: string;
}

/**
 * Build the shared admin context: verify auth, parse body, create client.
 * Returns { ctx, authResult } on success, or a NextResponse error on failure.
 * 🔧 ARCH fix (Round 14 BUG-14): 返回 authResult 供 route 层 withAdminAudit 使用
 */
export async function buildAdminCtx(request: NextRequest): Promise<{ ctx: AdminCtx; authResult: AdminAuthResult } | { error: NextResponse }> {
  // 1. Auth check
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    // 🔧 ARCH fix (Round 15 ADV-R14-3): 记录未授权尝试
    void logUnauthorizedAdminAttempt(request, authResult);
    return { error: NextResponse.json({ error: authResult.error }, { status: 401 }) };
  }

  // 2. Letta config check
  if (!LETTA_API_KEY) {
    return { error: NextResponse.json({ error: 'Letta not configured (LETTA_API_KEY missing)' }, { status: 400 }) };
  }

  // 3. Parse body — admin endpoints accept varied body shapes, so we use a permissive schema
  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代裸 request.json()
  //    admin body 字段因 action 不同而不同 (action, agentId, system, tools[] 等),
  //    统一用 z.record(z.unknown()) 验证 top-level 是 object, 拒绝 array/primitive。
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    // 拒绝 array / primitive / null — admin endpoints always expect object
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { error: NextResponse.json({ error: 'Invalid body: expected JSON object' }, { status: 400 }) };
    }
    body = raw as Record<string, unknown>;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const client = getClient();

  return { ctx: { client, body, action }, authResult };
}

/**
 * Same as buildAdminCtx but for GET requests (no body parsing needed).
 */
export function buildAdminCtxGet(request: NextRequest): { client: Letta } | { error: NextResponse } {
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    // 🔧 ARCH fix (Round 15 ADV-R14-3): 记录未授权尝试
    void logUnauthorizedAdminAttempt(request, authResult);
    return { error: NextResponse.json({ error: authResult.error }, { status: 401 }) };
  }

  if (!LETTA_API_KEY) {
    return { error: NextResponse.json({ error: 'Letta not configured (LETTA_API_KEY missing).' }) };
  }

  return { client: getClient() };
}

// ── Re-export commonly used modules ────────────────────────────────

export { NextResponse, NextRequest };
export { logger };

// ── Body validation helper (Round 73 — Finding 3.1) ───────────────

/**
 * Validate ctx.body against a zod schema. Returns discriminated union:
 *   - { success: true, data: T } — validated body, type-safe to use
 *   - { success: false, response: NextResponse } — 400 error response ready to return
 *
 * Usage:
 *   const result = validateActionBody(deleteAgentSchema, ctx);
 *   if (!result.success) return result.response;
 *   const { agent_id } = result.data; // typed as string
 */
export function validateActionBody<T>(
  schema: ZodType<T>,
  ctx: AdminCtx,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const parsed = schema.safeParse(ctx.body);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  // Format zod errors as a readable string for the admin client
  const errorMessages = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return {
    success: false,
    response: NextResponse.json(
      { error: 'Invalid body', details: errorMessages },
      { status: 400 },
    ),
  };
}
