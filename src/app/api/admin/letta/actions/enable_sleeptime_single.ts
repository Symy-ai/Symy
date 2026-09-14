import { AdminCtx, NextResponse, validateActionBody } from './_shared';
import { enableSleeptimeForAgent } from '@/lib/letta-agent-manager';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `as string | undefined` cast.
const schema = z.object({
  agent_id: z.string().min(1),
});

export async function handleEnableSleeptimeSingle(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { agent_id } = result.data;
  const success = await enableSleeptimeForAgent(agent_id);
  return NextResponse.json({ success, agent_id });
}
