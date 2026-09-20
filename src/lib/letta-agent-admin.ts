/**
 * Letta Agent Admin Functions — Extracted from letta-agent-manager.ts
 *
 * 🔧 ARCH fix (2026-07-21): Extracted admin functions from letta-agent-manager.ts (896 lines)
 *    to reduce file size and improve code organization.
 *
 * These functions are only used by admin routes (admin/letta/*) and don't need
 * to be in the main letta-agent-manager.ts file.
 */

import 'server-only'; // 🔧 ARCH fix: this file uses createAdminClient (admin service) — must be server-only
import { createAdminClient } from '@/lib/supabase-admin';
import { getLettaClient, getUserAgentId, readSystemPrompt, LETTA_API_KEY } from './letta-agent-manager';
import { logger } from '@/lib/logger';

/**
 * Enable sleeptime for all user agents (batch operation)
 */
export async function enableSleeptimeForAllAgents(): Promise<{ updated: number; failed: number; total: number }> {
  const { supabase } = createAdminClient();
  if (!supabase) return { updated: 0, failed: 0, total: 0 };

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, letta_agent_id')
    .not('letta_agent_id', 'is', null)
    .limit(500);

  const usersWithAgents = (profiles || []) as Array<{ id: string; letta_agent_id: string }>;
  let updated = 0;
  let failed = 0;

  for (const profile of usersWithAgents) {
    try {
      const client = getLettaClient();
      await client.agents.update(profile.letta_agent_id, { enable_sleeptime: true } as Record<string, unknown>);
      updated++;
    } catch (err) {
      failed++;
      logger.warn(`[Letta Agent Admin] Failed to enable sleeptime for agent ${profile.letta_agent_id}:`, err);
    }
  }

  return { updated, failed, total: usersWithAgents.length };
}

/**
 * Update a single user's agent system prompt
 */
export async function updateUserAgentPrompt(userId: string): Promise<boolean> {
  const agentId = await getUserAgentId(userId);
  if (!agentId) return false;

  try {
    const client = getLettaClient();
    const systemPrompt = readSystemPrompt();
    await client.agents.update(agentId, {
      system: systemPrompt,
    } as Record<string, unknown>);
    return true;
  } catch (err) {
    // safe to ignore: returns false to caller; error is logged for debugging
    logger.error(`[Letta Agent Admin] Failed to update prompt for agent ${agentId}:`, err);
    return false;
  }
}

/**
 * Batch update all user agents' LLM model
 */
export async function updateAllUserAgentModels(newModel: string): Promise<{ updated: number; failed: number; total: number; truncated?: boolean }> {
  const { supabase } = createAdminClient();
  if (!supabase) return { updated: 0, failed: 0, total: 0 };

  const BATCH_LIMIT = 500;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, letta_agent_id')
    .not('letta_agent_id', 'is', null)
    .limit(BATCH_LIMIT);

  const usersWithAgents = (profiles || []) as Array<{ id: string; letta_agent_id: string }>;
  const truncated = usersWithAgents.length === BATCH_LIMIT;
  if (truncated) {
    logger.warn(`[Letta Agent Admin] updateAllUserAgentModels hit ${BATCH_LIMIT}-agent limit. ` +
      `If you have more than ${BATCH_LIMIT} agents, some were NOT updated. Run the action again or implement pagination.`);
  }
  let updated = 0;
  let failed = 0;

  const client = getLettaClient();

  for (const profile of usersWithAgents) {
    try {
      await client.agents.update(profile.letta_agent_id, { model: newModel });
      updated++;
      logger.info(`[Letta Agent Admin] Model updated for agent ${profile.letta_agent_id} → ${newModel}`);
    } catch (err) {
      failed++;
      logger.warn(`[Letta Agent Admin] Failed to update model for agent ${profile.letta_agent_id}:`, err);
    }
  }

  if (failed > 0 && updated === 0 && usersWithAgents.length > 0) {
    logger.error(`[Letta Agent Admin] updateAllUserAgentModels: ALL ${failed} agents failed to update to model "${newModel}". ` +
      `This likely indicates a systemic issue (e.g. invalid model handle, Letta API outage, or SDK incompatibility).`);
  }

  return { updated, failed, total: usersWithAgents.length, ...(truncated ? { truncated: true } : {}) };
}

