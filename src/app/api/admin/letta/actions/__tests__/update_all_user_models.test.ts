import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  updateAll: vi.fn(),
  validateActionBody: vi.fn(),
}));

vi.mock('../_shared', () => ({
  lettaAPI: M.lettaAPI,
  validateActionBody: M.validateActionBody,
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
  },
}));
vi.mock('@/lib/letta-agent-admin', () => ({ updateAllUserAgentModels: M.updateAll }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { handleUpdateAllUserModels } from '../update_all_user_models';

const ctx = { request: { json: () => Promise.resolve({ model: 'deepseek-v4' }) } } as never;

function modelsResponse(models: unknown[]) {
  return { ok: true, status: 200, json: () => Promise.resolve(models), text: () => Promise.resolve('') };
}

/**
 * update_all_user_models.ts (173行) — 批量模型切换 action (Round 12 API-12+R47-A-4)。
 *
 * 锁定:
 * - zod 校验失败 → 400 透传
 * - 模型已注册 → 跳过注册直接 Step 2
 * - 未注册 → POST /models/ 注册 (handle=openai-proxy/{model})
 * - Step 2 handle 解析: 优先 openai-proxy/ 前缀
 * - Step 3 批量结果透传 (success=failed===0)
 */
describe('handleUpdateAllUserModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { model: 'deepseek-v4' } });
    M.updateAll.mockResolvedValue({ updated: 10, total: 12, failed: 2, truncated: false });
  });

  it('校验失败 → 400 透传', async () => {
    const bad = new Response(JSON.stringify({ error: 'bad' }), { status: 400 });
    M.validateActionBody.mockReturnValueOnce({ success: false, response: bad });
    const r = await handleUpdateAllUserModels(ctx);
    expect(r.status).toBe(400);
    expect(M.lettaAPI).not.toHaveBeenCalled();
  });

  it('模型已注册 → 跳过注册+handle 优先 openai-proxy 前缀', async () => {
    // /models/ 列表已含目标 (Step 1 探测即命中)
    M.lettaAPI.mockResolvedValueOnce(modelsResponse([
      { handle: 'My_deepseek/deepseek-v4', name: 'deepseek-v4' }, // Step1 命中 (My_deepseek 前缀也算)
    ]));
    // Step 2 查询: 多匹配优先 openai-proxy/
    M.lettaAPI.mockResolvedValueOnce(modelsResponse([
      { handle: 'My_deepseek/deepseek-v4', name: 'deepseek-v4' },
      { handle: 'openai-proxy/deepseek-v4', name: 'deepseek-v4' },
    ]));
    const r = await handleUpdateAllUserModels(ctx);
    const body = JSON.parse(await r.text());
    expect(body.model).toBe('openai-proxy/deepseek-v4'); // 优先前缀
    expect(body.success).toBe(false); // failed=2
    // 注册 POST 从未发生
    const posts = M.lettaAPI.mock.calls.filter((c: unknown[]) => (c[1] as { method?: string } | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('未注册 → POST /models/ 注册+轮询确认', async () => {
    vi.useFakeTimers();
    try {
      M.lettaAPI.mockImplementation((_path: string, init?: { method?: string }) =>
        Promise.resolve(
          init?.method === 'POST'
            ? { ok: true, status: 201, json: () => Promise.resolve({ handle: 'openai-proxy/deepseek-v4' }), text: () => Promise.resolve('') }
            : modelsResponse([]), // GET 始终空 — 轮询走满 5 次
        ),
      );
      M.updateAll.mockResolvedValue({ updated: 5, total: 5, failed: 0, truncated: false });
      const p = handleUpdateAllUserModels(ctx);
      await vi.advanceTimersByTimeAsync(5100); // 推进 5 轮轮询
      const r = await p;
      const body = JSON.parse(await r.text());
      expect(body.success).toBe(true);
      expect(body.logs.some((l: string) => l.includes('registering'))).toBe(true);
      expect(body.logs.some((l: string) => l.includes('may still be registering'))).toBe(true); // 轮询未检出
    } finally {
      vi.useRealTimers();
    }
  });

  it('批量结果 truncated → 警告日志行', async () => {
    M.lettaAPI.mockResolvedValueOnce(modelsResponse([{ handle: 'openai-proxy/deepseek-v4' }]));
    M.lettaAPI.mockResolvedValueOnce(modelsResponse([{ handle: 'openai-proxy/deepseek-v4' }]));
    M.updateAll.mockResolvedValue({ updated: 500, total: 500, failed: 0, truncated: true });
    const r = await handleUpdateAllUserModels(ctx);
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.logs.some((l: string) => l.includes('WARNING') && l.includes('500-agent'))).toBe(true);
  });
});
