import { AdminCtx, NextResponse, logger } from './_shared';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-admin';

export async function handleUpdateSystemPrompt(ctx: AdminCtx) {
  // 🔧 ARCH fix: 不再操作全局 agent, 改为遍历所有 per-user agents
  const promptPath = join(process.cwd(), 'doc', 'AI_Prompt.md');
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(promptPath, 'utf-8');
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return NextResponse.json({ error: 'System prompt file not found' }, { status: 500 });
  }

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
      await ctx.client.agents.update(agentId, { system: systemPrompt });
      updated++;
    } catch (err) {
      logger.warn(`[update_system_prompt] Failed for ${agentId}:`, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Updated ${updated}/${agents.length} agents (${failed} failed)`,
    updated,
    failed,
    total: agents.length,
    promptLength: systemPrompt.length,
  });
}
