import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  validateActionBody: vi.fn(),
  listAllUserAgents: vi.fn(),
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
vi.mock('@/lib/letta-agent-admin', () => ({ listAllUserAgents: M.listAllUserAgents }));

import { handleUpdateAllAgentEndpoints } from '../update_all_agent_endpoints';

/**
 * update_all_agent_endpoints.ts (64行) — 批量 endpoint 更新 (Bug A: llm_config 弃用)。
 *
 * 锁定:
 * - endpoint 缺省 → {MCP_URL}/api/v1
 * - PATCH body: model_endpoint+model_endpoint_type=openai (Bug A 新形态, 无 llm_config)
 * - 失败/抛错 → error 截 200+failed 计数
 */
describe('handleUpdateAllAgentEndpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: {} });
    M.listAllUserAgents.mockResolvedValue([{ agentId: 'a1' }, { agentId: 'a2' }]);
    M.lettaAPI.mockResolvedValue({ ok: true });
  });

  it('缺省 endpoint → getMcpServerUrl()/api/v1 + PATCH 新形态 body', async () => {
    const r = (await handleUpdateAllAgentEndpoints({} as never)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.newEndpoint).toBe('https://mcp.test/api/v1');
    expect(body.updated).toBe(2);
    const patchBody = JSON.parse((M.lettaAPI.mock.calls[0][1] as { body: string }).body);
    expect(patchBody).toEqual({ model_endpoint: 'https://mcp.test/api/v1', model_endpoint_type: 'openai' });
    expect('llm_config' in patchBody).toBe(false); // Bug A: 弃用字段不再下发
  });

  it('自定义 endpoint 透传', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { endpoint: 'https://custom/v9' } });
    const r = (await handleUpdateAllAgentEndpoints({} as never)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.newEndpoint).toBe('https://custom/v9');
  });

  it('单 agent PATCH 失败 → error 截 200+failed 计数', async () => {
    M.lettaAPI
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('e'.repeat(300)) })
      .mockResolvedValueOnce({ ok: true });
    const r = (await handleUpdateAllAgentEndpoints({} as never)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.updated).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results[0].error.length).toBeLessThanOrEqual(200);
  });

  it('抛错 → catch 计 failed 不中断', async () => {
    M.lettaAPI
      .mockRejectedValueOnce(new Error('network gone'))
      .mockResolvedValueOnce({ ok: true });
    const r = (await handleUpdateAllAgentEndpoints({} as never)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.failed).toBe(1);
    expect(body.results[0].error).toContain('network gone');
  });

  it('空 agent 列表 → total 0 成功', async () => {
    M.listAllUserAgents.mockResolvedValue([]);
    const r = (await handleUpdateAllAgentEndpoints({} as never)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.total).toBe(0);
    expect(body.success).toBe(true);
  });
});
