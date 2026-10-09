import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const realFetch = globalThis.fetch;

function makeRequest(ip: string, body: unknown) {
  return {
    headers: new Headers({ 'x-forwarded-for': ip }),
    json: () => Promise.resolve(body),
  } as never;
}

const fetchMock = vi.fn();
let ipCounter = 0;
const nextIp = () => `10.20.${++ipCounter}.1`;

/**
 * waitlist/subscribe route (124行) — 公网候补名单端点 (零鉴权, C1 限流)。
 *
 * 锁定:
 * - 邮箱校验: 坏 JSON/坏格式/超长 → 400
 * - 限流: 同 IP 10min 窗口第 6 次 → 429
 * - 上游映射: 201/409→success; 404→503; 500→500
 * - email 规范化 (trim+lowercase) + source=landing_page
 */
describe('POST /api/waitlist/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sb.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    // 限流 Map 是模块级 — ipCounter 全局单调递增, 跨 it 不复用 IP (防撞 5 次额度)
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('坏 JSON body → 400', async () => {
    const req = {
      headers: new Headers({ 'x-forwarded-for': nextIp() }),
      json: () => Promise.reject(new Error('bad')),
    } as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('坏邮箱格式/超长 → 400 (zod)', async () => {
    expect((await POST(makeRequest(nextIp(), { email: 'not-an-email' }))).status).toBe(400);
    const long = 'a'.repeat(195) + '@x.com';
    expect((await POST(makeRequest(nextIp(), { email: long }))).status).toBe(400);
  });

  it('限流: 同 IP 第 6 次 → 429 (10min/5 次)', async () => {
    const ip = '10.30.0.9';
    for (let i = 0; i < 5; i++) {
      const r = await POST(makeRequest(ip, { email: `u${i}@test.com` }));
      expect(r.status).toBe(200);
    }
    expect((await POST(makeRequest(ip, { email: 'sixth@test.com' }))).status).toBe(429);
  });

  it('201 → success + email 规范化 (lowercase; 空格邮箱被 zod 先拒 — 行为锚定)', async () => {
    // 行为锚定: safeParse 先于 trim — 带空格邮箱 400 (严格但可预期, 前端负责 trim)
    expect((await POST(makeRequest(nextIp(), { email: ' Ok@Test.COM ' }))).status).toBe(400);
    const res = await POST(makeRequest(nextIp(), { email: 'Ok@Test.COM' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const callBody = JSON.parse((fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as { body: string }).body);
    expect(callBody.email).toBe('ok@test.com');
    expect(callBody.source).toBe('landing_page');
  });

  it('409 → 静默 success (重复邮箱幂等)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    const res = await POST(makeRequest(nextIp(), { email: 'dup@test.com' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('404 → 503 (表未建=功能不可用)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await POST(makeRequest(nextIp(), { email: 'ok@test.com' }))).status).toBe(503);
  });

  it('上游 500 → 500', async () => {
    fetchMock.mockResolvedValueOnce(new Response('db down', { status: 500 }));
    expect((await POST(makeRequest(nextIp(), { email: 'ok@test.com' }))).status).toBe(500);
  });

  it('env 缺失 → 500 (fail-fast)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await POST(makeRequest(nextIp(), { email: 'ok@test.com' }))).status).toBe(500);
  });
});
