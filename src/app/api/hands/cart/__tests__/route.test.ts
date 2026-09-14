/**
 * Integration-ish tests for POST /api/hands/cart — 真契约接线:
 * mock fetch 断言 tools/call 发的是 symy_cart + context 组装,
 * 并验证 MCP envelope 在 route 层解包后直返前端。
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authGetUser = vi.fn();

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [] as Array<{ name: string; value: string }> })),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: authGetUser } })),
}));

import { POST } from '../route';

const upstreamEnvelope = (inner: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'up-1',
      result: { content: [{ type: 'text', text: JSON.stringify({ trace_id: 't', ...inner }) }] },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/hands/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'zh-CN,zh;q=0.9' },
    body: JSON.stringify(body),
  });
}

describe('/api/hands/cart', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SYMY_HANDS_SECRET', 'secret');
    authGetUser.mockReset();
    authGetUser.mockResolvedValue({ data: { user: { id: 'a1b2c3d4e5f67890' } }, error: null });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 401 without login', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(makeRequest({ action: 'list' }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid body, 503 without secret', async () => {
    expect((await POST(makeRequest({ action: 'checkout' }))).status).toBe(400);

    vi.stubEnv('SYMY_HANDS_SECRET', '');
    expect((await POST(makeRequest({ action: 'list' }))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls symy_cart with contract-shaped arguments and returns the unwrapped payload', async () => {
    fetchMock.mockResolvedValueOnce(upstreamEnvelope({
      ok: true,
      data: { cart_lines: [{ product_ref: 'p1', qty: 1 }], cart_total_cents: 32800 },
    }));

    const res = await POST(makeRequest({ action: 'list' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.cart_total_cents).toBe(32800);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hands.symy.ai/mcp/');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    const rpcBody = JSON.parse(String(init.body));
    expect(rpcBody.method).toBe('tools/call');
    expect(rpcBody.params.name).toBe('symy_cart');
    expect(rpcBody.params.arguments).toMatchObject({
      action: 'list',
      context: {
        user_ref: 'a1b2c3d4e5f67890',
        session_ref: 'web-a1b2c3d4',
        lang: 'zh',
        currency: 'CNY',
      },
    });
  });

  it('forwards remove item as a top-level arguments field (qty 0)', async () => {
    fetchMock.mockResolvedValueOnce(upstreamEnvelope({ ok: true, data: { cart_lines: [] } }));

    await POST(makeRequest({ action: 'remove', item: { product_ref: 'p9', qty: 0 } }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const rpcBody = JSON.parse(String(init.body));
    expect(rpcBody.params.arguments.item).toEqual({ product_ref: 'p9', qty: 0 });
  });

  it('propagates a business-level ok:false to the client with 200', async () => {
    fetchMock.mockResolvedValueOnce(upstreamEnvelope({ ok: false, error: 'cart locked' }));

    const res = await POST(makeRequest({ action: 'list' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'cart locked' });
  });

  it('returns 502 when upstream is down', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 503 }));

    const res = await POST(makeRequest({ action: 'list' }));
    expect(res.status).toBe(502);
  });
});
