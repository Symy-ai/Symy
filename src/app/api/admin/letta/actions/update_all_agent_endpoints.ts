/**
 * Handler: update_all_agent_endpoints — 批量更新所有 agent 的 model_endpoint
 * 当 provider base_url 变更后，已有 agent 的 llm_config.model_endpoint 不会自动更新，
 * 需要手动批量更新。
 */

import { AdminCtx, lettaAPI, NextResponse, logger, getMcpServerUrl, validateActionBody } from './_shared';
import { listAllUserAgents } from '@/lib/letta-agent-admin';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `(ctx.body.endpoint as string) || ...`.
const schema = z.object({
  endpoint: z.string().optional(),
});

export async function handleUpdateAllAgentEndpoints(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const newEndpoint = result.data.endpoint || `${getMcpServerUrl()}/api/v1`;

  logger.info(`[Admin] Updating all agent endpoints to: ${newEndpoint}`);

  const agents = await listAllUserAgents();
  const results: Array<{ agentId: string; success: boolean; error?: string }> = [];

  for (const agent of agents) {
    try {
      // 用 Letta REST API PATCH 更新 agent 的 model_endpoint
      // 🔧 Bug A fix: llm_config 已弃用，改用 model_endpoint_type + model_endpoint
      const resp = await lettaAPI(`/agents/${agent.agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          model_endpoint: newEndpoint,
          model_endpoint_type: 'openai',
        }),
      });

      if (resp.ok) {
        results.push({ agentId: agent.agentId, success: true });
        logger.info(`[Admin] Updated endpoint for agent ${agent.agentId}`);
      } else {
        const errorBody = await resp.text().catch(() => '');
        results.push({ agentId: agent.agentId, success: false, error: errorBody.substring(0, 200) });
        logger.warn(`[Admin] Failed to update endpoint for agent ${agent.agentId}: ${errorBody.substring(0, 200)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ agentId: agent.agentId, success: false, error: msg.substring(0, 200) });
      logger.warn(`[Admin] Exception updating endpoint for agent ${agent.agentId}: ${msg}`);
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.length - succeeded;

  return NextResponse.json({
    success: true,
    updated: succeeded,
    failed,
    total: results.length,
    newEndpoint,
    results,
  });
}
