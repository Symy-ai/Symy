import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  validateActionBody: vi.fn(),
}));

vi.mock('../_shared', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...(orig as object),
    lettaAPI: M.lettaAPI,
    validateActionBody: M.validateActionBody,
    getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
    NextResponse: {
      json: (body: unknown, init?: { status: number }) =>
        new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
    },
  };
});
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { handleRegisterMcpServer } from '../register_mcp_server';

const ctx = { request: { json: () => Promise.resolve({}) } } as never;

function listResp(servers: unknown[]) {
  return { ok: true, status: 200, json: () => Promise.resolve(servers), text: () => Promise.resolve('') };
}
function postResp(ok: boolean, data: unknown = { id: 'srv-new', name: 'x' }) {
  return {
    ok,
    status: ok ? 201 : 500,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve('letta rejected'),
  };
}

/**
 * register_mcp_server.ts (123行) — MCP server 注册 action (T5 hands 专用通道)。
 *
 * 锁定:
 * - MCP_API_SECRET 未配置 → 400
 * - symy-hands 专用: 自有 URL+secret 双 header; 无 secret → 500; 已存在 → 幂等返回
 * - 通用 server: 已存在幂等; 新注册 config 形状 (streamable_http+双 header)
 * - 注册失败 → 500 截 200 字
 */
describe('handleRegisterMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_API_SECRET = 'mcp-secret';
    process.env.SYMY_HANDS_URL = 'https://hands.symy.ai/mcp/';
    process.env.SYMY_HANDS_SECRET = 'hands-secret';
    M.validateActionBody.mockReturnValue({ success: true, data: { server_name: 'symy-tools' } });
    M.lettaAPI.mockResolvedValue(listResp([]));
  });

  it('symy-hands: 无 secret → 500', async () => {
    delete process.env.SYMY_HANDS_SECRET;
    M.validateActionBody.mockReturnValue({ success: true, data: { server_name: 'symy-hands' } });
    M.lettaAPI.mockResolvedValueOnce(listResp([]));
    const r = (await handleRegisterMcpServer(ctx)) as Response;
    expect(r.status).toBe(500);
  });

  it('symy-hands: 已存在 → 幂等返回 (不重复注册)', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { server_name: 'symy-hands' } });
    M.lettaAPI.mockReset();
    M.lettaAPI.mockResolvedValue(listResp([{ server_name: 'symy-hands', id: 'hands-1' }]));
    const r = (await handleRegisterMcpServer(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.server.id).toBe('hands-1');
    const posts = M.lettaAPI.mock.calls.filter((c: unknown[]) => (c[1] as { method?: string } | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('通用: 已存在 → 幂等返回', async () => {
    M.lettaAPI.mockResolvedValueOnce(listResp([{ server_name: 'symy-tools', id: 'srv-1' }]));
    const r = (await handleRegisterMcpServer(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.server.id).toBe('srv-1');
  });

  it('通用: 新注册 config 形状 (双 header+streamable_http)', async () => {
    M.lettaAPI.mockReset();
    M.lettaAPI.mockResolvedValueOnce(listResp([])).mockResolvedValueOnce(postResp(true));
    const r = (await handleRegisterMcpServer(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.server.url).toBe('https://mcp.test/api/mcp/server');
    const postBody = JSON.parse((M.lettaAPI.mock.calls[1][1] as { body: string }).body);
    expect(postBody.config.mcp_server_type).toBe('streamable_http');
    expect(postBody.config.custom_headers['X-MCP-Secret']).toBe('test-mcp-secret'); // src/test/setup.ts 全局固化值
    expect(postBody.config.custom_headers.Authorization).toBe('Bearer test-mcp-secret');
  });

  it('注册失败 → 500 截 200 字', async () => {
    M.lettaAPI.mockResolvedValueOnce(listResp([])).mockResolvedValueOnce(postResp(false));
    const r = (await handleRegisterMcpServer(ctx)) as Response;
    expect(r.status).toBe(500);
    const body = JSON.parse(await r.text());
    expect(body.error.length).toBeLessThanOrEqual(200 + 'Failed to register MCP server: '.length);
  });
});
