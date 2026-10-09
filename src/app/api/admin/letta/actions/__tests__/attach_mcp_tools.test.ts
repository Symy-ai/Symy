import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  validateActionBody: vi.fn(),
  mcpRefresh: vi.fn(),
  mcpToolsList: vi.fn(),
  toolsAttach: vi.fn(),
}));

vi.mock('../_shared', () => ({
  lettaAPI: M.lettaAPI,
  validateActionBody: M.validateActionBody,
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));

import { handleAttachMcpTools } from '../attach_mcp_tools';

function makeCtx() {
  return {
    client: {
      mcpServers: {
        refresh: M.mcpRefresh,
        tools: { list: M.mcpToolsList },
      },
      agents: { tools: { attach: M.toolsAttach } },
    },
  } as never;
}

/**
 * attach_mcp_tools.ts (67行) — 单 agent 工具挂载。
 *
 * 锁定:
 * - refresh 失败 → warn 继续
 * - SDK list 失败 → REST fallback; 双失败 → 500
 * - already/attached → 计入 attachedTools (标注); 真失败 → failedTools
 */
describe('handleAttachMcpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { server_id: 'srv-1', agent_id: 'agent-1' } });
    M.mcpRefresh.mockResolvedValue(undefined);
    M.mcpToolsList.mockResolvedValue([{ id: 't1', name: 'record_impulse' }, { id: 't2', name: 'add_tokens' }]);
    M.toolsAttach.mockResolvedValue({});
  });

  it('标准流: refresh+list+逐工具 attach', async () => {
    const r = (await handleAttachMcpTools(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.attachedTools).toEqual(['record_impulse', 'add_tokens']);
    expect(body.failedTools).toEqual([]);
    expect(M.toolsAttach).toHaveBeenCalledWith('t1', { agent_id: 'agent-1' });
  });

  it('refresh 失败 → warn 继续 list', async () => {
    M.mcpRefresh.mockRejectedValueOnce(new Error('refresh boom'));
    const r = (await handleAttachMcpTools(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.attachedTools.length).toBe(2); // refresh 挂不影响
  });

  it('already attached → 计入 attached (标注) 非失败', async () => {
    M.toolsAttach
      .mockRejectedValueOnce(new Error('already attached'))
      .mockResolvedValueOnce({});
    const r = (await handleAttachMcpTools(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.attachedTools).toEqual(['record_impulse (already)', 'add_tokens']);
    expect(body.failedTools).toEqual([]);
  });

  it('SDK list 失败 → REST fallback', async () => {
    M.mcpToolsList.mockRejectedValueOnce(new Error('sdk down'));
    M.lettaAPI.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 't9', name: 'fallback_tool' }]) });
    const r = (await handleAttachMcpTools(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.attachedTools).toEqual(['fallback_tool']);
    expect(M.lettaAPI).toHaveBeenCalledWith('/mcp-servers/srv-1/tools');
  });

  it('双 list 失败 → 500', async () => {
    M.mcpToolsList.mockRejectedValueOnce(new Error('sdk down'));
    M.lettaAPI.mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('rest down') });
    const r = (await handleAttachMcpTools(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });
});
