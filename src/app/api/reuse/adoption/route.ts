import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { parseBody } from '@/lib/parse-body';
import { createAdminClient } from '@/lib/supabase-admin';
import { REUSE_CATEGORIES, type ReuseCategory } from '@/lib/reuse-categories';
import { logger } from '@/lib/logger';

/**
 * reuse/adoption — 复用采纳落账 (batch56-c)
 *
 * 与 /api/green-alt/adoption 同一款式, 给守护风格画像的"复用轨"真实数据源:
 * 零 DDL 红线: 复用 health_events 表 (守护台账), event_type 用现有
 * 'mindful_recovery' + metadata.kind='reuse_adoption' 标记,
 * trigger_id 前缀 'reuse-adoption:' + 类目 + 日 (同词条同日幂等)。
 * 审计行不动 buddy_state (vitality/token 零变化), 仅作画像聚合数据。
 */

const TRIGGER_ID_PREFIX = 'reuse-adoption:';
const ALLOWED_CATEGORY_IDS = new Set<string>(REUSE_CATEGORIES.map((c) => c.id));

export const dynamic = 'force-dynamic';

function makeTriggerId(categoryId: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${TRIGGER_ID_PREFIX}${categoryId}:${day}`;
}

function isKnownReuseCategory(value: unknown): value is ReuseCategory {
  return typeof value === 'string' && ALLOWED_CATEGORY_IDS.has(value);
}

export const POST = withAuth(async ({ user, request }) => {
  const body = await parseBody<{ categoryId?: string; estSaved?: number }>(request);
  const { categoryId, estSaved } = body;

  if (!isKnownReuseCategory(categoryId)) {
    return NextResponse.json({ error: 'Invalid categoryId' }, { status: 400 });
  }

  // estSaved: 可选预估节省 (内部字段, 只进 metadata 供聚合 tie-break/私享汇总), 防御为 0
  const saved = Number(estSaved);
  const estSavedClamped = Number.isFinite(saved) ? Math.min(Math.max(saved, 0), 100000) : 0;

  const triggerId = makeTriggerId(categoryId);

  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.warn('[reuse-adoption] no admin client:', adminError);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
  }

  // 服务端幂等: 同类目同日已记 → 不重复落库, 静默成功
  const { data: existing } = await supabase
    .from('health_events')
    .select('id')
    .eq('user_id', user.id)
    .eq('trigger_id', triggerId)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ success: true, deduplicated: true });
  }

  // 审计行不动 buddy_state, new_vitality 记当前值只为行形状完整
  const { data: bs } = await supabase
    .from('buddy_state')
    .select('vitality')
    .eq('user_id', user.id)
    .maybeSingle<{ vitality: number }>();
  const currentVitality = bs?.vitality ?? 0;

  const { error: insertError } = await supabase.from('health_events').insert({
    user_id: user.id,
    event_type: 'mindful_recovery',
    vitality_change: 0,
    new_vitality: currentVitality,
    token_change: 0,
    trigger_source: 'chat_mcp',
    trigger_id: triggerId,
    description: 'Reuse adoption',
    metadata: {
      kind: 'reuse_adoption',
      categoryId,
      estSaved: estSavedClamped,
    },
  });

  if (insertError) {
    logger.warn('[reuse-adoption] insert failed:', insertError.message);
    return NextResponse.json({ error: 'Failed to record adoption' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
