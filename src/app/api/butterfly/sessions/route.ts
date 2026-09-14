/**
 * GET /api/butterfly/sessions — 获取历史会话列表 (分页)
 *
 * 查询参数:
 * - page: 页码（从 1 开始，默认 1）
 * - pageSize: 每页数量（1-50，默认 10）
 * - status: 逗号分隔的状态过滤（如 "completed,abandoned"）
 *           默认返回 completed + abandoned（历史剧情，排除 active 进行中会话）
 *           传 "all" 返回全部状态
 *
 * 返回:
 * - sessions: 当前页的会话列表
 * - total: 符合条件的总会话数
 * - page: 当前页码
 * - pageSize: 每页数量
 * - hasMore: 是否还有更多页
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookiesFn pattern — now handled automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { dbToSession } from '@/features/butterfly/lib/db-mappers';
import { NextResponse } from 'next/server';
import type { ButterflySession } from '@/features/butterfly/types';
import { logger } from '@/lib/logger';

const VALID_STATUSES = ['active', 'completed', 'abandoned'] as const;
type SessionStatus = typeof VALID_STATUSES[number];

export const GET = withAuth(async ({ supabase, user, request }) => {
  // 分页参数
  const pageParam = request.nextUrl.searchParams.get('page');
  const pageSizeParam = request.nextUrl.searchParams.get('pageSize');
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(pageSizeParam || '10', 10) || 10, 1), 50);

  // 状态过滤
  const statusParam = request.nextUrl.searchParams.get('status');
  let statuses: SessionStatus[];
  if (!statusParam || statusParam === 'all') {
    statuses = statusParam === 'all' ? [...VALID_STATUSES] : ['completed', 'abandoned'];
  } else {
    statuses = statusParam
      .split(',')
      .map(s => s.trim())
      .filter((s): s is SessionStatus => VALID_STATUSES.includes(s as SessionStatus));
    if (statuses.length === 0) {
      statuses = ['completed', 'abandoned'];
    }
  }

  // 先查总数
  const { count, error: countError } = await supabase
    .from('butterfly_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', statuses);

  if (countError) {
    logger.error('[Butterfly Sessions API] Count error:', countError.message);
    return NextResponse.json({ error: 'Failed to count sessions' }, { status: 500 });
  }

  const total = count || 0;

  // 查当前页数据
  const offset = (page - 1) * pageSize;
  const { data: sessions, error } = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('user_id', user.id)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }

  const result = (sessions || []).map((row) => dbToSession(row) as ButterflySession);

  return NextResponse.json({
    sessions: result,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  });
});
