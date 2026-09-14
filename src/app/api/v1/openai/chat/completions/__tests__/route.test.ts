/**
 * Integration tests for POST /api/v1/openai/chat/completions (OpenAI alias proxy)
 *
 * 🔧 2026-07-21 audit: 新增测试 (该外部 route 此前零覆盖)。
 *   锁定 2026-07-21 从 /api/v1/chat/completions 移植的安全加固:
 *   - rate limit (30/hour, 此前缺失)
 *   - strict schema (拒绝 n>1 / max_tokens>4096 / tools, 此前用 passthrough 放行)
 *   - model override + 客户端 key 不透传上游
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

let mockApiKey: string | null = 'valid-test-key';
vi.mock('@/lib/proxy-auth', () => ({
  extractAndValidateApiKey: vi.fn(() => mockApiKey),
  getCorsHeaders: vi.fn(() => ({ 'Access-Control-Allow-Origin': '*' })),
  handleOptions: vi.fn(() => new Response(null, { status: 204 })),
}));

let mockRateAllowed = true;
vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: mockRateAllowed })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { POST } from '../route';

function makeRequest(body: unknown, opts: { contentLength?: number } = {}): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer valid-test-key',
  };
  if (opts.contentLength !== undefined) headers['Content-Length'] = String(opts.contentLength);
  return new NextRequest('http://localhost/api/v1/openai/chat/completions', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

function upstreamOk(json: unknown): Response {
  return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('POST /api/v1/openai/chat/completions', () => {
  beforeEach(() => {
    mockApiKey = 'valid-test-key';
    mockRateAllowed = true;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(upstreamOk({ choices: [{ message: { content: 'hi' } }] }));
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('returns 401 when Authorization is missing', async () => {
    mockApiKey = null;
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded (2026-07-21 ported hardening)', async () => {
    mockRateAllowed = false;
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 413 when body exceeds 1MB', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }, { contentLength: 2 * 1024 * 1024 }));
    expect(res.status).toBe(413);
  });

  it('rejects n > 1 (cost-multiplier attack — 2026-07-21 strict schema)', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], n: 5 }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects max_tokens > 4096 (cost control)', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 999999 }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown fields via strict schema (e.g. tools)', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is missing (zod)', async () => {
    const res = await POST(makeRequest({ model: 'gpt-4' }));
    expect(res.status).toBe(400);
  });

  it('overrides model and forwards with server UPSTREAM key (not client key)', async () => {
    const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4-turbo' }));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    const opts = init as RequestInit;
    expect((opts.headers as Record<string, string>)['Authorization']).toMatch(/^Bearer test-upstream-key$/);
    const forwarded = JSON.parse(opts.body as string);
    expect(forwarded.model).toBe('glm-5.2');
  });
});
