import { AdminCtx, NextResponse } from './_shared';
import { enableSleeptimeForAllAgents } from '@/lib/letta-agent-admin';

export async function handleEnableSleeptime( _ctx: AdminCtx) {
  const result = await enableSleeptimeForAllAgents();
  return NextResponse.json({
    success: true,
    ...result,
  });
}
