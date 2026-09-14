import { AdminCtx, NextResponse } from './_shared';
import { listAllUserAgents } from '@/lib/letta-agent-admin';

export async function handleListUserAgents( _ctx: AdminCtx) {
  const userAgents = await listAllUserAgents();
  return NextResponse.json({
    success: true,
    agents: userAgents,
    total: userAgents.length,
  });
}
