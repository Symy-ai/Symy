/**
 * POST /api/letta/agent — 用户 Letta Agent 管理
 *
 * 请求体:
 *   { "action": "ensure" }  — 确保用户有 agent，没有则创建（用于老用户迁移）
 *   { "action": "status" }  — 查询用户 agent 状态
 *   { "action": "create" }  — 强制创建新 agent（即使已有）
 *
 * 需要：已认证用户
 *
 * ⚠️ 不再惰性创建！Agent 应在账户激活时（auth callback）创建。
 * 此路由的 "ensure" 仅用于老用户迁移（他们在功能上线前已注册）。
 *
 * 🔧 Round 103: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on the 401 return — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getUserAgentId, createAgentForUser, getOrCreateAgentId } from '@/lib/letta-agent-manager';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
// 🔧 Round 112 P0 fix: Letta agent 创建可能需要 30s+, 加 backoff 重试 62s
// Vercel 默认 10s 超时不够 → 函数被 kill → 锁不释放 → 后续请求全部 lock contention
// 设 maxDuration=300s (Vercel Pro 上限) 确保 agent 创建 + backoff 重试能完成
export const maxDuration = 300;

const lettaAgentSchema = z.object({
  action: z.enum(['ensure', 'status', 'create']).optional(),
}).passthrough();

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body = await validateBody(request, lettaAgentSchema);
    if (isValidationError(body)) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const { action } = body;

    if (action === 'status') {
      const agentId = await getUserAgentId(user.id);
      return NextResponse.json({
        hasAgent: !!agentId,
        agentId: agentId || null,
      });
    }

    if (action === 'create') {
      const existingId = await getUserAgentId(user.id);
      if (existingId) {
        return NextResponse.json(
          { error: 'Agent already exists. Use "ensure" action or delete first.', existingAgentId: existingId },
          { status: 409 },
        );
      }
      // 🔧 Round 112: 直接调 createAgentForUser 并捕获错误详情
      //    之前 createAgentForUser 内部 catch 了错误返回 null, 无法诊断
      const { createAgentForUser } = await import('@/lib/letta-agent-manager');
      let agentId: string | null = null;
      let createError: string | null = null;
      try {
        agentId = await createAgentForUser(user.id, user.email);
      } catch (err) {
        createError = err instanceof Error ? err.message : String(err);
      }
      if (!agentId) {
        // 🔧 2026-07-15 (ARCH-8 #25 修复): 不向客户端暴露内部配置状态 + createError 详情
        //    旧代码: 返回 LETTA_API_KEY: true/false, SUPABASE_KEY: true/false, raw createError
        //    → 任何 authenticated 用户可探测环境变量配置 + Letta 内部错误信息
        //    修复: 返回通用错误, 详细信息只 log 到 server
        const lettaKeyConfigured = !!process.env.LETTA_API_KEY;
        const supabaseKeyConfigured = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        logger.error('[Letta Agent API] createAgentForUser failed:', {
          lettaKeyConfigured,
          supabaseKeyConfigured,
          createError,
        });
        return NextResponse.json(
          { error: 'Failed to create agent. Please try again later.' },
          { status: 500 },
        );
      }
      return NextResponse.json({
        success: true,
        agentId,
        message: 'Agent created successfully',
      });
    }

    // Default: ensure
    const wasExisting = await getUserAgentId(user.id);
    const newAgentId = await getOrCreateAgentId(user.id, user.email || undefined);
    if (!newAgentId) {
      return NextResponse.json(
        { error: 'Failed to create agent for user (lock contention or creation error)' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      agentId: newAgentId,
      isPerUser: true,
      isNewPerUser: !wasExisting,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[Letta Agent API] Agent operation failed:', message);
    return NextResponse.json(
      { error: 'Agent operation failed. Please try again later.' },
      { status: 500 },
    );
  }
});

export const GET = withAuth(async ({ user }) => {
  const agentId = await getUserAgentId(user.id);
  return NextResponse.json({
    hasAgent: !!agentId,
    agentId: agentId || null,
  });
});
