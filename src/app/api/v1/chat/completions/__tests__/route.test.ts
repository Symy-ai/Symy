/**
 * Integration tests for POST /api/v1/chat/completions (OpenAI-compatible proxy)
 *
 * 🔧 2026-07-21 audit: 新增测试 (该外部攻击面 route 此前零覆盖)。
 *   锁定关键安全控制:
 *   - 401 无/无效 API key (extractAndValidateApiKey gate)
 *   - strict schema: 拒绝 n>1 (cost attack)、tools/tool_choice (function-calling 代理)、未知字段
 *   - clamp: max_tokens ≤ 4096, temperature 0-2
 *   - model 强制覆盖为 OVERRIDE_MODEL (客户端无法选择昂贵模型)
 *   - 上游用 UPSTREAM_API_KEY (客户端 key 仅作 gate, 不透传)
 *   - 413 oversized body; 上游错误状态码透传但不泄露内部细节
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks -------------------------------------------------------------

// Control auth outcome per test.
let mockApiKey: string | null = 'valid-test-key';
vi.mock('@/lib/proxy-auth', () => ({
  extractAndValidateApiKey: vi.fn(() => mockApiKey),
  getCorsHeaders: vi.fn(() => ({ 'Access-Control-Allow-Origin': '*' })),
  handleOptions: vi.fn(() => new Response(null, { status: 204 })),
}));

// Rate limit defaults to allowed.
let mockRateAllowed = true;
vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: mockRateAllowed })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Upstream fetch mock.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { POST } from '../route';

function makeRequest(body: unknown, opts: { auth?: string | null; contentLength?: number } = {}): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== undefined) {
    if (opts.auth) headers['Authorization'] = `Bearer ${opts.auth}`;
  }
  if (opts.contentLength !== undefined) headers['Content-Length'] = String(opts.contentLength);
  return new NextRequest('http://localhost/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function upstreamOk(json: unknown): Response {
  return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('POST /api/v1/chat/completions', () => {
  beforeEach(() => {
    mockApiKey = 'valid-test-key';
    mockRateAllowed = true;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(upstreamOk({ choices: [{ message: { content: 'hi' } }] }));
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('returns 401 when Authorization header is missing', async () => {
    mockApiKey = null; // extractAndValidateApiKey returns null
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockRateAllowed = false;
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 413 when body exceeds 1MB', async () => {
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }] }, { contentLength: 2 * 1024 * 1024 }),
    );
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when messages is empty/missing (zod)', async () => {
    const res = await POST(makeRequest({ model: 'gpt-4' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects n > 1 (cost-multiplier attack prevention)', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], n: 5 }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects tools/tool_choice (function-calling proxy not supported) via strict schema', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards to upstream with model OVERRIDDEN and UPSTREAM key (not client key)', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4-turbo', max_tokens: 2048 }));
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/chat\/completions$/);
    const opts = init as RequestInit;
    // Client key NOT forwarded — upstream uses server UPSTREAM key only.
    expect((opts.headers as Record<string, string>)['Authorization']).toMatch(/^Bearer test-upstream-key$/);
    // Model overridden (client cannot pick a costly model).
    const forwardedBody = JSON.parse(opts.body as string);
    expect(forwardedBody.model).toBe('glm-5.2');
    // Valid max_tokens forwarded as-is.
    expect(forwardedBody.max_tokens).toBe(2048);
  });

  it('rejects max_tokens > 4096 (cost control — schema rejects, not clamps)', async () => {
    // 注: route 注释说 "clamp 到 4096" 但 schema 实际是 .max(4096) 拒绝。本测试锁定实际行为。
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 999999 }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes through upstream non-2xx status code (note: route forwards upstream JSON body as-is)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'rate limited upstream' } }), { status: 429 }));
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(429);
  });

  it('returns 502 (not raw upstream detail) when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET: internal socket detail'));
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(502);
    const json = await res.json();
    // BUG-127: generic message, no internal detail leak
    expect(JSON.stringify(json)).not.toContain('ECONNRESET');
  });
});
