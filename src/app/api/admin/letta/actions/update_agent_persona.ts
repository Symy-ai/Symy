/**
 * 🐘 update_agent_persona — 存量 agent 人设迁移 (镜子 → 绿色环保小象, 2026-09-05)
 *
 * 用最新的三件套刷新指定 agent (省略 agent_id 时刷新全部存量 agent):
 *   1. system prompt  — doc/AI_Prompt.md (小象宪法)
 *   2. persona block  — SYMY_PERSONA_BLOCK (src/lib/symy-persona.ts, SSOT)
 *   3. symy_tool_rules block — SYMY_TOOL_RULES_BLOCK (V4, 绿色规则 + 工具机制)
 *
 * 模式照抄 update_system_prompt.ts (遍历 profiles) + update_memory_block.ts (zod 校验)。
 * coordinator 之后用此 action 刷存量:
 *   POST /api/admin/letta  { "action": "update_agent_persona" }                 → 全部
 *   POST /api/admin/letta  { "action": "update_agent_persona", "agent_id": … }  → 单个
 *
 * 幂等: 全部执行完返回 updated/failed 计数; block 不存在则创建 (老 agent 可能没有)。
 */

import { AdminCtx, NextResponse, logger, lettaAPI, validateActionBody } from './_shared';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '@/lib/supabase-admin';
import { validateAgentId } from '@/lib/letta-agent-validation';
import { SYMY_PERSONA_BLOCK } from '@/lib/symy-persona';
import { SYMY_TOOL_RULES_BLOCK } from '@/lib/letta-agent-tools';

const schema = z.object({
  agent_id: z.string().optional(),
  update_system: z.boolean().optional(),
});

/** 读取 AI_Prompt.md (与 update_system_prompt.ts 相同, 直接读文件避免牵出重依赖链) */
function readSystemPromptFile(): string {
  const promptPath = join(process.cwd(), 'doc', 'AI_Prompt.md');
  return readFileSync(promptPath, 'utf-8');
}

/** upsert 一个 memory block (存在则 PATCH, 不存在则 POST 创建) */
async function upsertBlock(agentId: string, label: string, value: string, limit: number): Promise<void> {
  const listResp = await lettaAPI(`/agents/${agentId}/memory-blocks`);
  if (!listResp.ok) throw new Error(`list blocks HTTP ${listResp.status}`);
  const blocks = (await listResp.json()) as Array<{ label?: string }>;
  const exists = blocks.some((b) => b.label === label);

  if (exists) {
    const patchResp = await lettaAPI(`/agents/${agentId}/memory-blocks/${label}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    if (!patchResp.ok) throw new Error(`patch ${label} HTTP ${patchResp.status}`);
  } else {
    const postResp = await lettaAPI(`/agents/${agentId}/memory-blocks`, {
      method: 'POST',
      body: JSON.stringify({ label, value, limit }),
    });
    if (!postResp.ok) throw new Error(`create ${label} HTTP ${postResp.status}`);
  }
}

async function updateOneAgent(ctx: AdminCtx, agentId: string, systemPrompt: string, updateSystem: boolean): Promise<void> {
  if (updateSystem) {
    // system prompt 更新 (与 update_system_prompt.ts 相同的 typed SDK 调用)
    await ctx.client.agents.update(agentId, { system: systemPrompt });
  }
  await upsertBlock(agentId, 'persona', SYMY_PERSONA_BLOCK, 5000);
  await upsertBlock(agentId, 'symy_tool_rules', SYMY_TOOL_RULES_BLOCK, 2000);
}

export async function handleUpdateAgentPersona(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { agent_id, update_system: updateSystem = true } = result.data;

  let systemPrompt: string;
  try {
    systemPrompt = readSystemPromptFile();
  } catch {
    // safe to ignore: error is surfaced to the admin caller via the 500 response below
    return NextResponse.json({ error: 'System prompt file not found' }, { status: 500 });
  }

  // 单 agent 模式 — 校验 agentId 格式后只刷这一个
  if (agent_id) {
    if (!validateAgentId(agent_id)) {
      return NextResponse.json({ error: 'Invalid agent_id format' }, { status: 400 });
    }
    try {
      await updateOneAgent(ctx, agent_id, systemPrompt, updateSystem);
      return NextResponse.json({
        success: true,
        message: `Agent ${agent_id} persona updated (mirror → green elephant)`,
        updated: 1,
        failed: 0,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[update_agent_persona] Failed for ${agent_id}:`, errMsg);
      return NextResponse.json({ error: `Failed to update agent persona: ${errMsg}` }, { status: 500 });
    }
  }

  // 全量模式 — 遍历所有绑定了 agent 的 profiles (照抄 update_system_prompt.ts)
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
      await updateOneAgent(ctx, agentId, systemPrompt, updateSystem);
      updated++;
    } catch (err) {
      logger.warn(`[update_agent_persona] Failed for ${agentId}:`, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Updated persona (mirror → green elephant) for ${updated}/${agents.length} agents (${failed} failed)`,
    updated,
    failed,
    total: agents.length,
    personaVersion: 'green-elephant-2026-09-05',
    toolRulesVersion: 'SYMY_TOOL_RULES_V4',
  });
}
