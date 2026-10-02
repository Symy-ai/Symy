// letta-mcp-manager — 共享 MCP Server 获取/创建（此前 0 测试; letta-http 已有覆盖）
// 核心路径: 已存在(symy-mcp/weme-mcp 兼容名)→复用; 不存在+有secret→创建;
// secret缺失→null; 异常→null(绝不抛, 后台任务语义)。
/* eslint-disable require-await -- Response.json mock 简化 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/env-consumers', () => ({
  warnMissingEnvOnce: vi.fn(),
}));
const lettaAPIMock = vi.fn();
vi.mock('@/lib/letta-http', () => ({
  lettaAPI: (...args: unknown[]) => lettaAPIMock(...args),
  LettaAPIError: class extends Error {},
  getLettaClient: vi.fn(),
}));

import { getOrCreateSharedMCPServer } from '@/lib/letta-mcp-manager';

describe('getOrCreateSharedMCPServer — 共享 MCP Server 管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已存在 symy-mcp → 直接复用 id (零创建调用)', async () => {
    lettaAPIMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'srv-existing', server_name: 'symy-mcp' }],
    });
    const id = await getOrCreateSharedMCPServer();
    expect(id).toBe('srv-existing');
    expect(lettaAPIMock).toHaveBeenCalledTimes(1); // 只有 list, 无 POST
  });

  it('旧名 weme-mcp 也复用 (迁移兼容)', async () => {
    lettaAPIMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'srv-legacy', name: 'weme-mcp' }],
    });
    expect(await getOrCreateSharedMCPServer()).toBe('srv-legacy');
  });

  it('列表非数组(无已有) → 走创建分支 POST 成功返回新 id', async () => {
    // 注意: src/test/setup.ts 全局设 MCP_API_SECRET='test-mcp-secret' — 创建分支会真走
    lettaAPIMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ odd: true }) }) // list 非数组
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'srv-created' }) }); // POST 创建
    expect(await getOrCreateSharedMCPServer()).toBe('srv-created');
    expect(lettaAPIMock).toHaveBeenCalledTimes(2);
    const postCall = lettaAPIMock.mock.calls[1];
    expect(postCall[1]?.method).toBe('POST');
    const body = JSON.parse(postCall[1]?.body);
    expect(body.server_name).toBe('symy-mcp');
    expect(body.config.mcp_server_type).toBe('streamable_http');
  });

  it('list 失败 → null (绝不抛)', async () => {
    lettaAPIMock.mockRejectedValue(new Error('letta down'));
    await expect(getOrCreateSharedMCPServer()).resolves.toBeNull();
  });

  it('ok: false → null', async () => {
    lettaAPIMock.mockResolvedValue({ ok: false, text: async () => '500 err' });
    await expect(getOrCreateSharedMCPServer()).resolves.toBeNull();
  });
});
