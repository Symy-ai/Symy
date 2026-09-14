/**
 * POST /api/butterfly/illustration — 为章节生成/重新生成插图
 *
 * M4 fix: 重新设计此路由，支持以下用途：
 * 1. 手动重新生成指定章节的插图（用户点击"重新生成"按钮）
 * 2. 简化的请求体：只需 sessionId + chapterIndex
 *    系统会从数据库中读取章节信息
 *
 * 工作流程：
 * 1. 接收 sessionId + chapterIndex（需要认证）
 * 2. 从数据库中读取章节信息（title, tone, timeSpan, content 等）
 * 3. 使用 illustration-engine 生成 Dark Concept Art 风格插图
 * 4. 自动上传到 Supabase Storage 并持久化 URL
 * 5. 返回公开 URL
 *
 * 优雅降级：如果生成失败，返回 null（故事仍可正常展示）
 *
 * C3 fix: 添加认证保护 + 会话所有权验证
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookies pattern — now handled automatically by withAuth).
 */

import { withAuth } from '@/lib/with-auth';
import { generateAndPersistIllustration } from '@/features/butterfly/lib/illustration-engine';
import { dbToSession } from '@/features/butterfly/lib/db-mappers';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/distributed-lock';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

// 🔧 ARCH fix (Round 24 H3 — illustration 认证端点无 rate limit → OpenAI API 配额烧穿):
//    旧代码无任何速率限制, 单个用户可脚本化 spam 点 regenerate → OpenAI Image API ($0.04-0.17/张)。
//    根因修复: 按 userId 限制 30 次/小时 (正常使用足够)。
const RATE_LIMIT_PER_HOUR = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// 🔧 PM-NEW-44 fix: maxDuration=120 — generateAndPersistIllustration 调 ZAI image API,
//    可能需要 30-60s, 但 Vercel 默认 10s 超时 → 插图生成失败。
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 24 H3): 按 userId rate limit (30 次/小时)
  const { allowed: rateAllowed } = await checkRateLimit(
    `illust-auth:${user.id}`,
    RATE_LIMIT_PER_HOUR,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rateAllowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before regenerating more illustrations.' },
      { status: 429 },
    );
  }

  // 解析请求 + 验证
  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation (含 UUID + chapterIndex 范围)
  const illustrationSchema = z.object({
    sessionId: z.string().uuid('Invalid sessionId format'),
    chapterIndex: z.number().int().min(0, 'Missing required fields: sessionId, chapterIndex').max(100),
  });
  const body = await validateBody(request, illustrationSchema);
  if (isValidationError(body)) return body;
  const { sessionId, chapterIndex } = body;

  // C3 fix: 验证会话属于当前用户 + 读取章节信息
  const { data: sessionRow, error: dbError } = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (dbError || !sessionRow) {
    return NextResponse.json(
      { error: 'Session not found or access denied' },
      { status: 403 }
    );
  }

  const session = dbToSession(sessionRow);

  // 查找目标章节
  const targetChapter = session.chapters.find(ch => ch.index === chapterIndex);
  if (!targetChapter) {
    return NextResponse.json(
      { error: `Chapter ${chapterIndex} not found in this session` },
      { status: 404 }
    );
  }

  try {
    // 使用章节内容生成更精准的插图
    const illustrationUrl = await generateAndPersistIllustration({
      sessionId: session.id,
      chapterIndex: targetChapter.index,
      title: targetChapter.title,
      tone: targetChapter.tone,
      timeSpan: targetChapter.timeSpan,
      decisionDescription: session.decisionDescription,
      decisionType: session.decisionType,
      contentSnippet: targetChapter.content?.slice(0, 500),
    });

    if (illustrationUrl) {
      logger.info('[Butterfly Illustration API] Regenerated illustration for chapter', chapterIndex);
    }

    return NextResponse.json({ illustrationUrl });
    // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                // safe to ignore: non-critical background operation, error already logged
    // 优雅降级：生成失败不影响故事功能
    logger.warn('[Butterfly Illustration API] Generation failed (graceful degradation):', err instanceof Error ? err.message : err);
    return NextResponse.json({ illustrationUrl: null });
  }
});
