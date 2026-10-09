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
  return { ...orig, readFileSync: () => '# PROMPT (sync)' };
});

import { handleSyncAll } from '../sync_all';

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
 * sync_all.ts (119行) — 全量同步 action (per-user agents 遍历, ARCH-5 #11)。
 *
 * 锁定:
 * - prompt 缺失 → 500
 * - admin client 不可用 → 500
 * - MCP 发现+refresh (失败 warn 不中断)+工具列表
 * - success=failed===0 (ARCH-5 #11: 旧代码永远 true)
 * - logs 全程追踪
 */
describe('handleSyncAll', () => {
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
    M.mcpToolsList.mockResolvedValue([{ id: 'tool-1', name: 'record_impulse' }]);
    M.agentsUpdate.mockResolvedValue({});
    M.toolsAttach.mockResolvedValue({});
    M.recompile.mockResolvedValue({});
  });

  it('prompt 缺失 → 500', async () => {
    const fs = await import('fs');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const r = (await handleSyncAll(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('admin client 不可用 → 500', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    const r = (await handleSyncAll(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('全成功 → success=true+logs 追踪', async () => {
    const r = (await handleSyncAll(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.updated).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(2);
    expect(body.logs.some((l: string) => l.includes('System prompt loaded'))).toBe(true);
    expect(body.logs.some((l: string) => l.includes('MCP server found'))).toBe(true);
    expect(body.logs.at(-1)).toContain('Updated 2/2 agents (0 failed)');
  });

  it('单 agent 失败 → success=false (ARCH-5 #11)', async () => {
    M.agentsUpdate.mockRejectedValueOnce(new Error('gone'));
    const r = (await handleSyncAll(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(false); // 有失败不再永远 true
    expect(body.updated).toBe(1);
    expect(body.failed).toBe(1);
  });

  it('MCP refresh 失败 → warn 不中断, 工具照常拉取', async () => {
    M.mcpRefresh.mockRejectedValueOnce(new Error('refresh timeout'));
    const r = (await handleSyncAll(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(M.mcpToolsList).toHaveBeenCalled(); // refresh 挂了仍拉工具
  });
});
