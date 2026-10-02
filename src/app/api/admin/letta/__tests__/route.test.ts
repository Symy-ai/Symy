/* eslint-disable require-await -- Response.json mock 简化 */
// admin/letta — Letta 管理面板（此前 0 测试）
// 契约: admin鉴权(GET via buildAdminCtxGet)/agent列表截断50/
// model补查失败降级unknown/MCP servers拉取失败空数组/
// 内部错误不外泄(BUG-268)。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// _shared mock: buildAdminCtxGet 直接给 ctx 或 401
let adminCtxState: 'ok' | 'unauthorized' | 'no-key' = 'ok';
const { lettaAPISharedMock } = vi.hoisted(() => ({ lettaAPISharedMock: vi.fn() }));
vi.mock('../actions/_shared', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../actions/_shared')>();
  return {
    ...orig,
    lettaAPI: lettaAPISharedMock,
    buildAdminCtxGet: () => {
      if (adminCtxState === 'unauthorized') {
        return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
      }
      if (adminCtxState === 'no-key') {
        return { error: NextResponse.json({ error: 'Letta not configured' }) };
      }
      return { client: {} };
    },
  };
});
const listAllUserAgentsMock = vi.fn();
vi.mock('@/lib/letta-agent-admin', () => ({
  listAllUserAgents: (...a: unknown[]) => listAllUserAgentsMock(...a),
}));
const lettaAPIMock = vi.fn();
vi.mock('@/lib/letta-http', () => ({
  lettaAPI: (...a: unknown[]) => lettaAPIMock(...a),
  getLettaClient: vi.fn(),
}));

import { GET } from '../route';
// route 的 agent 详情走 _shared.lettaAPI 包装(缓存 headers) — 让包装透传 mock

function req() {
  return new NextRequest('http://localhost/api/admin/letta');
}

describe('GET /api/admin/letta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminCtxState = 'ok';
  });

  it('非 admin → 401 (buildAdminCtxGet 鉴权)', async () => {
    adminCtxState = 'unauthorized';
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listAllUserAgentsMock).not.toHaveBeenCalled();
  });

  it('agents 映射: 截断50 + model补查降级unknown + MCP servers列表', async () => {
    // 60 个 agent → 只取前 50
    const many = Array.from({ length: 60 }, (_, i) => ({ userId: `u-${i}`, agentId: `a-${i}`, agentName: null }));
    listAllUserAgentsMock.mockResolvedValue(many);
    lettaAPISharedMock.mockImplementation((path: string) => {
      if (path === '/mcp-servers/') {
        return Promise.resolve({ ok: true, json: async () => [{ id: 's1', name: 'symy-mcp', server_url: 'x', mcp_server_type: 'streamable_http' }] });
      }
      // agent 详情: a-0 有 model, 其余失败
      if (path === '/agents/a-0') return Promise.resolve({ ok: true, json: async () => ({ llm_config: { model: 'glm-5.2' } }) });
      return Promise.resolve({ ok: false });
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentCount).toBe(50);
    expect(body.agents[0]).toEqual({ id: 'a-0', name: 'symy-user-u-0', model: 'glm-5.2', user_id: 'u-0' });
    expect(body.agents[1].model).toBe('unknown'); // 补查失败降级
    expect(body.mcpServers[0]).toEqual({ id: 's1', name: 'symy-mcp', server_url: 'x', server_type: 'streamable_http' });
  });

  it('listAllUserAgents 抛 → 500 且不外泄内部详情 (BUG-268)', async () => {
    listAllUserAgentsMock.mockRejectedValue(new Error('supabase secret leak path'));
    const res = await GET(req());
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('supabase');
    expect(text).not.toContain('secret');
  });

  it('MCP servers 拉取失败 → 空数组降级不炸', async () => {
    listAllUserAgentsMock.mockResolvedValue([]);
    lettaAPISharedMock.mockReset();
    lettaAPISharedMock.mockRejectedValue(new Error('letta down'));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).mcpServers).toEqual([]);
  });
});
