import { lettaAPI } from '@/lib/letta-mcp-manager';

/**
 * Letta v1 core-memory blocks 共享读写层
 *
 * 🔧 09-29 修复: 服务端 (api.letta.com) 是 Letta v1 架构 —
 *   旧端点 /agents/{id}/memory-blocks 与 POST /agents/{id}/core-memory/blocks
 *   全部 404 (probeSdk 71be9d0 实测), 正确端点 (letta-client 1.12.1 SDK 权威):
 *     list   GET    /v1/agents/{id}/core-memory/blocks
 *     update PATCH  /v1/agents/{id}/core-memory/blocks/{label}   body {value}
 *     create POST   /v1/blocks {label,value,limit}
 *                  + PATCH /v1/agents/{id}/core-memory/blocks/attach/{block_id}
 *     delete PATCH  /v1/agents/{id}/core-memory/blocks/detach/{block_id}
 *                  + DELETE /v1/blocks/{block_id}
 */

export interface LettaBlock {
  id?: string;
  label?: string;
  value?: string;
  limit?: number;
}

/** 列出 agent 的全部 core-memory blocks (按 label 索引) */
export async function listAgentBlocks(agentId: string): Promise<LettaBlock[]> {
  const res = await lettaAPI(`/agents/${agentId}/core-memory/blocks`);
  if (!res.ok) throw new Error(`list blocks HTTP ${res.status}`);
  return (await res.json()) as LettaBlock[];
}

/** upsert: 存在同名 label → PATCH value; 不存在 → POST /v1/blocks + attach */
export async function upsertAgentBlock(
  agentId: string,
  label: string,
  value: string,
  limit: number,
): Promise<{ created: boolean }> {
  const blocks = await listAgentBlocks(agentId);
  const existing = blocks.find((b) => b.label === label);
  if (existing) {
    if (existing.value === value) return { created: false }; // 幂等
    const patchRes = await lettaAPI(`/agents/${agentId}/core-memory/blocks/${label}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    if (!patchRes.ok) throw new Error(`patch ${label} HTTP ${patchRes.status}`);
    return { created: false };
  }
  // 创建全局 block + 挂到 agent
  const createRes = await lettaAPI('/blocks', {
    method: 'POST',
    body: JSON.stringify({ label, value, limit }),
  });
  if (!createRes.ok) throw new Error(`create block ${label} HTTP ${createRes.status}`);
  const created = (await createRes.json()) as LettaBlock;
  const blockId = created.id;
  if (!blockId) throw new Error(`create block ${label}: no id in response`);
  const attachRes = await lettaAPI(`/agents/${agentId}/core-memory/blocks/attach/${blockId}`, {
    method: 'PATCH',
  });
  if (!attachRes.ok) throw new Error(`attach ${label} HTTP ${attachRes.status}`);
  return { created: true };
}
