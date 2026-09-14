import { AdminCtx, NextResponse, logger, validateActionBody } from './_shared';
import { createAdminClient } from '@/lib/supabase-admin';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces destructuring + `as` casts.
// agent_id optional (mode A: single agent); add_default_initial_messages optional.
const schema = z.object({
  agent_id: z.string().optional(),
  add_default_initial_messages: z.boolean().optional().default(false),
});

/**
 * handleResetAgentMessages — 清空 per-user Letta agent 的所有对话消息历史
 *
 * 🔧 PM-NEW-2 fix (3rd re-fix): AI 仍说 "dedup'd" — 根因是 Letta agent 的对话历史
 * 中残留了之前的消息 (AI 学会了 "dedup" 这个词)。即使 system prompt 改了, AI 仍会
 * 从历史消息中模仿之前的回复风格。
 *
 * 这个 action 调用 letta SDK 的 agents.messages.reset() 清空所有消息历史, 让 AI
 * 从干净状态重新开始 (只用新 system prompt + memory blocks)。
 *
 * Body:
 *   - agent_id (optional): 单个 agent ID. 不传则重置所有 per-user agents
 *   - add_default_initial_messages (optional, default false): 是否加默认初始消息
 */
export async function handleResetAgentMessages(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { agent_id, add_default_initial_messages } = result.data;

  // 模式 A: 单个 agent
  if (agent_id) {
    try {
      await ctx.client.agents.messages.reset(agent_id, {
        add_default_initial_messages,
      });
      logger.info(`[reset_agent_messages] Reset successful for agent ${agent_id}`);
      return NextResponse.json({
        success: true,
        message: `Agent ${agent_id} messages reset`,
        agent_id,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[reset_agent_messages] Failed for agent ${agent_id}:`, errMsg);
      return NextResponse.json({ error: `Failed to reset: ${errMsg}` }, { status: 500 });
    }
  }

  // 模式 B: 所有 per-user agents
  const { supabase: adminSupabase } = createAdminClient();
  if (!adminSupabase) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('letta_agent_id')
    .not('letta_agent_id', 'is', null);

  const agents = ((profiles || []) as Array<{ letta_agent_id: string }>).map(p => p.letta_agent_id);
  let reset = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const id of agents) {
    try {
      await ctx.client.agents.messages.reset(id, {
        add_default_initial_messages,
      });
      reset++;
      logger.info(`[reset_agent_messages] Reset successful for agent ${id}`);
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      failures.push(`${id}: ${errMsg.slice(0, 100)}`);
      logger.warn(`[reset_agent_messages] Failed for agent ${id}:`, errMsg);
    }
  }

  return NextResponse.json({
    success: true,
    message: `Reset ${reset}/${agents.length} agents (${failed} failed)`,
    reset,
    failed,
    total: agents.length,
    failures: failures.slice(0, 5),  // 只返前 5 个错误详情
  });
}
