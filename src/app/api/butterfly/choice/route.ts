/**
 * POST /api/butterfly/choice — 提交分岔路口选择
 *
 * H2 fix: 先持久化选择，再重生成大纲。
 * 如果大纲重生成失败，用户的选择至少已保存。
 * H14 fix: 防止覆盖已做出的选择。
 * H11 fix: 不手动设置 updated_at，由 DB 触发器管理。
 *
 * 🔧 PM-NEW-44 fix (P0): 加 maxDuration=120 — regenerateOutline 调 streamToAgent (LLM),
 *    需要 30-60s, 但 Vercel 默认 10s 超时 → choice 永远失败。
 *    与 story/session 路由一致 (maxDuration=120)。
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with ~10 mergeCookies calls — now handled automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { isStoryEngineReady } from '@/features/butterfly/lib/story-engine';
import { dbToSession } from '@/features/butterfly/lib/db-mappers';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import type { SubmitChoiceRequest, ButterflySession } from '@/features/butterfly/types';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';
import { toJson } from '@/lib/json-helpers';

// 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation (含 UUID 格式 + chapterIndex 范围)
const choiceSchema = z.object({
  sessionId: z.string().uuid('Invalid sessionId format'),
  chapterIndex: z.number().int().min(1, 'Invalid chapterIndex').max(100),
  selectedOption: z.string().min(1, 'selectedOption is required').max(10, 'Invalid selectedOption format'),
});

// 🔧 2026-07-18: regenerateOutlineWithRetry 已移除 — CH3 已预加载在 session.context

export const maxDuration = 120;

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 2026-07-15 (ARCH-2 #7 修复): Rate limiting on butterfly/choice (LLM cost)
  const { checkRateLimit } = await import('@/lib/distributed-lock');
  const { allowed: rateLimitAllowed } = await checkRateLimit(`butterfly-choice:user:${user.id}`, 30, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 30 choices per hour.' },
      { status: 429 }
    );
  }

  // 解析请求
  const body = await validateBody(request, choiceSchema);
  if (isValidationError(body)) return body;
  // 🔧 ARCH fix (Round 11 ADV-REVIEW LOW-4): 移除 as unknown as cast
  // zod 已验证 body 是 { sessionId: string, chapterIndex: number, selectedOption: string }
  // 与 SubmitChoiceRequest 接口完全兼容, 无需 cast
  const typedBody: SubmitChoiceRequest = body;

  // 获取会话
  const { data: sessionRow, error: dbError } = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('id', typedBody.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (dbError || !sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const session: ButterflySession = dbToSession(sessionRow);

  if (session.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 });
  }

  // 检查 Letta Agent 是否可用
  if (!isStoryEngineReady()) {
    return NextResponse.json(
      { error: 'Story engine is not available. Please try again later.' },
      { status: 503 }
    );
  }

  // 找到对应的选择（H5 fix: 简化检查，消除 TOCTOU 竞争窗口）
  const choice = session.choices.find(
    (c) => c.chapterIndex === typedBody.chapterIndex
  );

  if (!choice) {
    return NextResponse.json(
      { error: 'No choice found for this chapter' },
      { status: 404 }
    );
  }

  // 如果已经做出选择，返回 409 — 但如果大纲已重生成, 视为成功 (幂等)
  if (choice.selectedOption) {
    // 🔧 2026-07-18: 新流程中 CH3 已预加载在 session.context, 不需要 regenerateOutline
    //   只要 selectedOption 已存, 直接返回 session 让前端继续流式 CH3
    return NextResponse.json({ session });
  }

  // 验证选项有效
  const validOption = choice.options.find((o) => o.id === typedBody.selectedOption);
  if (!validOption) {
    return NextResponse.json(
      { error: `Invalid option. Valid options: ${choice.options.map(o => o.id).join(', ')}` },
      { status: 400 }
    );
  }

  // 更新选择（标记 selectedOption）
  const updatedChoices = session.choices.map((c) =>
    c.id === choice.id
      ? { ...c, selectedOption: typedBody.selectedOption }
      : c
  );

  // H2 fix: 先持久化选择到数据库，确保用户选择不丢失
  // H7 fix: 添加乐观锁，防止并发选择提交覆盖
  const { data: savedSession, error: saveError } = await supabase
    .from('butterfly_sessions')
    .update({
      choices: toJson(updatedChoices),
    })
    .eq('id', session.id)
    .eq('updated_at', sessionRow.updated_at) // H7 fix: 乐观锁
    .select()
    .maybeSingle();

  if (saveError) {
    logger.error('[Butterfly API] Failed to save choice:', saveError.message);
    return NextResponse.json({ error: 'Failed to save choice' }, { status: 500 });
  }
  // 🔧 ARCH fix (Round 25 R25-3 — 乐观锁失败返回 500 应 409):
  //    !savedSession 表示乐观锁失败 (0 行更新, updated_at 已被并发请求改)。
  //    返回 500 让 XState 进 generic error (用户看 "AI unavailable" 误导)。
  //    根因修复: 返回 409, submitChoiceService 已有 409 reload 逻辑。
  if (!savedSession) {
    logger.warn('[Butterfly API] Choice save optimistic lock failed (concurrent modification)');
    return NextResponse.json(
      { error: 'Session was modified by another request. Please refresh.', conflict: true },
      { status: 409 },
    );
  }

  // 🔧 2026-07-18: 不再调 regenerateOutline — CH3 已预加载在 session.context
  //   旧流程: choice → regenerateOutline (LLM 30-60s) → 返回 session → story API 流式 CH3
  //   新流程: choice → 只保存 selectedOption → 返回 session → story API 从 context 取 CH3
  // 标记 outlineRegenerated=true (CH3 已在 streamAllStory 中预加载)
  const finalChoices = updatedChoices.map((c) =>
    c.id === choice.id
      ? { ...c, outlineRegenerated: true }
      : c
  );

  // 更新 DB (只更新 choices, 不调 LLM)
  const { data: updatedSession, error: updateError } = await supabase
    .from('butterfly_sessions')
    .update({
      choices: toJson(finalChoices),
    })
    .eq('id', session.id)
    .select()
    .maybeSingle();

  if (updateError || !updatedSession) {
    logger.error('[Butterfly API] Failed to save choice:', updateError?.message);
    // 仍返回 savedSession (选择已存, 即使第二次 update 失败)
    const result = dbToSession(savedSession);
    return NextResponse.json({ session: result });
  }

  const result = dbToSession(updatedSession);

  return NextResponse.json({ session: result });
});
