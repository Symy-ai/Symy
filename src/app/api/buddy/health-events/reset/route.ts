/**
 * Guard Data Reset API (batch59-b)
 *
 * POST /api/buddy/health-events/reset — 按轨道清除守护数据 ("轻装上阵")
 *
 * 零 DDL: 只删 health_events 行, 不改 schema。轨道:
 *   - 'challenge': event_type='challenge_completed' (拦截挑战记录)
 *   - 'alt_reuse': event_type='mindful_recovery' 且 metadata.kind ∈
 *                  {green_alt_adoption, reuse_adoption} (替代与复用记录)
 *   - 'all': 上述全部
 *
 * 删除后写一条 manual_adjustment 对账行 (metadata.source='data_reset',
 * 59-a guard_sos 同款 client-safe 审计模式), 供回溯用户主动发起的重置。
 * 鉴权与 /api/buddy/health-events 同一 withAuth 通道。
 * 金额红线: 本 route 不读取/不返回任何 estSaved — 金额知情提醒在客户端
 * 纯 lib 层 (planGuardDataResetPrivateImpact) 完成。
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { parseBody } from '@/lib/parse-body';
import { logger } from '@/lib/logger';
import { GUARD_RESET_LANES, type GuardResetLane } from '@/lib/guard-data-reset';

const ALT_REUSE_KINDS = ['green_alt_adoption', 'reuse_adoption'] as const;

export const POST = withAuth(async ({ supabase, user, request }) => {
  const body = await parseBody<{ lane?: string }>(request);
  const lane = body?.lane;

  if (!lane || !GUARD_RESET_LANES.includes(lane as GuardResetLane)) {
    return NextResponse.json(
      { error: `Invalid lane: "${String(lane)}". Must be one of: ${GUARD_RESET_LANES.join(', ')}` },
      { status: 400 },
    );
  }

  const deletes: Array<Record<string, unknown>> = [];
  if (lane === 'challenge' || lane === 'all') {
    const { data, error } = await supabase
      .from('health_events')
      .delete()
      .select('id')
      .eq('user_id', user.id)
      .eq('event_type', 'challenge_completed');
    if (error) {
      logger.warn('[Health Events Reset] challenge delete error:', error.message);
      return NextResponse.json({ error: 'Failed to reset guard data' }, { status: 500 });
    }
    deletes.push(...(data || []));
  }

  if (lane === 'alt_reuse' || lane === 'all') {
    const { data, error } = await supabase
      .from('health_events')
      .delete()
      .select('id')
      .eq('user_id', user.id)
      .eq('event_type', 'mindful_recovery')
      .in('metadata->>kind', [...ALT_REUSE_KINDS]);
    if (error) {
      logger.warn('[Health Events Reset] alt_reuse delete error:', error.message);
      return NextResponse.json({ error: 'Failed to reset guard data' }, { status: 500 });
    }
    deletes.push(...(data || []));
  }

  // 对账行: 用户主动发起的重置留痕 (纯审计, 无 vitality 副作用)
  const { createHealthEvent } = await import('@/lib/health-impact');
  await createHealthEvent({
    userId: user.id,
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    description: 'guard data reset',
    metadata: { source: 'data_reset', lane, deletedCount: deletes.length },
  });

  logger.info(
    `[Health Events Reset] lane=${lane} deleted=${deletes.length} for user ${user.id.substring(0, 8)}`,
  );
  return NextResponse.json({ success: true, lane, deletedCount: deletes.length });
});
