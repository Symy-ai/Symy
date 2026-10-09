import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureMock = vi.fn();
const flushMock = vi.fn(async () => {});
const warnMock = vi.fn();

vi.mock('posthog-node', () => ({
  PostHog: vi.fn(function MockPostHog(this: unknown, key: string, opts: unknown) {
    (this as { key: string; opts: unknown }).key = key;
    (this as { opts: unknown }).opts = opts;
    (this as unknown as { capture: typeof captureMock }).capture = captureMock;
    (this as unknown as { flush: typeof flushMock }).flush = flushMock;
  }),
}));
vi.mock('@/lib/env-consumers', () => ({ warnMissingEnvOnce: warnMock }));

import { PostHog } from 'posthog-node';

/**
 * posthog-server.ts (75行) — GenAI 可观测性客户端。
 *
 * 锁定:
 * - 单例: 二次调用同实例; flushAt=1/flushInterval=0 (serverless 即冲)
 * - 无 key → null + warnMissingEnvOnce (不炸)
 * - captureLLMGeneration: $ai_generation 事件字段映射 + $ai_provider='letta'
 * - isError → $ai_error 条件注入
 * - capture 抛错 → 静默 (analytics 非关键红线)
 */
describe('getPostHogServer 单例', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it('有 key → 实例 + flushAt=1/flushInterval=0 (serverless 即冲)', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phk_test';
    const dynamic = await import('../posthog-server');
    const c1 = dynamic.getPostHogServer();
    const c2 = dynamic.getPostHogServer();
    expect(c1).toBe(c2); // 单例
    expect(c1).toBeInstanceOf(PostHog);
    const ctorArgs = vi.mocked(PostHog).mock.calls[0];
    expect(ctorArgs[0]).toBe('phk_test');
    expect(ctorArgs[1]).toMatchObject({ flushAt: 1, flushInterval: 0 });
  });

  it('无 key → null + warnMissingEnvOnce 不炸', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const dynamic = await import('../posthog-server');
    expect(dynamic.getPostHogServer()).toBeNull();
    expect(warnMock).toHaveBeenCalledWith('Product analytics');
  });
});

describe('captureLLMGeneration', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phk_test';
    await import('../posthog-server');
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it('$ai_generation 字段映射 + provider=letta + flush', async () => {
    const dynamic = await import('../posthog-server');
    await dynamic.captureLLMGeneration({
      distinctId: 'user-1',
      input: '买键盘?',
      output: '先等 72 小时',
      model: 'glm-4.7',
      latencyMs: 420,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    expect(captureMock).toHaveBeenCalledTimes(1);
    const arg = captureMock.mock.calls[0][0] as Record<string, Record<string, unknown>>;
    expect(arg.distinctId).toBe('user-1');
    expect(arg.event).toBe('$ai_generation');
    expect(arg.properties).toMatchObject({
      $ai_model: 'glm-4.7',
      $ai_latency_ms: 420,
      $ai_input_tokens: 10,
      $ai_total_tokens: 30,
      $ai_provider: 'letta',
    });
    expect(arg.properties).not.toHaveProperty('$ai_error');
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('isError → $ai_error 条件注入', async () => {
    const dynamic = await import('../posthog-server');
    await dynamic.captureLLMGeneration({
      distinctId: 'u', input: 'i', output: 'o', model: 'm', latencyMs: 1,
      isError: true, errorMessage: '503 upstream',
    });
    const arg = captureMock.mock.calls[0][0] as Record<string, Record<string, unknown>>;
    expect(arg.properties).toMatchObject({ $ai_error: '503 upstream' });
  });

  it('capture 抛错 → 静默不炸 (analytics 非关键红线)', async () => {
    captureMock.mockImplementation(() => {
      throw new Error('posthog down');
    });
    const dynamic = await import('../posthog-server');
    await expect(
      dynamic.captureLLMGeneration({ distinctId: 'u', input: 'i', output: 'o', model: 'm', latencyMs: 1 }),
    ).resolves.toBeUndefined();
  });
});
