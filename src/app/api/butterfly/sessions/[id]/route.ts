/**
 * DELETE /api/butterfly/sessions/[id] — 删除单条历史剧情会话
 *
 * 历史剧情记录功能: 允许用户删除某段已结束的剧情（completed 或 abandoned）。
 * active 会话不可通过此接口删除（应使用 /api/butterfly/session DELETE 放弃）。
 *
 * 🔧 ARCH fix (Round 8 M4): 改用 authenticated client (cookie) 替代 admin client。
 *    旧代码用 admin client 绕过 RLS — 若未来代码遗漏 .eq('user_id') 检查, 任何用户可删任意会话。
 *    根因修复: 用 cookie client, RLS 自动强制 user_id ownership。
 *
 * PATCH /api/butterfly/sessions/[id] — 切换收藏状态
 *
 * 🔧 2026-07-17 (migration 118): 新增 bookmark 收藏功能
 *   body: { isBookmarked?: boolean }  // 不传则 toggle
 *   返回: { success: true, isBookmarked: boolean }
 *   用 authenticated client + RLS 保护
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF with dynamic params support.
 *    Before: 193 lines with manual createAuthenticatedClient + mergeCookiesFn pattern
 *    After: ~130 lines, auth/cookie/error handled by withAuth
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

export const PATCH = withAuth<{ id: string }>(async ({ supabase, user, request, params }) => {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Session id is required' }, { status: 400 });
  }

  // 解析 body (允许空 body = toggle)
  let body: { isBookmarked?: boolean } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as { isBookmarked?: boolean };
  } catch {
    // safe to ignore: body 解析失败 — 当作 toggle 处理
    body = {};
  }

  // 查询当前 is_bookmarked 状态
  const { data: session, error: checkError } = await supabase
    .from('butterfly_sessions')
    .select('id, user_id, is_bookmarked')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; user_id: string; is_bookmarked: boolean | null } | null; error: { message: string } | null };

  if (checkError) {
    logger.error('[Butterfly API] Bookmark pre-check error:', checkError.message);
    return NextResponse.json({ error: 'Failed to verify session' }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // 计算新状态: 优先用 body.isBookmarked, 否则 toggle
  const currentBookmarked = session.is_bookmarked ?? false;
  const newBookmarked = typeof body.isBookmarked === 'boolean' ? body.isBookmarked : !currentBookmarked;

  // 更新
  const { error: updateError } = await supabase
    .from('butterfly_sessions')
    .update({ is_bookmarked: newBookmarked, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (updateError) {
    logger.error('[Butterfly API] Failed to update bookmark:', updateError.message);
    return NextResponse.json({ error: 'Failed to update bookmark' }, { status: 500 });
  }

  return NextResponse.json({ success: true, isBookmarked: newBookmarked });
});

export const DELETE = withAuth<{ id: string }>(async ({ supabase, user, params }) => {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Session id is required' }, { status: 400 });
  }

  // 用 authenticated client — RLS 自动强制 user_id ownership
  // 先验证: 确保会话属于该用户且非 active
  const { data: session, error: checkError } = await supabase
    .from('butterfly_sessions')
    .select('id, user_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; user_id: string; status: string } | null; error: { message: string } | null };

  if (checkError) {
    logger.error('[Butterfly API] Delete pre-check error:', checkError.message);
    return NextResponse.json({ error: 'Failed to verify session' }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.status === 'active') {
    return NextResponse.json({ error: 'Cannot delete active session' }, { status: 400 });
  }

  // 执行删除 (authenticated client, RLS 保护)
  const { error: deleteError, count } = await supabase
    .from('butterfly_sessions')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id)
    .neq('status', 'active');

  if (deleteError) {
    logger.error('[Butterfly API] Failed to delete session:', deleteError.message);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }

  // 🔧 BUG-3 fix: 检查实际删除的行数
  if (count === 0) {
    logger.warn('[Butterfly API] Delete returned 0 rows for session:', id);
    return NextResponse.json({ error: 'Session could not be deleted' }, { status: 500 });
  }

  logger.info(`[Butterfly API] Session ${id} deleted successfully (${count} rows)`);
  return NextResponse.json({ success: true, deleted: count });
});
