/**
 * Tests for POST /api/transparency/subscribe (batch84-c)
 *
 * - zod 边界: 缺 email / 非法 email / >200 字符 / locale 非法值 / 非 JSON / 非对象体 → 400
 * - 成功: 201 → success:true, 插入体 = 小写 trim 邮箱 + locale (缺省 en)
 * - 防枚举: 409 (unique 冲突) 与 201 返回体逐字节一致
 * - 降级: 表未建 (PostgREST 404) → 503; 上游 5xx → 500; env 缺失 → 500
 * - 限流: 同 IP 10 分钟窗口第 6 发 → 429
 * - 隐私: 日志永不出现明文邮箱 (只允许脱敏形态)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { logger } from '@/lib/logger';

const SUPABASE_URL = 'https://stub.supabase.co';

const fetchMock = vi.fn<typeof fetch>();

// 限流 Map 是模块级状态: 每个测试用独立 IP, 避免互相消耗 10 分钟窗口配额
let ipCounter = 0;

function makeRequest(body: unknown, ip?: string): NextRequest {
  return new NextRequest('http://localhost/api/transparency/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip ?? `203.0.113.${++ipCounter}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  // reset (非 clear): mockResolvedValueOnce 队列残留会让降级分支泄进后续用例
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-stub');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/transparency/subscribe — validation', () => {
  it.each([
    ['missing email', {}],
    ['invalid email', { email: 'not-an-email' }],
    ['email over 200 chars', { email: `${'a'.repeat(190)}@example.com` }],
    ['invalid locale', { email: 'a@example.com', locale: 'fr' }],
  ])('rejects %s with 400', async (_name, body) => {
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body with 400', async () => {
    const response = await POST(makeRequest('{not json'));
    expect(response.status).toBe(400);
  });

  it('rejects a non-object body with 400', async () => {
    const response = await POST(makeRequest('just a string'));
    expect(response.status).toBe(400);
  });
});

describe('POST /api/transparency/subscribe — success', () => {
  it('inserts the lowercased trimmed email with the given locale on 201', async () => {
    const response = await POST(makeRequest({ email: '  User@Example.COM ', locale: 'zh' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/transparency_subscribers`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'user@example.com', locale: 'zh' });
  });

  it('falls back to the app default locale when omitted', async () => {
    await POST(makeRequest({ email: 'a@example.com' }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).locale).toBe('en');
  });
});

describe('POST /api/transparency/subscribe — anti-enumeration', () => {
  it('returns the exact same body for a duplicate email (409) as for a fresh one (201)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const fresh = await POST(makeRequest({ email: 'dupe@example.com' }));
    const freshBody = await fresh.json();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    const dupe = await POST(makeRequest({ email: 'dupe@example.com' }));

    expect(dupe.status).toBe(200);
    expect(await dupe.json()).toEqual(freshBody);
  });
});

describe('POST /api/transparency/subscribe — degradation ladder', () => {
  it('maps a missing table (PostgREST 404) to 503 so the UI can show "coming soon"', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'PGRST205' }), { status: 404 }),
    );
    const response = await POST(makeRequest({ email: 'a@example.com' }));
    expect(response.status).toBe(503);
  });

  it('maps unexpected upstream errors to 500', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const response = await POST(makeRequest({ email: 'a@example.com' }));
    expect(response.status).toBe(500);
  });

  it('returns 500 when Supabase env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const response = await POST(makeRequest({ email: 'a@example.com' }));
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/transparency/subscribe — rate limit', () => {
  it('rejects the 6th request from the same IP within the window with 429', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest({ email: `u${i}@example.com` }, ip));
      expect(ok.status).toBe(200);
    }
    const sixth = await POST(makeRequest({ email: 'u6@example.com' }, ip));
    expect(sixth.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe('POST /api/transparency/subscribe — email privacy', () => {
  it('never logs the plaintext email', async () => {
    await POST(makeRequest({ email: 'secret.person@example.com' }));

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    await POST(makeRequest({ email: 'secret.person@example.com' }));

    fetchMock.mockResolvedValueOnce(new Response('err', { status: 500 }));
    await POST(makeRequest({ email: 'secret.person@example.com' }));

    const logged = JSON.stringify(
      [
        (logger.info as ReturnType<typeof vi.fn>).mock.calls,
        (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
        (logger.error as ReturnType<typeof vi.fn>).mock.calls,
      ].flat(),
    );
    expect(logged).not.toContain('secret.person@example.com');
    expect(logged).toContain('se***@example.com');
  });
});
