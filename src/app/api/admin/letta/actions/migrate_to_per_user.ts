import { AdminCtx, NextResponse, logger } from './_shared';
import { createAdminClient } from '@/lib/supabase-admin';
import { createAgentForUser } from '@/lib/letta-agent-manager';

// 🔧 ARCH fix (Round 17 AUDIT-4 HIGH-3): 旧代码无 maxDuration / batch limit / 速率控制
//    → 1000 用户 × 30-60s/agent = 30000-60000s, Vercel 函数超时杀掉
//    → 部分用户迁移, 部分 orphan Letta agents (月费泄漏)
//    根因修复: maxDuration=300 + batch limit + sleep + cursor pagination

// Vercel Pro plan maxDuration=300s; each createAgentForUser takes 30-60s
// → max 5-8 agents per invocation. Use BATCH_SIZE=5 to stay safe.
const MAX_DURATION_SECONDS = 300;
const BATCH_SIZE = 5;
const SLEEP_BETWEEN_AGENTS_MS = 2000; // 2s — Letta API rate limit safety

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleMigrateToPerUser(_ctx: AdminCtx) {
  // 为所有没有 agent 的用户创建 agent
  const { supabase } = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Admin client not available' }, { status: 500 });
  }

  // 🔧 AUDIT-4 HIGH-3: 加 .limit(BATCH_SIZE) 防止单次调用处理过多用户
  // admin 需要多次调用此 endpoint 完成全量迁移 (cursor pagination via OFFSET)
  // 查找所有没有 letta_agent_id 的用户 (限制 BATCH_SIZE)
  const { data: profiles, error: queryError } = await supabase
    .from('profiles')
    .select('id, email, letta_agent_id')
    .is('letta_agent_id', null)
    .limit(BATCH_SIZE);

  if (queryError) {
    logger.error('[migrate_to_per_user] Query failed:', queryError.message);
    return NextResponse.json({ error: 'Failed to query profiles' }, { status: 500 });
  }

  const usersWithoutAgent = (profiles || []) as Array<{ id: string; email: string; letta_agent_id: null }>;
  const results: Array<{ userId: string; agentId: string | null; status: string }> = [];

  const startTime = Date.now();
  const maxDurationMs = MAX_DURATION_SECONDS * 1000;

  for (let i = 0; i < usersWithoutAgent.length; i++) {
    const profile = usersWithoutAgent[i];

    // 🔧 AUDIT-4 HIGH-3: 检查剩余时间, 不足 60s 时停止 (留 buffer 给响应)
    const elapsed = Date.now() - startTime;
    const remaining = maxDurationMs - elapsed;
    if (remaining < 60000) {
      logger.warn(`[migrate_to_per_user] Time budget exhausted (${elapsed}ms elapsed), stopping early. ${usersWithoutAgent.length - i} users remaining.`);
      results.push({
        userId: profile.id,
        agentId: null,
        status: 'skipped_time_budget',
      });
      break;
    }

    try {
      const agentId = await createAgentForUser(profile.id, profile.email);
      results.push({
        userId: profile.id,
        agentId,
        status: agentId ? 'created' : 'failed',
      });
    } catch (err) {
      logger.error(`[migrate_to_per_user] Failed for user ${profile.id}:`, err instanceof Error ? err.message : String(err));
      results.push({
        userId: profile.id,
        agentId: null,
        status: 'error',
      });
    }

    // 🔧 AUDIT-4 HIGH-3: agent 之间 sleep 2s, 避免 Letta API rate limit
    if (i < usersWithoutAgent.length - 1) {
      await sleep(SLEEP_BETWEEN_AGENTS_MS);
    }
  }

  const migrated = results.filter(r => r.status === 'created').length;
  const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped_time_budget').length;

  logger.info(`[migrate_to_per_user] Batch done: ${migrated} created, ${failed} failed, ${skipped} skipped (time budget)`);

  return NextResponse.json({
    success: true,
    migrated,
    failed,
    skipped,
    total: usersWithoutAgent.length,
    batchSize: BATCH_SIZE,
    maxDurationSeconds: MAX_DURATION_SECONDS,
    note: skipped > 0
      ? `Time budget exhausted. ${skipped} users skipped. Call this endpoint again to continue migration.`
      : undefined,
    results,
  });
}
