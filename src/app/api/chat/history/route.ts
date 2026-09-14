/**
 * 聊天记录 CRUD API
 *
 * GET  /api/chat/history         — 加载历史消息（按时间升序，可分页）
 * POST /api/chat/history         — 异步保存一条消息
 * DELETE /api/chat/history?id=xxx — 删除单条消息
 * DELETE /api/chat/history?all=1  — 清空所有聊天记录
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (auto cookie + Cache-Control)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError, validateQuery } from '@/lib/api-validation';
import { z } from 'zod';

// GET: 加载历史消息
export const GET = withAuth(async ({ request, supabase, user }) => {
  const queryParams = validateQuery(request, z.object({
    limit: z.coerce.number().int().min(1).max(50).default(6),
    before: z.string().optional(),
    mode: z.enum(['normal', 'challenge']).default('normal'),
  }));
  if (isValidationError(queryParams)) return queryParams;
  const { limit, before, mode } = queryParams;

  const { count: totalCount } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('mode', mode);

  let query = supabase
    .from('chat_messages')
    .select('id, role, content, reasoning, created_at')
    .eq('user_id', user.id)
    .eq('mode', mode);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data: rawData, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  const data = rawData ? [...rawData].reverse() : [];

  if (error) {
    logger.error('[Chat History] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to load chat history. Please refresh.' }, { status: 500 });
  }

  const hasMore = before
    ? data.length >= limit
    : (totalCount || 0) > data.length;

  return NextResponse.json({
    messages: data,
    totalCount: totalCount || 0,
    hasMore,
  });
});

// POST: 保存一条消息
export const POST = withAuth(async ({ request, supabase, user }) => {
  const chatHistorySchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1, 'Invalid role or missing content').max(10000),
    reasoning: z.string().max(50000).nullable().optional(),
    mode: z.enum(['normal', 'challenge']).optional(),
  });
  const body = await validateBody(request, chatHistorySchema);
  if (isValidationError(body)) return body;
  const { role, content, reasoning, mode } = body;

  const messageMode = mode ?? 'normal';

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: user.id,
      role,
      content,
      reasoning: reasoning || null,
      mode: messageMode,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    logger.warn('[Chat History] POST error:', error.message);
    return NextResponse.json({ error: 'Table not available' }, { status: 503 });
  }

  return NextResponse.json({ id: data?.id ?? null });
});

// DELETE: 删除单条 / 清空全部
export const DELETE = withAuth(async ({ request, supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get('id');
  const clearAll = searchParams.get('all') === '1';

  if (clearAll) {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      logger.warn('[Chat History] DELETE all error:', error.message);
      return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
    }
    return NextResponse.json({ success: true, action: 'clear_all' });
  }

  if (messageId) {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id);

    if (error) {
      logger.warn('[Chat History] DELETE one error:', error.message);
      return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
    }
    return NextResponse.json({ success: true, action: 'delete_one' });
  }

  return NextResponse.json({ error: 'Missing id or all=1 parameter' }, { status: 400 });
});
