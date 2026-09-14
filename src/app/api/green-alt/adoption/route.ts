/**
 * Green Alt Adoption API — 绿色替代采纳闭环 (batch45-a)
 *
 * POST /api/green-alt/adoption — 记录一次"我采纳了绿色替代建议"
 * GET  /api/green-alt/adoption — 聚合: 本季总次数 + 按分类分布 (wear/home/beauty/other)
 *
 * 零 DDL 红线: 复用 health_events 表 (守护台账), event_type 用现有
 * 'mindful_recovery' + metadata.kind='green_alt_adoption' 标记,
 * trigger_id 前缀 'green-alt-adoption:' 供 GET 过滤。不新增枚举/表/列。
 *
 * 副作用红线: 采纳确认是客户端可触发的动作, 走 createHealthEvent 会给
 * mindful_recovery 发 vitality/token/impulse_shield 徽章 (Round 17 审计
 * 禁止的自我奖励洞)。因此这里直写审计行: vitality_change=0, token_change=0,
 * 不动 buddy_state — 纯记录, 荣誉面只有 profile 的次数。
 * est_saved 只入 metadata 供服务端聚合 (weekly report / Letta 上下文),
 * 金额永不进任何 UI/分享面。
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { parseBody } from '@/lib/parse-body';
import { createAdminClient } from '@/lib/supabase-admin';
import { isKnownGreenAltEntry, greenAltCategoryOf, type GreenAltCategory } from '@/lib/green-alt-category';
import { logger } from '@/lib/logger';

const TRIGGER_ID_PREFIX = 'green-alt-adoption:';

/** 本季 (自然季度) 起点ISO串 — GET 聚合口径"本季采纳" */
export function currentQuarterStart(now: Date = new Date()): string {
  const month = now.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)).toISOString();
}

function makeTriggerId(entryId: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${TRIGGER_ID_PREFIX}${entryId}:${day}`;
}

// ============================================================
// POST: 记录一次采纳 (同词条同日幂等)
// ============================================================
export const POST = withAuth(async ({ user, request }) => {
  const body = await parseBody<{ entryId?: string; estSaved?: number }>(request);
  const { entryId, estSaved } = body;

  if (!entryId || typeof entryId !== 'string' || !isKnownGreenAltEntry(entryId)) {
    return NextResponse.json({ error: 'Invalid entryId' }, { status: 400 });
  }

  // estSaved: 可选预估节省 (内部字段), 非有限数/负数防御为 0, 上限 10 万防 DoS 级脏数据
  // 当前客户端 (green-alt-card) 不发送此字段, 落库恒 0 — 链路预留 weekly report 注入
  const saved = Number(estSaved);
  const estSavedClamped = Number.isFinite(saved) ? Math.min(Math.max(saved, 0), 100000) : 0;

  const triggerId = makeTriggerId(entryId);

  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.warn('[green-alt-adoption] no admin client:', adminError);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
  }

  // 服务端幂等: 同词条同日已记 → 不重复落库, 静默成功
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
    description: 'Green alternative adoption',
    metadata: {
      kind: 'green_alt_adoption',
      entryId,
      estSaved: estSavedClamped,
    },
  });

  if (insertError) {
    logger.warn('[green-alt-adoption] insert failed:', insertError.message);
    return NextResponse.json({ error: 'Failed to record adoption' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});

// ============================================================
// GET: 本季聚合 — total (次数) + byCategory (wear/home/other)
// 金额 (estSaved) 只在服务端聚合为 savedEstimate, 前端不消费
// ============================================================
export const GET = withAuth(async ({ user }) => {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.warn('[green-alt-adoption] no admin client:', adminError);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('health_events')
    .select('metadata')
    .eq('user_id', user.id)
    .eq('event_type', 'mindful_recovery')
    .like('trigger_id', `${TRIGGER_ID_PREFIX}%`)
    .gte('created_at', currentQuarterStart());

  if (error) {
    logger.warn('[green-alt-adoption] GET failed:', error.message);
    return NextResponse.json({ error: 'Failed to load adoptions' }, { status: 500 });
  }

  let total = 0;
  let savedEstimate = 0;
  const byCategory: Record<GreenAltCategory, number> = { wear: 0, home: 0, beauty: 0, electronics: 0, food: 0, apparel: 0, household: 0, subscription: 0, travel: 0, parenting: 0, sports: 0, gifting: 0, furniture: 0, pets: 0, garden: 0, office: 0, 'digital-content': 0, 'health-care': 0, 'repair-care': 0, celebration: 0, 'pet-first-care': 0, other: 0 };

  for (const row of data || []) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (!meta || meta.kind !== 'green_alt_adoption') continue;
    if (typeof meta.entryId !== 'string') continue;
    total += 1;
    byCategory[greenAltCategoryOf(meta.entryId)] += 1;
    const saved = Number(meta.estSaved);
    if (Number.isFinite(saved) && saved > 0) savedEstimate += saved;
  }

  return NextResponse.json({ total, byCategory, savedEstimate });
});
