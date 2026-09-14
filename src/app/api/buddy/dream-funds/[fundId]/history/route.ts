/**
 * GET /api/buddy/dream-funds/[fundId]/history — Fetch fill history for a dream fund
 *
 * 🔧 PM-NEW-34 fix: Dream Fund 点击展开填充历史
 *    之前: 点击基金只能 Edit/Delete, 无法查看历史填充记录
 *    现在: 从 health_events 表查询 metadata.dreamFundId === fundId 的事件
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF with dynamic params support.
 *    Before: 81 lines with manual createAuthenticatedClient + mergeCookies
 *    After: ~50 lines, auth/cookie/error handled by withAuth
 *
 * 返回: { history: [{ id, amount, description, createdAt, eventType, triggerSource }] }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';

export const GET = withAuth<{ fundId: string }>(async ({ supabase, user, params }) => {
  const { fundId } = params;
  if (!fundId) {
    return NextResponse.json({ error: 'fundId is required' }, { status: 400 });
  }

  // 🔧 PM-NEW-34 fix: 查 health_events 表, 过滤 metadata.dreamFundId === fundId
  //    查 challenge_completed / challenge_reward / refund_boost 事件
  try {
    const { data, error: queryError } = await supabase
      .from('health_events')
      .select('id, event_type, description, metadata, created_at, trigger_source')
      .eq('user_id', user.id)
      .in('event_type', ['challenge_completed', 'challenge_reward', 'refund_boost'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (queryError) {
      logger.warn('[Dream Fund History] query error:', queryError.message);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    // 在 JS 层过滤 — metadata.dreamFundId === fundId
    //    (PostgREST 对 JSONB key 的过滤需要 metadata->>'dreamFundId', 但 fund_id 可能是 'df-1' 或 UUID)
    const fundEvents = (data || []).filter((e: Record<string, unknown>) => {
      const metadata = e.metadata as Record<string, unknown> | null;
      if (!metadata) return false;
      const eventFundId = metadata.dreamFundId as string || metadata.fund_id as string || metadata.fundId as string;
      return eventFundId === fundId;
    });

    // 转换为前端格式
    const history = fundEvents.map((e: Record<string, unknown>) => {
      const metadata = e.metadata as Record<string, unknown> | null;
      const amount = (metadata?.savedAmount as number) || (metadata?.amount as number) || (metadata?.refundAmount as number) || 0;
      return {
        id: e.id as string,
        amount,
        description: e.description as string,
        createdAt: e.created_at as string,
        eventType: e.event_type as string,
        triggerSource: e.trigger_source as string,
      };
    });

    return NextResponse.json({ history });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Dream Fund History] unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
