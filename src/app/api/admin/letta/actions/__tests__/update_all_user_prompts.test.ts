import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  createAdminClient: vi.fn(),
  agentsUpdate: vi.fn(),
  toolsAttach: vi.fn(),
  recompile: vi.fn(),
  mcpRefresh: vi.fn(),
  mcpToolsList: vi.fn(),
}));

vi.mock('../_shared', () => ({
  // setup.ts 全局固化 MCP_API_SECRET — 模块常量非空
  MCP_API_SECRET: 'test-mcp-secret',
  lettaAPI: M.lettaAPI,
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>();
  return { ...orig, readFileSync: () => '# SYSTEM PROMPT vNext' };
});

import { handleUpdateAllUserPrompts } from '../update_all_user_prompts';

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
 * update_all_user_prompts.ts (121行) — 批量 prompt+工具更新 (Round 12 M8/M9)。
 *
 * 锁定:
 * - prompt 文件缺失 → 500 (M8)
 * - MCP 工具发现: symy-mcp/weme-mcp 双名兼容 → refresh+list
 * - 逐 agent: update prompt→attach 工具 (already/attached 静默)→recompile (失败计数 M9)
 * - 汇总透传: updated/failed/total/mcpToolsAvailable/recompileFailed
 */
describe('handleUpdateAllUserPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.createAdminClient.mockReturnValue({
      supabase: {
        from: () => ({
          select: () => ({
            not: () =>
              Promise.resolve({
                data: [
                  { id: 'u1', letta_agent_id: 'agent-1' },
                  { id: 'u2', letta_agent_id: 'agent-2' },
                ],
              }),
          }),
        }),
      },
    });
    M.lettaAPI.mockResolvedValue({ ok: true, json: () => Promise.resolve([{ server_name: 'symy-mcp', id: 'mcp-1' }]) });
    M.mcpToolsList.mockResolvedValue([{ id: 'tool-1', name: 'record_impulse' }, { id: 'tool-2', name: 'add_tokens' }]);
    M.agentsUpdate.mockResolvedValue({});
    M.toolsAttach.mockResolvedValue({});
    M.recompile.mockResolvedValue({});
  });

  it('prompt 文件缺失 → 500 (M8)', async () => {
    const fs = await import('fs');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const r = (await handleUpdateAllUserPrompts(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('MCP 工具发现: 双名兼容+refresh+list', async () => {
    const r = (await handleUpdateAllUserPrompts(makeCtx())) as Response;
    expect(r.status).toBe(200);
    expect(M.mcpRefresh).toHaveBeenCalledWith('mcp-1');
    expect(M.mcpToolsList).toHaveBeenCalledWith('mcp-1');
    const body = JSON.parse(await r.text());
    expect(body.mcpToolsAvailable).toBe(2);
  });

  it('逐 agent 三步: prompt→工具×N→recompile', async () => {
    await handleUpdateAllUserPrompts(makeCtx());
    expect(M.agentsUpdate).toHaveBeenCalledTimes(2);
    expect(M.agentsUpdate).toHaveBeenCalledWith('agent-1', { system: '# SYSTEM PROMPT vNext' });
    expect(M.toolsAttach).toHaveBeenCalledTimes(4); // 2 agents × 2 tools
    expect(M.recompile).toHaveBeenCalledTimes(2);
  });

  it('already/attached 工具错误静默; 其他 attach 失败只 warn', async () => {
    M.toolsAttach
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('tool already attached')) // 静默
      .mockRejectedValueOnce(new Error('boom')) // warn
      .mockResolvedValueOnce({});
    const r = (await handleUpdateAllUserPrompts(makeCtx())) as Response;
    expect(r.status).toBe(200);
    const body = JSON.parse(await r.text());
    expect(body.failed).toBe(0); // attach 失败不算 agent 失败
  });

  it('recompile 失败计数 (M9) 不影响 updated', async () => {
    M.recompile.mockRejectedValueOnce(new Error('recompile timeout'));
    const r = (await handleUpdateAllUserPrompts(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.updated).toBe(2);
    expect(body.recompileFailed).toBe(1);
    expect(body.success).toBe(true);
  });

  it('agent update 抛错 → failed 计数', async () => {
    M.agentsUpdate.mockRejectedValueOnce(new Error('agent gone'));
    const r = (await handleUpdateAllUserPrompts(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.updated).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.total).toBe(2);
  });
});
