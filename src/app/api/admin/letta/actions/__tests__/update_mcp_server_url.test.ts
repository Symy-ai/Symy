import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  mcpRefresh: vi.fn(),
}));

vi.mock('../_shared', () => ({
  lettaAPI: M.lettaAPI,
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));

import { handleUpdateMcpServerUrl } from '../update_mcp_server_url';

function makeCtx() {
  return { client: { mcpServers: { refresh: M.mcpRefresh } } } as never;
}

function listResp(servers: unknown[]) {
  return { ok: true, json: () => Promise.resolve(servers) };
}
const PROD_URL = 'https://symy.ai/api/mcp/server';

/**
 * update_mcp_server_url.ts (99行) — MCP URL 批量修正 (Bug A: 强制生产域名)。
 *
 * 锁定:
 * - URL 硬锚: 恒 https://symy.ai (不走 NEXT_PUBLIC_APP_URL — dev preview 污染防线)
 * - 已正确 → 跳过 (幂等); 需更新 → PATCH+refresh
 * - PATCH 失败/抛错 → failed 计数, refresh 失败只记 log
 * - MCP_API_SECRET 缺失 → 500 (模块外读取 env — 可测)
 */
describe('handleUpdateMcpServerUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_API_SECRET = 'sec';
    M.mcpRefresh.mockResolvedValue(undefined);
  });

  it('已正确的 server → 跳过 (零 PATCH 幂等)', async () => {
    M.lettaAPI.mockResolvedValueOnce(listResp([
      { id: 's1', server_name: 'symy-mcp', config: { server_url: PROD_URL } },
    ]));
    const r = (await handleUpdateMcpServerUrl(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.updated).toBe(0);
    expect(body.newUrl).toBe(PROD_URL); // Bug A: 恒生产域名
    const patches = M.lettaAPI.mock.calls.filter((c: unknown[]) => (c[1] as { method?: string } | undefined)?.method === 'PATCH');
    expect(patches).toHaveLength(0);
  });

  it('旧 URL server → PATCH+refresh 工具', async () => {
    M.lettaAPI
      .mockResolvedValueOnce(listResp([{ id: 's2', server_name: 'old', config: { server_url: 'https://dev.vercel.app/api/mcp/server' } }]))
      .mockResolvedValueOnce({ ok: true });
    const r = (await handleUpdateMcpServerUrl(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.updated).toBe(1);
    expect(M.mcpRefresh).toHaveBeenCalledWith('s2');
    const patchBody = JSON.parse((M.lettaAPI.mock.calls[1][1] as { body: string }).body);
    expect(patchBody.config.server_url).toBe(PROD_URL);
    expect(patchBody.config.custom_headers['X-MCP-Secret']).toBe('sec');
  });

  it('PATCH 失败 → failed 计数+log 截 200', async () => {
    M.lettaAPI
      .mockResolvedValueOnce(listResp([{ id: 's3', server_name: 'bad', config: { server_url: 'https://x' } }]))
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('e'.repeat(400)) });
    const r = (await handleUpdateMcpServerUrl(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.failed).toBe(1);
    expect(body.logs.some((l: string) => l.includes('Update failed'))).toBe(true);
  });

  it('MCP_API_SECRET 缺失 → 500', async () => {
    delete process.env.MCP_API_SECRET;
    const r = (await handleUpdateMcpServerUrl(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('列表失败 → 500', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: false, status: 502 });
    const r = (await handleUpdateMcpServerUrl(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });
});
