import { AdminCtx, NextResponse, logger, validateActionBody } from './_shared';
import { createAdminClient } from '@/lib/supabase-admin';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `as string | undefined` cast.
const schema = z.object({
  agent_id: z.string().min(1),
});

export async function handleDeleteAgent(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const agentIdToDelete = result.data.agent_id;

  try {
    await ctx.client.agents.delete(agentIdToDelete);

    // 🔧 ARCH fix (Round 15 audit H4 — delete_agent 留下孤儿 profiles.letta_agent_id):
    //    旧代码只删 Letta agent, 不清 profiles.letta_agent_id → 用户下次 chat 调 getUserAgentId
    //    拿到 stale ID → sendToAgent 404 → 用户永久无法聊天。
    //    根因修复: 删 agent 后, UPDATE profiles SET letta_agent_id = NULL WHERE letta_agent_id = deleted。
    //    这样下次 chat 会触发 getOrCreateAgentId 重新创建 agent。
    const { supabase, error: adminError } = createAdminClient();
    if (supabase && !adminError) {
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ letta_agent_id: null })
        .eq('letta_agent_id', agentIdToDelete);
      if (profileUpdateError) {
        // 非致命 — agent 已删, profile 残留 stale ID 会在下次 chat 时被 getUserAgentId 检测到 (404) 并重建
        logger.warn('[Admin Letta] Failed to clear profiles.letta_agent_id after agent deletion:', profileUpdateError.message);
      } else {
        logger.info(`[Admin Letta] Cleared profiles.letta_agent_id for deleted agent ${agentIdToDelete}`);
      }
    }

    return NextResponse.json({ success: true, deleted: agentIdToDelete });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    // 🔧 BUG-268 fix: 不暴露内部错误详情
    logger.error('[Admin Letta] Delete failed:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