/**
 * Batch update all user agents' system prompt
 */
export async function updateAllUserAgentPrompts(): Promise<{ updated: number; failed: number; total: number }> {
  const { supabase } = createAdminClient();
  if (!supabase) return { updated: 0, failed: 0, total: 0 };

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, letta_agent_id')
    .not('letta_agent_id', 'is', null)
    .limit(500);

  const usersWithAgents = (profiles || []) as Array<{ id: string; letta_agent_id: string }>;
  let updated = 0;
  let failed = 0;

  const client = getLettaClient();
  const systemPrompt = readSystemPrompt();

  for (const profile of usersWithAgents) {
    try {
      await client.agents.update(profile.letta_agent_id, { system: systemPrompt });
      updated++;
    } catch (err) {
      failed++;
      logger.warn(`[Letta Agent Admin] Failed to update prompt for agent ${profile.letta_agent_id}:`, err);
    }
  }

  return { updated, failed, total: usersWithAgents.length };
}

/**
 * List all user agents
 */
export async function listAllUserAgents(): Promise<Array<{
  userId: string;
  agentId: string;
  agentName?: string;
}>> {
  const { supabase } = createAdminClient();
  if (!supabase) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, letta_agent_id, email')
    .not('letta_agent_id', 'is', null)
    .limit(500);

  return (profiles || []).map((p: Record<string, unknown>) => ({
    userId: p.id as string,
    agentId: p.letta_agent_id as string,
    agentName: `symy-user-${p.id as string}`,
  }));
}

/**
 * Sync user's hourly rate to agent's human memory block
 */
export async function syncHourlyRateToAgent(
  userId: string,
  hourlyRate: number,
): Promise<boolean> {
  if (typeof hourlyRate !== 'number' || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
    logger.warn(`[Letta Agent Admin] Invalid hourly rate, skipping sync: ${String(hourlyRate)}`);
    return false;
  }

  if (!LETTA_API_KEY) {
    logger.warn('[Letta Agent Admin] LETTA_API_KEY not configured, skipping hourly rate sync');
    return false;
  }

  const agentId = await getUserAgentId(userId);
  if (!agentId) {
    logger.warn(`[Letta Agent Admin] No agent for user ${userId}, skipping hourly rate sync`);
    return false;
  }

  try {
    const client = getLettaClient();

    let currentHumanBlock = '';
    try {
      const humanBlock = await client.agents.blocks.retrieve('human', { agent_id: agentId });
      currentHumanBlock = humanBlock.value || '';
    } catch (retrieveErr) {
      const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
      logger.warn(`[Letta Agent Admin] Failed to retrieve human block for agent ${agentId}:`, msg);
    }

    const rateLine = `Hourly rate: $${hourlyRate}/hr`;
    let newHumanBlock: string;
    const hourlyRatePattern = /Hourly rate: \$[^\n]*\/hr/g;
    const replacedBlock = currentHumanBlock.replace(hourlyRatePattern, rateLine);
    if (replacedBlock !== currentHumanBlock) {
      newHumanBlock = replacedBlock;
    } else if (currentHumanBlock.trim()) {
      newHumanBlock = `${currentHumanBlock.trim()}\n${rateLine}`;
    } else {
      newHumanBlock = rateLine;
    }

    await client.agents.blocks.update('human', {
      agent_id: agentId,
      value: newHumanBlock,
    });

    logger.info(`[Letta Agent Admin] Synced hourly rate $${hourlyRate}/hr to agent ${agentId}`);
    return true;
  } catch (err) {
    // safe to ignore: returns false to caller; error is logged for debugging
    logger.error(`[Letta Agent Admin] Failed to sync hourly rate to agent ${agentId}:`, err);
    return false;
  }
}
