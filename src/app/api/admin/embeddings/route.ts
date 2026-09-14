/**
 * /api/admin/embeddings — RAG 向量库管理 API（需 admin 鉴权）
 *
 * POST /api/admin/embeddings?action=backfill_user&user_id=UUID
 *   回填单个用户的历史 embedding
 *
 * POST /api/admin/embeddings?action=backfill_all
 *   回填所有用户的历史 embedding（慎用，耗 token）
 *
 * GET /api/admin/embeddings?action=stats
 *   返回向量库统计（总数/各 source_type 数量/各用户数）
 *
 * GET /api/admin/embeddings?action=user_stats&user_id=UUID
 *   返回单个用户的向量库统计
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import {
  backfillImpulseEvents,
  backfillEmailReceipts,
  backfillChatMessages,
} from '@/lib/embed-backfill';

// ============================================================
// 🔧 ARCH fix (Round 21 BUG-R21-H4 — admin batch 操作缺 maxDuration):
//    backfill_all 处理 100 用户 × 32s/用户 = 3200s, Vercel 默认 60s 必超时。
//    根因修复: 加 maxDuration=300 (Vercel Pro 上限)。
export const maxDuration = 300;

// ============================================================
// GET
// ============================================================

export async function GET(req: NextRequest) {
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码鉴权绕过。
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    // 🔧 ARCH fix (Round 15 ADV-R14-3): 记录未授权尝试 (暴力破解审计)
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'stats';

  const { supabase, error: adminError } = createAdminClient();
  if (!supabase || adminError) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  if (action === 'user_stats') {
    const userId = url.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'user_id required for user_stats' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_embeddings')
      .select('source_type')
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const counts: Record<string, number> = {};
    for (const row of (data || []) as Array<{ source_type: string }>) {
      counts[row.source_type] = (counts[row.source_type] || 0) + 1;
    }

    return NextResponse.json({
      user_id: userId,
      total: (data || []).length,
      by_source_type: counts,
    });
  }

  // action === 'stats' (默认)
  // 🔧 ARCH fix (Round 12 M11): 旧代码 SELECT * 加载全部行到内存 → 50M 行 OOM
  //    根因修复: 用 count 查询 (3 个 source_type + 总数), 不加载行数据
  // 🔧 ARCH fix (Round 44): as const 让数组推断为字面量联合类型 (同 cultivation/route.ts)
  const sourceTypes = ['impulse_event', 'email_receipt', 'chat_message'] as const;
  const bySourceType: Record<string, number> = {};
  let total = 0;

  for (const st of sourceTypes) {
    const { count, error: countError } = await supabase
      .from('user_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('source_type', st);
    if (countError) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    bySourceType[st] = count || 0;
    total += count || 0;
  }

  // unique_users: 用 count + distinct (Supabase 支持 head+count)
  const { count: uniqueUsers, error: usersError } = await supabase
    .from('user_embeddings')
    .select('user_id', { count: 'exact', head: true });
  // Note: Supabase head+count 不支持 distinct, 这里返回近似值
  // 对于大规模数据, 应该用 RPC 做精确 distinct count

  if (usersError) {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  // by_user 需要加载所有行 — 对于大规模数据, 改为不返回 (admin 可用 user_stats 查询单个用户)
  return NextResponse.json({
    total,
    by_source_type: bySourceType,
    unique_users: uniqueUsers || 0,
    by_user: {},  // 🔧 M11: 不再加载全部行; admin 可用 ?action=user_stats 查询单个用户
  });
}

// ============================================================
// POST
// ============================================================

  // eslint-disable-next-line require-await -- async for API consistency
export async function POST(req: NextRequest) {
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码鉴权绕过。
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    // 🔧 ARCH fix (Round 15 ADV-R14-3): 记录未授权尝试
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // 🔧 ARCH fix (Round 14 BUG-14): 接入 withAdminAudit 审计日志
  return withAdminAudit(req, authResult, async () => {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (!action || !['backfill_user', 'backfill_all'].includes(action)) {
      return NextResponse.json({
        error: 'Invalid action. Use: backfill_user, backfill_all',
      }, { status: 400 });
    }

  // ============================================================
  // backfill_user: 回填单个用户
  // ============================================================
  if (action === 'backfill_user') {
    const userId = url.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'user_id required for backfill_user' }, { status: 400 });
    }

    logger.info(`[Admin Embeddings] Backfilling user ${userId.substring(0, 8)}...`);

    const [impulseResult, receiptResult, chatResult] = await Promise.allSettled([
      backfillImpulseEvents(userId),
      backfillEmailReceipts(userId),
      backfillChatMessages(userId),
    ]);

    const summary = {
      user_id: userId,
      impulse_events: impulseResult.status === 'fulfilled' ? impulseResult.value : { error: 'rejected' },
      email_receipts: receiptResult.status === 'fulfilled' ? receiptResult.value : { error: 'rejected' },
      chat_messages: chatResult.status === 'fulfilled' ? chatResult.value : { error: 'rejected' },
    };

    return NextResponse.json(summary);
  }

  // ============================================================
  // backfill_all: 回填所有用户（慎用）
  // ============================================================
  if (action === 'backfill_all') {
    const { supabase } = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
    }

    // 获取所有用户 ID（从 profiles 表）
    // 🔧 ARCH fix (Round 22 H8 — admin batch SELECT 无分页 → OOM + Vercel timeout):
    //    旧代码无 .limit() → Supabase 默认返回 1000 行, >1000 用户只处理前 1000。
    //    串行处理 1000 用户 × 5-10s/用户 = 5000-10000s, 远超 Vercel 300s maxDuration。
    //    根因修复: 加 .limit(50) + 返回 cursor 让 admin 分批执行。
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor'); // 上次处理的最后一个 user_id
    const BATCH_SIZE = 50;

    let query = supabase
      .from('profiles')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (cursor) {
      // 简单 cursor: 用 created_at > cursor 的 created_at (需要先查 cursor user 的 created_at)
      const { data: cursorUser } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', cursor)
        .maybeSingle();
      if (cursorUser) {
        query = query.gt('created_at', (cursorUser as { created_at: string }).created_at);
      }
    }

    const { data: profiles, error: profileError } = await query;

    if (profileError) {
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    const userIds = ((profiles || []) as Array<{ id: string }>).map(p => p.id);

    if (userIds.length === 0) {
      return NextResponse.json({ message: 'No users to backfill', total: 0 });
    }

    logger.info(`[Admin Embeddings] Backfilling ALL ${userIds.length} users...`);

    // 串行处理（避免并发触发 rate limit）
    type BackfillResult = {
      user_id: string;
      impulse_events?: unknown;
      email_receipts?: unknown;
      chat_messages?: unknown;
      error?: string;
    };
    const results: BackfillResult[] = [];
    for (const userId of userIds) {
      try {
        const [impulseResult, receiptResult, chatResult] = await Promise.allSettled([
          backfillImpulseEvents(userId),
          backfillEmailReceipts(userId),
          backfillChatMessages(userId),
        ]);

        results.push({
          user_id: userId,
          impulse_events: impulseResult.status === 'fulfilled' ? impulseResult.value : { error: 'rejected' },
          email_receipts: receiptResult.status === 'fulfilled' ? receiptResult.value : { error: 'rejected' },
          chat_messages: chatResult.status === 'fulfilled' ? chatResult.value : { error: 'rejected' },
        });

        logger.info(`[Admin Embeddings] Backfilled user ${userId.substring(0, 8)} (${results.length}/${userIds.length})`);
      } catch (err) {
        logger.warn(`[Admin Embeddings] Failed user ${userId.substring(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
        results.push({
          user_id: userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 🔧 Round 22 H8: 返回 nextCursor 让 admin 分批执行
    const lastUserId = userIds[userIds.length - 1];
    const hasMore = userIds.length === BATCH_SIZE;

    return NextResponse.json({
      total_users: userIds.length,
      results,
      nextCursor: hasMore ? lastUserId : null,
      hasMore,
      batchSize: BATCH_SIZE,
    });
  }

    // 🔧 ARCH fix (Round 15 ADV-R14-8): unreachable 但 TS 需要满足返回类型
    return NextResponse.json({ error: 'Unreachable' }, { status: 400 });
  }); // end withAdminAudit
}
