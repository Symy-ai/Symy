import { AdminCtx, NextResponse } from './_shared';
import { createAdminClient } from '@/lib/supabase-admin';

// 🔧 ARCH fix: 不再操作全局 agent, 改为遍历所有 per-user agents
export async function handleRecompile(ctx: AdminCtx) {
  const { supabase: adminSupabase } = createAdminClient();
  if (!adminSupabase) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('letta_agent_id')
    .not('letta_agent_id', 'is', null);

  const agents = ((profiles || []) as Array<{ letta_agent_id: string }>).map(p => p.letta_agent_id);
  let updated = 0;
  let failed = 0;

  for (const agentId of agents) {
    try {
      await ctx.client.agents.recompile(agentId);
      updated++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Recompiled ${updated}/${agents.length} agents (${failed} failed)`,
    updated,
    failed,
    total: agents.length,
  });
}
