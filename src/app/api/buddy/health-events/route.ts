/**
 * Health Events API
 *
 * GET    /api/buddy/health-events — Fetch recent health events for the user
 * POST   /api/buddy/health-events — Create a health event (used by frontend for passive recovery, etc.)
 * DELETE /api/buddy/health-events — Clear all health events for the user (mirror philosophy reset)
 *
 * Health events track vitality changes and make the core mechanic visible:
 * "Your companion's health is tied to your spending habits."
 *
 * 🔧 ARCH fix (Round 55 REVIEW-A-1 — withAuth 自动 merge cookies, 业务代码不需要调 mergeCookies)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { parseBody } from '@/lib/parse-body';
import { VALID_EVENT_TYPES, VALID_TRIGGER_SOURCES, type HealthEventType, type TriggerSource } from '@/lib/health-impact';
import { logger } from '@/lib/logger';

// ============================================================
// GET: Fetch recent health events
// ============================================================
export const GET = withAuth(async ({ supabase, user, request }) => {
  const { searchParams } = new URL(request.url);
  // 🔧 BUG-192 fix: 防止 parseInt 产生 NaN
  // 🔧 ARCH fix (Round 8 H5): 加 Math.max(1, ...) 防负 limit
  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 20, 100));
  const eventType = searchParams.get('event_type'); // optional filter
  const before = searchParams.get('before'); // optional created_at cursor

  let query = supabase
    .from('health_events')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (eventType) {
    // 🔧 Round 123 audit fix: eventType 是 string, DB 期望 event_type union
    //    修复: 用 as 类型断言 (zod 验证已在 route 层完成, 这里是安全转换)
    query = query.eq('event_type', eventType as 'impulse_damage' | 'impulse_confessed' | 'mindful_recovery' | 'refund_boost' | 'challenge_reward' | 'challenge_completed' | 'challenge_failed' | 'passive_recovery' | 'drain' | 'revive' | 'manual_adjustment' | 'butterfly_completed' | 'butterfly_chapter_viewed' | 'invitation_reward_failed');
  }

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    logger.warn('[Health Events] GET error:', error.message);
    // 🔧 BUG-193 fix: 数据库错误时返回 500 而非空数组，防止静默屏蔽故障
    return NextResponse.json({ error: 'Failed to fetch health events' }, { status: 500 });
  }

  // Convert snake_case to camelCase for frontend
  const events = (data || []).map((e: Record<string, unknown>) => ({
    id: e.id,
    eventType: e.event_type,
    vitalityChange: e.vitality_change,
    newVitality: e.new_vitality,
    tokenChange: e.token_change || 0,
    triggerSource: e.trigger_source,
    triggerId: e.trigger_id,
    description: e.description,
    metadata: e.metadata,
    createdAt: e.created_at,
  }));

  return NextResponse.json({ events });
});

// ============================================================
// POST: Create a health event (frontend-initiated)
// ============================================================
export const POST = withAuth(async ({ user, request }) => {
  const body = await parseBody<{
    eventType?: string;
    triggerSource?: string;
    description?: string;
    triggerId?: string;
    metadata?: Record<string, unknown>;
  }>(request);
  const { eventType, triggerSource, description, triggerId, metadata } = body;

  // 🔧 BUG-195 fix: 限制 metadata 大小，防止恶意大对象 DoS
  if (metadata && JSON.stringify(metadata).length > 4096) {
    return NextResponse.json({ error: 'Metadata too large (max 4KB)' }, { status: 400 });
  }

  // 🔧 ARCH fix (Round 8 M1): 限制 description 长度, 防 DoS / DB bloat
  if (description && typeof description === 'string' && description.length > 1000) {
    return NextResponse.json({ error: 'Description too long (max 1000 chars)' }, { status: 400 });
  }

  // BUG-93 fix: DO NOT accept vitalityOverride/tokenOverride from client requests.
  // These are internal-only fields used by MCP tools (server-side) to mark
  // audit-only events. Allowing clients to set these would let users give
  // themselves free vitality by POSTing { vitalityOverride: 100 }.
  // The overrides are intentionally excluded from destructuring above.

  if (!eventType || !triggerSource || !description) {
    return NextResponse.json(
      { error: 'Missing required fields: eventType, triggerSource, description' },
      { status: 400 }
    );
  }

  // Validate eventType against allowed values
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    return NextResponse.json(
      { error: `Invalid eventType: "${eventType}". Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // 🔧 ARCH fix (Round 17 audit C1 — health-events POST 允许客户端自我奖励):
  //    旧代码: 所有 VALID_EVENT_TYPES 都允许客户端 POST → 用户可发 refund_boost/impulse_damage/
  //    challenge_reward 等事件类型, 通过 metadata.amount 自行奖励 vitality/tokens/dream_funds。
  //    根因修复: 只允许客户端安全的 event types (manual_adjustment — 无 vitality 副作用),
  //    其他有副作用的 event types 只能由服务端 (MCP tools, email scan 等) 调用 createHealthEvent。
  // 🔧 ARCH fix (Round 17 adversarial review H1 — passive_recovery 仍可被滥用):
  //    旧修复允许 passive_recovery, 但它 awards vitality = Math.min(streak, 10)。
  //    用户可重复 POST passive_recovery (无 triggerId → 无 dedup) 把 vitality 从 0 刷到 100。
  //    根因修复: 只允许 manual_adjustment (vitalityChange=0, 纯审计)。
  const CLIENT_SAFE_EVENT_TYPES = ['manual_adjustment'] as const;
  if (!CLIENT_SAFE_EVENT_TYPES.includes(eventType as typeof CLIENT_SAFE_EVENT_TYPES[number])) {
    return NextResponse.json(
      { error: `Event type "${eventType}" is server-only. Client can only create: ${CLIENT_SAFE_EVENT_TYPES.join(', ')}` },
      { status: 403 },
    );
  }

  // Validate triggerSource against allowed values
  if (!VALID_TRIGGER_SOURCES.includes(triggerSource)) {
    return NextResponse.json(
      { error: `Invalid triggerSource: "${triggerSource}". Must be one of: ${VALID_TRIGGER_SOURCES.join(', ')}` },
      { status: 400 }
    );
  }

  // Use the server-side health impact utility
  const { createHealthEvent } = await import('@/lib/health-impact');

  const result = await createHealthEvent({
    userId: user.id,
    eventType: eventType as HealthEventType,
    triggerSource: triggerSource as TriggerSource,
    triggerId,
    description,
    metadata,
    // BUG-93 fix: No vitalityOverride/tokenOverride from client —
    // these are server-side only (used by MCP tools for audit-only events)
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Failed to create health event' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    eventId: result.eventId,
    vitalityChange: result.vitalityChange,
    newVitality: result.newVitality,
    tokenChange: result.tokenChange,
    newTokens: result.newTokens,
  });
});

// ============================================================
// DELETE: Clear all health events for the user
// 🔧 镜子哲学 reset: 用户想清空旧的历史记录 (旧的"工具哲学"文案)
// 只清 health_events 表, 不影响 buddy_state (vitality/tokens/level 不变)
// ============================================================
export const DELETE = withAuth(async ({ supabase, user }) => {
  try {
    const { error: deleteError } = await supabase
      .from('health_events')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      logger.warn('[Health Events] DELETE error:', deleteError.message);
      return NextResponse.json(
        { error: 'Failed to clear health events' },
        { status: 500 }
      );
    }

    logger.info(`[Health Events] Cleared all events for user ${user.id.substring(0, 8)}`);
    return NextResponse.json({ success: true, action: 'clear_all' });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Health Events] DELETE unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
