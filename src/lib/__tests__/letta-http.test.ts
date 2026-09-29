import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * letta-http 共享层 — R1 回归锁 (arch 审 2026-09-29)
 *
 * 🔒 R1: !ok + throwOnError:false 时返回的 Response body 必须仍可读。
 * 旧实现无条件 await response.text() 做分类日志, 把已消费 body 的 Response
 * 返回给调用方 — admin action 再 .text() 抛 "Body is unusable" TypeError,
 * 结构化错误降级为通用 500。修复 = 读日志前 clone()。
 * 本测试用**真 Response 对象**(非 mock 替身)锁住该契约。
 */

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/env-consumers', () => ({
  warnMissingEnvOnce: vi.fn(),
}));

const globalFetch = vi.fn();
vi.stubGlobal('fetch', globalFetch);

const { lettaAPI } = await import('../letta-http');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LETTA_API_KEY = 'test-key';
});

describe('letta-http R1: throwOnError:false 返回的 Response body 可再读 (admin 旧契约)', () => {
  it('throwOnError:false 显式路径: 404 Response → .ok=false 且 .text() 可读', async () => {
    globalFetch.mockResolvedValueOnce(
      new Response('{"detail": "no such agent"}', { status: 404 }),
    );

    // 共享层 options 扩展: throwOnError:false (admin 契约)
    const res = (await lettaAPI('/agents/agent-y', {
      method: 'GET',
      throwOnError: false,
    })) as Response;

    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    // 🔒 R1 核心: body 未被共享层的分类日志消费掉
    const text = await res.text();
    expect(text).toContain('no such agent');
  });

  it('ok 响应 → .json() 可读 (正常路径不受 clone 影响)', async () => {
    globalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ label: 'persona' }]), { status: 200 }),
    );

    const res = (await lettaAPI('/agents/agent-z/core-memory/blocks', {
      throwOnError: false,
    })) as Response;

    expect(res.ok).toBe(true);
    const blocks = (await res.json()) as Array<{ label: string }>;
    expect(blocks[0].label).toBe('persona');
  });

  it('默认 throwOnError:true: 非 ok 仍 throw LettaAPIError (mcp-manager 契约)', async () => {
    globalFetch.mockResolvedValueOnce(
      new Response('{"detail": "unauthorized"}', { status: 401 }),
    );

    await expect(lettaAPI('/blocks')).rejects.toThrow('Letta API 401');
  });
});
