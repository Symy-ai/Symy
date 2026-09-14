import { AdminCtx, NextResponse, logger, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `as string | undefined` casts.
// Previously: `ctx.body.agent_id as string | undefined` silently accepted numbers/objects.
const schema = z.object({
  agent_id: z.string().min(1),
  model: z.string().min(1),
});

export async function handleUpdateAgentModel(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { agent_id, model } = result.data;
  try {
    await ctx.client.agents.update(agent_id, { model });
    return NextResponse.json({ success: true, agent_id, model });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    // 🔧 BUG-268 fix: 不暴露内部错误详情
    logger.error('[Admin Letta] Update failed:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
