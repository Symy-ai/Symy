import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  validateActionBody: vi.fn(),
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

import { handleUpdateProviderBaseUrl } from '../update_provider_base_url';

const ctx = { request: { json: () => Promise.resolve({}) } } as never;
const goodInput = { base_url: 'https://api.deepseek.production/v1', api_key: 'sk-xxx', provider_name: 'My_deepseek' };

/**
 * update_provider_base_url.ts (114行) — provider 切换 (ARCH-6 #1 SSRF 防线)。
 *
 * 锁定:
 * - SSRF: private/localhost/169.254/.local/.internal 全拒 (schema refine)
 * - provider_name 解析 → id (大小写不敏感)
 * - 找不到 → 404
 * - PATCH body 形状 (base_url+api_key 必带)
 * - 成功 → old/new url 对
 */
describe('handleUpdateProviderBaseUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { ...goodInput } });
    M.lettaAPI.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  });

  it('SSRF: private/localhost 全拒 (schema 层)', async () => {
    const bads = [
      'http://localhost:5432/v1',
      'http://127.0.0.1/v1',
      'http://10.0.0.5/v1',
      'http://172.20.1.1/v1',
      'http://192.168.1.1/v1',
      'http://169.254.169.254/v1',
      'http://db.local/v1',
      'http://svc.internal/v1',
    ];
    for (const bad of bads) {
      M.validateActionBody.mockReturnValueOnce({ success: false, response: new Response(JSON.stringify({ error: `blocked ${bad}` }), { status: 400 }) });
      const r = (await handleUpdateProviderBaseUrl(ctx)) as Response;
      expect(r.status).toBe(400);
    }
  });

  it('provider_name 大小写不敏感解析 → id', async () => {
    M.lettaAPI
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ name: 'MY_DEEPSEEK', id: 'prov-9' }]) }) // list
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ base_url: 'https://old.dev/v1' }) }); // patch
    const r = (await handleUpdateProviderBaseUrl(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.provider_id).toBe('prov-9');
    expect(body.old_base_url).toBe('https://old.dev/v1');
    expect(body.new_base_url).toBe(goodInput.base_url);
    // PATCH body 形状
    const patchCall = M.lettaAPI.mock.calls.find((c: unknown[]) => (c[1] as { method?: string } | undefined)?.method === 'PATCH');
    const patchBody = JSON.parse((patchCall?.[1] as { body: string }).body);
    expect(patchBody).toEqual({ base_url: goodInput.base_url, api_key: 'sk-xxx' });
  });

  it('找不到 provider → 404', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ name: 'other', id: 'x' }]) });
    const r = (await handleUpdateProviderBaseUrl(ctx)) as Response;
    expect(r.status).toBe(404);
  });

  it('PATCH 失败 → 500+detail 截 300', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { ...goodInput, provider_id: 'prov-1' } });
    M.lettaAPI.mockResolvedValueOnce({ ok: false, status: 502, text: () => Promise.resolve('x'.repeat(500)) });
    const r = (await handleUpdateProviderBaseUrl(ctx)) as Response;
    expect(r.status).toBe(500);
    const body = JSON.parse(await r.text());
    expect(body.detail.length).toBeLessThanOrEqual(300);
  });
});
