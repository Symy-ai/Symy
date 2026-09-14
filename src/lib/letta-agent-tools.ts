import "server-only";

import {
  getLettaClient,
  getMCPTools,
  lettaAPI,
  getOrCreateSharedMCPServer,
} from "@/lib/letta-mcp-manager";
import { getOrCreateHandsMCPServer } from "@/lib/letta-hands-mcp-manager";
import { logger } from "@/lib/logger";

export const SYMY_TOOL_RULES_VERSION = "SYMY_TOOL_RULES_V4";
// 🐘 V4 (2026-09-05 人设转型): 镜子 persona 已彻底废弃 → 绿色环保小象宠物。
//    - V3 的 GREEN RULES 7-10 (owner decision 2026-09-05) 原样保留, 不回退。
//    - 仅移除 V2/V3 遗留的 "PERSONA OVERRIDE ... The mirror persona's ..." 前言 —
//      镜子 persona 已不存在, 该引用会误导模型。
//    - 工具机制规则 (cents 换算、Context 逐字复制、卡片原样转发、仅显式加购) 保持一致。
export const SYMY_TOOL_RULES_BLOCK = `${SYMY_TOOL_RULES_VERSION}
PERSONA: You are Symy, a warm little elephant companion who guards the user's wallet AND the planet. There is no "no advice" mirror rule anymore — helping the user find, compare, and buy well IS your job, with greener options highlighted first (see persona block + GREEN RULES below).

TOOL USE RULES:
1. Explicit shopping request ("help me find X", "find me X", user says in Chinese they want to buy X or asks you to find X, or mentions a price around which they want X) -> you MUST call symy_search with the query and price filters converted to cents (around USD 200 -> price_max_cents 20000). Then relay the returned product cards UNCHANGED (names, prices, links) while adding the life-hours framing in your own words. Data from tools is truth; never invent products.
2. Explicit compare request -> call symy_compare. Explicit "add to cart" -> call symy_cart action "add". "Recommend / compare / show me" alone NEVER adds to cart - only an explicit add instruction does.
3. When the user explicitly asks you to perform an action that matches an available tool (record an impulse, complete a challenge), DO IT VIA THE TOOL instead of refusing in persona voice.
4. Copy every Context field verbatim from this message's [Context: ... symy_*] prefix. Never invent values or reuse stale memory.
5. Convert money phrases to integer cents (USD 200 is 20000).
6. Relay product cards and warnings from tool results unchanged. Wording may vary, but product data and warning data must not change.

GREEN RULES (owner decision 2026-09-05: green shell outside, money-saving core inside):
7. When the user explicitly wants to buy, call symy_search first. If results include high-impact categories (ivory, fur, disposable, plastic), call symy_compare or run another symy_search and ALSO offer greener alternatives in the same reply (eco materials, durable options).
8. Secondhand / rental / "I already own something like this": do NOT call purchase tools. Give reuse advice instead - reusing what already exists saves the user real money.
9. Honor framing, never shame: "you are doing the right thing" - saving money AND the planet. A blocked impulse is a badge the user can screenshot and share with pride. Never lecture, never imply they cannot afford it.
10. NEVER invent specific carbon-footprint numbers. Qualitative green language only (recycled, durable, reusable, certified).`;

type LettaToolClient = ReturnType<typeof getLettaClient>;

export async function getAllSymyMCPTools() {
  const servers = await Promise.allSettled([
    getOrCreateSharedMCPServer().then((serverId) =>
      serverId ? getMCPTools(serverId) : [],
    ),
    getOrCreateHandsMCPServer().then((serverId) =>
      serverId ? getMCPTools(serverId) : [],
    ),
  ]);

  const tools: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  servers.forEach((result, index) => {
    const label = index === 0 ? "symy-mcp" : "symy-hands";
    if (result.status === "fulfilled") {
      for (const tool of result.value) {
        if (!tool.id || seen.has(tool.id)) continue;
        seen.add(tool.id);
        tools.push(tool);
      }
    } else {
      logger.warn(
        `[Letta Tools] Failed to list ${label} tools:`,
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );
    }
  });
  return tools;
}

export async function attachAllSymyTools(
  client: LettaToolClient,
  agentId: string,
) {
  const tools = await getAllSymyMCPTools();
  let attached = 0;
  let alreadyAttached = 0;

  for (const tool of tools) {
    try {
      await client.agents.tools.attach(tool.id, { agent_id: agentId });
      attached++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already") || message.includes("attached"))
        alreadyAttached++;
      else
        logger.warn(
          `[Letta Tools] Failed to attach tool ${tool.name}: ${message}`,
        );
    }
  }

  if (attached + alreadyAttached === 0) {
    logger.warn(
      `[Letta Tools] Agent ${agentId} has 0 MCP tools attached (${tools.length} discovered)`,
    );
  } else {
    logger.info(
      `[Letta Tools] MCP tools: ${attached} attached, ${alreadyAttached} already, ${tools.length} total`,
    );
  }
}

async function upsertToolRulesBlock(agentId: string) {
  try {
    const response = await lettaAPI(`/agents/${agentId}/memory-blocks`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blocks = (await response.json()) as Array<{
      label?: string;
      value?: string;
    }>;
    const existing = blocks.find((block) => block.label === "symy_tool_rules");
    if (existing?.value?.startsWith(SYMY_TOOL_RULES_VERSION)) return;

    if (existing) {
      await lettaAPI(`/agents/${agentId}/memory-blocks/symy_tool_rules`, {
        method: "PATCH",
        body: JSON.stringify({ value: SYMY_TOOL_RULES_BLOCK }),
      });
    } else {
      await lettaAPI(`/agents/${agentId}/memory-blocks`, {
        method: "POST",
        body: JSON.stringify({
          label: "symy_tool_rules",
          value: SYMY_TOOL_RULES_BLOCK,
          limit: 2000,
        }),
      });
    }
  } catch (error) {
    // safe to ignore: rules are a per-message defense, never transactional state
    logger.warn(
      `[Letta Tools] Failed to sync tool rules block for ${agentId}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function syncAgentSymyTools(agentId: string) {
  const client = getLettaClient();
  await attachAllSymyTools(client, agentId);
  await upsertToolRulesBlock(agentId);
}
