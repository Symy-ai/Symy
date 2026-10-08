import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../_shared', () => ({
  lettaAPI: vi.fn(),
  getMcpServerUrl: vi.fn(() => 'https://mcp.example.com'),
  validateActionBody: vi.fn(),
  NextResponse: {
    json: vi.fn((body: unknown, init?: unknown) => ({ __json: body, __init: init })),
  },
}));
vi.mock('@/lib/letta-agent-admin', () => ({
  updateAllUserAgentModels: vi.fn(),
}));

import { handleUpdateAllUserModels } from '../update_all_user_models';
import { lettaAPI, validateActionBody } from '../_shared';
import { updateAllUserAgentModels } from '@/lib/letta-agent-admin';

const mockLetta = vi.mocked(lettaAPI);
const mockValidate = vi.mocked(validateActionBody);
const mockUpdate = vi.mocked(updateAllUserAgentModels);

const okResp = (json: unknown) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(json), text: () => Promise.resolve(JSON.stringify(json)) }) as never;

/**
 * update_all_user_models.ts (173行) — 模型注册 + 全量 agent 批量更新三步流水线。
 *
 * 锁定:
 * - zod 校验失败 → 400 直返
 * - 模型已存在 → 跳过注册
 * - 模型不存在 → POST /models/ 注册 (openai-proxy handle + provider 三字段)
 * - Step 3 批量更新: result 汇总 + 500-agent 上限警告
 * - success = failed===0
 */
describe('handleUpdateAllUserModels 三步流水线', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({ success: true, data: { model: 'glm-5.2' }, response: null } as never);
  });

  it('zod 校验失败 → 直返 400 response', async () => {
    mockValidate.mockReturnValueOnce({ success: false, response: { status: 400 } } as never);
    const res = await handleUpdateAllUserModels({} as never);
    expect(res).toEqual({ status: 400 });
    expect(mockLetta).not.toHaveBeenCalled();
  });

  it('模型已存在 → 跳过注册直入 Step 2/3', async () => {
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'openai-proxy/glm-5.2' }])); // Step1 list
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'openai-proxy/glm-5.2' }])); // Step2 lookup
    mockUpdate.mockResolvedValueOnce({ updated: 10, total: 10, failed: 0 } as never);
    const res = await handleUpdateAllUserModels({} as never);
    const body = (res as unknown as { __json: { success: boolean; logs: string[] } }).__json;
    expect(body.success).toBe(true);
    expect(body.logs.some((l) => l.includes('already exists'))).toBe(true);
    // 只调了 2 次 letta (list + lookup), 无 POST
    expect(mockLetta).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith('openai-proxy/glm-5.2');
  });

  it('模型不存在 → POST /models/ 注册 (openai-proxy handle)', async () => {
    mockLetta.mockResolvedValueOnce(okResp([])); // Step1 list: 空
    mockLetta.mockResolvedValueOnce(okResp({ id: 'm1' })); // POST /models/
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'openai-proxy/glm-5.2' }])); // poll 1s
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'openai-proxy/glm-5.2' }])); // Step2
    mockUpdate.mockResolvedValueOnce({ updated: 5, total: 6, failed: 1 } as never);
    const res = await handleUpdateAllUserModels({} as never);
    const body = (res as unknown as { __json: { success: boolean } }).__json;
    expect(body.success).toBe(false); // failed=1
    const postCall = mockLetta.mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'POST');
    expect(postCall).toBeTruthy();
    const postBody = JSON.parse((postCall![1] as { body: string }).body);
    expect(postBody).toMatchObject({
      name: 'glm-5.2',
      provider_name: 'My_deepseek',
      handle: 'openai-proxy/glm-5.2',
      model_endpoint: 'https://mcp.example.com/api/v1',
      context_window: 128000,
    });
  });

  it('Step 3: 500-agent 上限 → WARNING 日志', async () => {
    // Step1 命中 (openai-proxy 前缀) → 免注册免 polling
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'openai-proxy/glm-5.2' }]));
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'openai-proxy/glm-5.2' }]));
    mockUpdate.mockResolvedValueOnce({ updated: 500, total: 500, failed: 0, truncated: true } as never);
    const res = await handleUpdateAllUserModels({} as never);
    const body = (res as unknown as { __json: { logs: string[] } }).__json;
    expect(body.logs.some((l) => l.includes('500-agent limit'))).toBe(true);
  });

  it('Step2 无匹配 → 原名透传 updateAll', async () => {
    // Step1 命中免注册; Step2 list 空数组 → 无匹配 → 原名透传
    mockLetta.mockResolvedValueOnce(okResp([{ handle: 'My_deepseek/glm-5.2' }])); // Step1: My_deepseek 前缀也算命中
    mockLetta.mockResolvedValueOnce(okResp([])); // Step2: 空
    mockUpdate.mockResolvedValueOnce({ updated: 0, total: 0, failed: 0 } as never);
    await handleUpdateAllUserModels({} as never);
    expect(mockUpdate).toHaveBeenCalledWith('glm-5.2');
  });
});
