import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  validateActionBody: vi.fn(),
  lettaAPI: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('../_shared', () => ({
  validateActionBody: M.validateActionBody,
  lettaAPI: M.lettaAPI,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));

import { handleRecompile } from '../recompile';
import { handleUpdateMemoryBlock } from '../update_memory_block';
import { handleGetAgentDetail } from '../get_agent_detail';

function makeCtx() {
  const agentsRecompile = vi.fn();
  const blocksUpdate = vi.fn();
  const c = {
    client: {
      agents: { recompile: agentsRecompile, blocks: { update: blocksUpdate } },
    },
    request: { json: () => Promise.resolve({}) },
  };
  return { c: c as never, agentsRecompile, blocksUpdate };
}

/**
 * recompile.ts (36行) + update_memory_block.ts (35行) + get_agent_detail.ts (35行) 打包。
 *
 * 锁定:
 * - recompile: admin 缺失→500; N agents 计数 (与 update_system_prompt 同款)
 * - update_memory_block: 404 降级提示先 create; 值 String 窄化
 * - get_agent_detail: llm_config+memory 形状抽取; 坏 JSON → raw 截 1000
 */
describe('handleRecompile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.createAdminClient.mockReturnValue({ supabase: { from: () => ({ select: () => ({ not: () => Promise.resolve({ data: [{ letta_agent_id: 'a1' }, { letta_agent_id: 'a2' }, { letta_agent_id: 'a3' }] }) }) }) } });
  });

  it('admin 缺失 → 500', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    const r = (await handleRecompile(makeCtx().c)) as Response;
    expect(r.status).toBe(500);
  });

  it('N agents 计数 (1 失败)', async () => {
    const { c, agentsRecompile } = makeCtx();
    agentsRecompile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    const r = (await handleRecompile(c)) as Response;
    const body = JSON.parse(await r.text());
    expect(body).toEqual(expect.objectContaining({ updated: 2, failed: 1, total: 3 }));
    expect(body.message).toBe('Recompiled 2/3 agents (1 failed)');
  });
});

describe('handleUpdateMemoryBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { label: 'persona', value: 42, agent_id: 'a1' } });
  });

  it('成功 → blocks.update+值 String 窄化', async () => {
    const { c, blocksUpdate } = makeCtx();
    blocksUpdate.mockResolvedValueOnce(undefined);
    const r = (await handleUpdateMemoryBlock(c)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(blocksUpdate).toHaveBeenCalledWith('persona', { agent_id: 'a1', value: '42' }); // number→string
  });

  it('not found → 404+提示先 create', async () => {
    const { c, blocksUpdate } = makeCtx();
    blocksUpdate.mockRejectedValueOnce(new Error('Block persona not found'));
    const r = (await handleUpdateMemoryBlock(c)) as Response;
    expect(r.status).toBe(404);
    expect(JSON.parse(await r.text()).error).toContain('Use create_memory_block first');
  });

  it('普通失败 → 500', async () => {
    const { c, blocksUpdate } = makeCtx();
    blocksUpdate.mockRejectedValueOnce(new Error('timeout'));
    expect(((await handleUpdateMemoryBlock(c)) as Response).status).toBe(500);
  });
});

describe('handleGetAgentDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'a1' } });
  });

  it('形状抽取: llm_config+memory blocks 精简', async () => {
    M.lettaAPI.mockResolvedValueOnce({
      text: () => Promise.resolve(JSON.stringify({
        id: 'a1',
        name: 'buddy',
        llm_config: { model: 'glm-5.2', model_endpoint: 'https://x', model_endpoint_type: 'openai', enable_reasoner: true, max_reasoning_tokens: 512 },
        tool_ids: ['t1'],
        memory: { blocks: [{ label: 'persona', limit: 5000, value: 'secret-should-not-appear' }] },
      })),
    });
    const r = (await handleGetAgentDetail(makeCtx().c)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.model).toBe('glm-5.2');
    expect(body.enable_reasoner).toBe(true);
    expect(body.memory_blocks).toEqual([{ label: 'persona', limit: 5000 }]); // value 不外泄
  });

  it('坏 JSON → raw 截 1000+500', async () => {
    M.lettaAPI.mockResolvedValueOnce({ text: () => Promise.resolve('<html>not json</html>') });
    const r = (await handleGetAgentDetail(makeCtx().c)) as Response;
    expect(r.status).toBe(500);
    expect(JSON.parse(await r.text()).raw).toBe('<html>not json</html>');
  });
});
