/* eslint-disable require-await -- fetch mock 简化 */
// admin/embeddings/test — 向量连通性诊断（此前 0 测试）
// 契约: admin鉴权/key只暴露configured|(empty)状态(Round 22 M6
// 不泄露key内容)/无key→500/model关键词过滤/非JSON降级。
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdminAuthMock = vi.fn();
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: (...a: unknown[]) => verifyAdminAuthMock(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// 模块顶层固化 env 常量 → 必须动态 import (每个测试按需 env 后加载)
async function loadRoute() {
  const mod = await import('../route');
  return mod.GET;
}

function req(q = '') {
  return new NextRequest('http://localhost/api/admin/embeddings/test' + (q ? '?' + q : ''));
}

describe('GET /api/admin/embeddings/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    process.env.EMBEDDING_API_KEY = 'sk-test-key-1234567890abcdef';
    process.env.EMBEDDING_API_BASE = 'https://embed.example.com/api/paas/v4';
  });
  afterEach(() => {
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_API_BASE;
  });

  it('非 admin → 403', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const GET = await loadRoute();
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('key 状态只报 configured|(empty) — 响应不含key内容 (M6)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.1, 0.2], model: 'embedding-3' }] }),
      text: async () => JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
    }) as unknown as typeof fetch;
    const GET = await loadRoute();
    const res = await GET(req());
    const body = await res.json();
    expect(body.config.apiKeyStatus).toBe('configured');
    expect(JSON.stringify(body)).not.toContain('sk-test-key');
  });

  it('无 key → 500 且 apiKeyStatus=(empty)', async () => {
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.AGNES_API_KEY;
    vi.resetModules(); // 顶层常量固化 → 必须重载模块
    const GET = (await import('../route')).GET;
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.config.apiKeyStatus).toBe('(empty)');
  });

  it('action=list: embedding 关键词过滤', async () => {
    vi.resetModules();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ data: [{ id: 'glm-5.2' }, { id: 'embedding-3' }, { id: 'bge-large' }, { id: 'chat-x' }] }),
    }) as unknown as typeof fetch;
    const GET = (await import('../route')).GET;
    const res = await GET(req('action=list'));
    const body = await res.json();
    expect(body.totalModels).toBe(4);
    expect(body.embeddingModels).toEqual(['embedding-3', 'bge-large']);
  });

  it('list 非 JSON 响应 → 500 rawBody', async () => {
    vi.resetModules();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<html>gateway error</html>',
    }) as unknown as typeof fetch;
    const GET = (await import('../route')).GET;
    const res = await GET(req('action=list'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not JSON');
  });
});
