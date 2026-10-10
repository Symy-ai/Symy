import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  validateActionBody: vi.fn(),
  fs: { readFileSync: vi.fn() },
  createAdminClient: vi.fn(),
}));

vi.mock('../_shared', () => ({
  validateActionBody: M.validateActionBody,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('fs', () => ({ readFileSync: M.fs.readFileSync }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));

import { handleCreateMemoryBlock } from '../create_memory_block';
import { handleUpdateSystemPrompt } from '../update_system_prompt';

function makeCtx() {
  const blocksCreate = vi.fn();
  const blocksAttach = vi.fn();
  const blocksUpdate = vi.fn();
  const agentsUpdate = vi.fn();
  const c = {
    client: {
      blocks: { create: blocksCreate },
      agents: {
        blocks: { attach: blocksAttach, update: blocksUpdate },
        update: agentsUpdate,
      },
    },
    request: { json: () => Promise.resolve({}) },
  };
  return { c: c as never, blocksCreate, blocksAttach, blocksUpdate, agentsUpdate };
}

/**
 * create_memory_block.ts (59行) + update_system_prompt.ts (50行) 打包。
 *
 * 锁定:
 * - create: 成功双调 (create+attach)+block 回显; 已存在→update 降级; limit 非法→5000
 * - update_system_prompt: 文件缺失→500; 无 admin client→500; N agents 逐个 update 计数
 */
describe('handleCreateMemoryBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { label: 'persona', value: '契约小象', agent_id: 'a1' } });
  });

  it('成功 → create+attach 双调+block 回显', async () => {
    const { c, blocksCreate, blocksAttach } = makeCtx();
    blocksCreate.mockResolvedValueOnce({ id: 'blk-1' });
    const r = (await handleCreateMemoryBlock(c)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.block).toEqual({ id: 'blk-1', label: 'persona' });
    expect(blocksCreate).toHaveBeenCalledWith(expect.objectContaining({ label: 'persona', value: '契约小象' }));
    expect(blocksAttach).toHaveBeenCalledWith('blk-1', { agent_id: 'a1' });
  });

  it('limit 非法 (abc/负数/未给) → 兜底 5000 (Round 15 ADV-REVIEW LOW-1 锚)', async () => {
    M.validateActionBody.mockReturnValueOnce({ success: true, data: { label: 'l', value: 'v', agent_id: 'a1', limit: 'abc' } });
    const { c, blocksCreate } = makeCtx();
    blocksCreate.mockResolvedValueOnce({ id: 'b' });
    await handleCreateMemoryBlock(c);
    expect(blocksCreate).toHaveBeenCalledWith(expect.objectContaining({ limit: 5000 }));
  });

  it('已存在 (duplicate) → update 降级成功', async () => {
    const { c, blocksCreate, blocksUpdate } = makeCtx();
    blocksCreate.mockRejectedValueOnce(new Error('block already exists'));
    blocksUpdate.mockResolvedValueOnce(undefined);
    const r = (await handleCreateMemoryBlock(c)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.message).toContain('already exists, updated value');
    expect(blocksUpdate).toHaveBeenCalled();
  });

  it('普通失败 → 500', async () => {
    const { c, blocksCreate } = makeCtx();
    blocksCreate.mockRejectedValueOnce(new Error('timeout'));
    const r = (await handleCreateMemoryBlock(c)) as Response;
    expect(r.status).toBe(500);
  });
});

describe('handleUpdateSystemPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.fs.readFileSync.mockReturnValue('# prompt body');
    M.createAdminClient.mockReturnValue({ supabase: { from: () => ({ select: () => ({ not: () => Promise.resolve({ data: [{ letta_agent_id: 'a1' }, { letta_agent_id: 'a2' }] }) }) }) } });
  });

  it('文件缺失 → 500', async () => {
    M.fs.readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const r = (await handleUpdateSystemPrompt(makeCtx().c)) as Response;
    expect(r.status).toBe(500);
  });

  it('admin client 缺失 → 500', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    const r = (await handleUpdateSystemPrompt(makeCtx().c)) as Response;
    expect(r.status).toBe(500);
  });

  it('N agents 逐个 update+计数 (1 失败)', async () => {
    const { c, agentsUpdate } = makeCtx();
    agentsUpdate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('down'));
    const r = (await handleUpdateSystemPrompt(c)) as Response;
    const body = JSON.parse(await r.text());
    expect(body).toEqual(expect.objectContaining({ success: true, updated: 1, failed: 1, total: 2, promptLength: 13 }));
    expect(body.message).toBe('Updated 1/2 agents (1 failed)');
  });
});
