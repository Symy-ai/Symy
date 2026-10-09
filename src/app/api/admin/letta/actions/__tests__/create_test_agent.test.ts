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

import { handleCreateTestAgent } from '../create_test_agent';

const ctx = { request: { json: () => Promise.resolve({}) } } as never;

/**
 * create_test_agent.ts (112行) — 模型验证用临时 agent。
 *
 * 锁定:
 * - provider+model 指定: 先注册模型 (失败 → 500+step+hint 排障字段)
 * - agent 创建 body 形状 (name 时间戳/三 memory block/tags/metadata)
 * - 成功 → agent_id; 失败 → 500+detail 截 500
 */
describe('handleCreateTestAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { model: 'letta/auto', embedding: 'openai/text-embedding-3-small' } });
  });

  it('默认参数 → 直接建 agent (跳过模型注册)', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'agent-t1' }) });
    const r = (await handleCreateTestAgent(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.agent_id).toBe('agent-t1');
    // 只一次调用 (无模型注册 POST)
    expect(M.lettaAPI).toHaveBeenCalledTimes(1);
    const createBody = JSON.parse((M.lettaAPI.mock.calls[0][1] as { body: string }).body);
    expect(createBody.model).toBe('letta/auto');
    expect(createBody.memory_blocks).toHaveLength(3);
    expect(createBody.tags).toContain('model-verify');
  });

  it('指定 provider+model: 模型注册失败 → 500+step+hint', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { model: 'm1', embedding: 'e1', provider_id: 'p1', model_name: 'glm-5.2' } });
    M.lettaAPI.mockResolvedValueOnce({ ok: false, status: 422, text: () => Promise.resolve('dup model') });
    const r = (await handleCreateTestAgent(ctx)) as Response;
    expect(r.status).toBe(500);
    const body = JSON.parse(await r.text());
    expect(body.step).toBe('add_model_to_provider');
    expect(body.hint).toContain('Letta dashboard');
    expect(M.lettaAPI).toHaveBeenCalledTimes(1); // 注册失败即止, 不建 agent
  });

  it('模型注册成功 → 继续 agent 创建 (handle=My_deepseek/{model})', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { model: 'm1', embedding: 'e1', provider_id: 'p1', model_name: 'glm-5.2' } });
    M.lettaAPI
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // 注册
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'agent-t2' }) }); // 创建
    const r = (await handleCreateTestAgent(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.agent_id).toBe('agent-t2');
    const regBody = JSON.parse((M.lettaAPI.mock.calls[0][1] as { body: string }).body);
    expect(regBody.handle).toBe('My_deepseek/glm-5.2');
    expect(regBody.provider_name).toBe('My_deepseek');
  });

  it('agent 创建失败 → 500+detail 截 500', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve('x'.repeat(800)) });
    const r = (await handleCreateTestAgent(ctx)) as Response;
    expect(r.status).toBe(500);
    const body = JSON.parse(await r.text());
    expect(body.detail.length).toBeLessThanOrEqual(500);
  });

  it('创建抛错 → 500 catch 降级', async () => {
    M.lettaAPI.mockRejectedValueOnce(new Error('network down'));
    const r = (await handleCreateTestAgent(ctx)) as Response;
    expect(r.status).toBe(500);
    const body = JSON.parse(await r.text());
    expect(body.detail).toContain('network down');
  });
});
