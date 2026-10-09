import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  validateActionBody: vi.fn(),
  getUserAgentId: vi.fn(),
  createAgentForUser: vi.fn(),
  agentsUpdate: vi.fn(),
  toolsAttach: vi.fn(),
  recompile: vi.fn(),
  mcpRefresh: vi.fn(),
  mcpToolsList: vi.fn(),
}));

vi.mock('../_shared', () => ({
  MCP_API_SECRET: 'test-mcp-secret',
  lettaAPI: M.lettaAPI,
  validateActionBody: M.validateActionBody,
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/letta-agent-manager', () => ({
  getUserAgentId: M.getUserAgentId,
  createAgentForUser: M.createAgentForUser,
}));
vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>();
  return { ...orig, readFileSync: () => '# PROMPT (create)' };
});

import { handleCreateUserAgent } from '../create_user_agent';

function makeCtx() {
  return {
    client: {
      agents: {
        update: M.agentsUpdate,
        recompile: M.recompile,
        tools: { attach: M.toolsAttach },
      },
      mcpServers: {
        refresh: M.mcpRefresh,
        tools: { list: M.mcpToolsList },
      },
    },
  } as never;
}

/**
 * create_user_agent.ts (114行) — 用户 agent 创建/同步 (Round 21 BUG-R21-M2)。
 *
 * 锁定:
 * - 已有 agent → 同步模式: prompt 更新+MCP 工具 attach+recompile, isNew=false
 * - prompt 读取失败 → log 继续 (R21-M2: 不再 uncaught 500)
 * - 无 agent → createAgentForUser; 失败 → 500; 成功 → isNew=true
 * - already/attached 静默
 */
describe('handleCreateUserAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { user_id: 'u1' } });
    M.getUserAgentId.mockResolvedValue(null);
    M.createAgentForUser.mockResolvedValue('agent-new');
    M.lettaAPI.mockResolvedValue({ ok: true, json: () => Promise.resolve([{ server_name: 'symy-mcp', id: 'mcp-1' }]) });
    M.mcpToolsList.mockResolvedValue([{ id: 't1', name: 'record_impulse' }]);
    M.agentsUpdate.mockResolvedValue({});
    M.toolsAttach.mockResolvedValue({});
    M.recompile.mockResolvedValue({});
  });

  it('无 agent → 创建 isNew=true', async () => {
    const r = (await handleCreateUserAgent(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.isNew).toBe(true);
    expect(body.agentId).toBe('agent-new');
    expect(M.createAgentForUser).toHaveBeenCalledWith('u1', undefined);
  });

  it('创建失败 → 500', async () => {
    M.createAgentForUser.mockResolvedValue(null);
    const r = (await handleCreateUserAgent(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('已有 agent → 同步三步 isNew=false', async () => {
    M.getUserAgentId.mockResolvedValue('agent-old');
    const r = (await handleCreateUserAgent(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.isNew).toBe(false);
    expect(body.agentId).toBe('agent-old');
    expect(M.agentsUpdate).toHaveBeenCalledWith('agent-old', { system: '# PROMPT (create)' });
    expect(M.toolsAttach).toHaveBeenCalledWith('t1', { agent_id: 'agent-old' });
    expect(M.recompile).toHaveBeenCalledWith('agent-old');
    expect(M.createAgentForUser).not.toHaveBeenCalled();
  });

  it('prompt 读取失败 → log 记录不炸 (R21-M2)', async () => {
    M.getUserAgentId.mockResolvedValue('agent-old');
    const fs = await import('fs');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const r = (await handleCreateUserAgent(makeCtx())) as Response;
    expect(r.status).toBe(200); // 不再 uncaught 500
    const body = JSON.parse(await r.text());
    expect(body.logs.some((l: string) => l.includes('Prompt update failed'))).toBe(true);
    // MCP/recompile 仍执行
    expect(M.recompile).toHaveBeenCalled();
  });

  it('already attached 静默不记 log', async () => {
    M.getUserAgentId.mockResolvedValue('agent-old');
    M.toolsAttach.mockRejectedValueOnce(new Error('already attached'));
    const r = (await handleCreateUserAgent(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.logs.some((l: string) => l.includes('Tool attach failed'))).toBe(false);
    expect(body.logs.some((l: string) => l.includes('MCP tools: 0 attached'))).toBe(true);
  });
});
