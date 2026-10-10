import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  validateActionBody: vi.fn(),
  lettaAPI: vi.fn(),
  enableAll: vi.fn(),
  enableSingle: vi.fn(),
  listAll: vi.fn(),
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
vi.mock('@/lib/letta-agent-admin', () => ({
  enableSleeptimeForAllAgents: M.enableAll,
  listAllUserAgents: M.listAll,
}));
vi.mock('@/lib/letta-agent-manager', () => ({ enableSleeptimeForAgent: M.enableSingle }));

import { handleEnableSleeptime } from '../enable_sleeptime';
import { handleEnableSleeptimeSingle } from '../enable_sleeptime_single';
import { handleListMcpServers } from '../list_mcp_servers';
import { handleListUserAgents } from '../list_user_agents';
import { handleRefreshMcpServer } from '../refresh_mcp_server';

function makeCtx() {
  const mcpRefresh = vi.fn();
  const c = {
    client: { mcpServers: { refresh: mcpRefresh } },
    request: { json: () => Promise.resolve({}) },
  };
  return { c: c as never, mcpRefresh };
}

/**
 * letta actions 尾部五件打包: enable_sleeptime/enable_sleeptime_single/list_mcp_servers/
 * list_user_agents/refresh_mcp_server — Round 73/ARCH-8 #17 件。
 *
 * 锁定:
 * - enable_all: 聚合透传; single: agent_id 直通
 * - list_mcp: custom_headers 剥离红线 (只回 has_custom_headers 布尔)
 * - list_user_agents: total 计数
 * - refresh: server_id String 窄化+抛错 500
 */
describe('handleEnableSleeptime (全体)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('聚合结果透传', async () => {
    M.enableAll.mockResolvedValueOnce({ enabled: 5, failed: 1 });
    const r = (await handleEnableSleeptime(makeCtx().c)) as Response;
    expect(await r.json()).toEqual({ success: true, enabled: 5, failed: 1 });
  });
});

describe('handleEnableSleeptimeSingle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'a1' } });
  });

  it('agent_id 直通+布尔回传', async () => {
    M.enableSingle.mockResolvedValueOnce(true);
    const r = (await handleEnableSleeptimeSingle(makeCtx().c)) as Response;
    expect(await r.json()).toEqual({ success: true, agent_id: 'a1' });
    expect(M.enableSingle).toHaveBeenCalledWith('a1');
  });
});

describe('handleListMcpServers (ARCH-8 #17 凭据剥离)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('custom_headers 剥离 → 只回 has_custom_headers 布尔', async () => {
    M.lettaAPI.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 's1', name: 'symy', custom_headers: { Authorization: 'Bearer SECRET' } },
        { id: 's2', name: 'plain' },
      ]),
    });
    const r = (await handleListMcpServers(makeCtx().c)) as Response;
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.servers[0]).toEqual({ id: 's1', name: 'symy', has_custom_headers: true }); // 无 SECRET
    expect(body.servers[1].has_custom_headers).toBe(false);
  });

  it('非数组响应 → 单元素包数组', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'only' }) });
    const r = (await handleListMcpServers(makeCtx().c)) as Response;
    expect((await r.json()).servers).toHaveLength(1);
  });

  it('API 失败 → 500', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('down') });
    const r = (await handleListMcpServers(makeCtx().c)) as Response;
    expect(r.status).toBe(500);
  });
});

describe('handleListUserAgents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('agents+total 计数', async () => {
    M.listAll.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]);
    const r = (await handleListUserAgents(makeCtx().c)) as Response;
    expect(await r.json()).toEqual({ success: true, agents: [{ id: 'a1' }, { id: 'a2' }], total: 2 });
  });
});

describe('handleRefreshMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { server_id: '42' } }); // zod transform 已窄化 (R368 mock 真值定案)
  });

  it('server_id String 窄化+全局刷新 (不带 agent)', async () => {
    const { c, mcpRefresh } = makeCtx();
    mcpRefresh.mockResolvedValueOnce({ tools: 3 });
    const r = (await handleRefreshMcpServer(c)) as Response;
    expect(await r.json()).toEqual({ success: true, result: { tools: 3 } });
    expect(mcpRefresh).toHaveBeenCalledWith('42');
  });

  it('刷新抛错 → 500+message 透传', async () => {
    const { c, mcpRefresh } = makeCtx();
    mcpRefresh.mockRejectedValueOnce(new Error('conn refused'));
    const r = (await handleRefreshMcpServer(c)) as Response;
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain('conn refused');
  });
});
