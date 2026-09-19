/**
 * Tests for POST /api/transparency/subscribe — anti-abuse edges (batch87-c)
 *
 * b84-c 测试覆盖了 happy path 与降级阶梯; 本文件钉死公开无鉴权端点的防滥用边界:
 * - supabase fetch 抛错 (非 error field, 网络层 reject) → 外层 catch → 500 通用文案,
 *   原始错误只进日志不回客户端; getErrorMessage 三分支 (Error / {message} / 原始值)
 * - 邮箱长度边界值: 恰 200 字符放行, 201 拒绝; 纯空白 trim 后拒
 * - locale 字段边界: null 拒 (optional ≠ nullable), 大写 'ZH' 拒 (enum 大小写敏感)
 * - 重复 POST 幂等: 连续两次 409 均 success:true; 大小写变体归一后命中同一 unique 键
 * - 限流语义: 配额在 zod 校验前消耗 (垃圾请求也烧配额), 窗口过期重置,
 *   x-forwarded-for 取首段, IP 之间互不影响
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
  // reset (非 clear): mockRejectedValueOnce 队列残留会让 throw 分支泄进后续用例
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

describe('POST /api/transparency/subscribe — upstream throws (catch branch)', () => {
  it('maps a fetch network rejection to the generic 500 and leaks nothing to the client', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const response = await POST(makeRequest({ email: 'a@example.com' }));

    expect(response.status).toBe(500);
    // 区别于上游意外状态的 'Failed to subscribe' — 这是 catch 兜底的通用文案
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    // 原始错误只进日志
    expect(logger.error).toHaveBeenCalledWith('[transparency/subscribe] handler error', {
      message: 'connect ECONNREFUSED 10.0.0.5:5432',
    });
  });

  it('stringifies a non-Error thrown value via the String() fallback', async () => {
    fetchMock.mockRejectedValueOnce('aborted');

    const response = await POST(makeRequest({ email: 'a@example.com' }));

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('[transparency/subscribe] handler error', {
      message: 'aborted',
    });
  });

  it('extracts the message from a thrown non-Error object', async () => {
    fetchMock.mockRejectedValueOnce({ message: 'socket hang up' });

    const response = await POST(makeRequest({ email: 'a@example.com' }));

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('[transparency/subscribe] handler error', {
      message: 'socket hang up',
    });
  });
});

describe('POST /api/transparency/subscribe — zod boundaries', () => {
  it('accepts an email of exactly 200 chars (max boundary) and stores it trimmed', async () => {
    const email200 = `${'a'.repeat(188)}@example.com`;
    expect(email200).toHaveLength(200);

    const response = await POST(makeRequest({ email: email200 }));

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).email).toBe(email200);
  });

  it('rejects an email of 201 chars with the zod 400 contract (error + details array)', async () => {
    const response = await POST(makeRequest({ email: `${'a'.repeat(189)}@example.com` }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; details: unknown[] };
    expect(body.error).toBe('Invalid email format');
    expect(Array.isArray(body.details)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only email (trims to an empty string)', async () => {
    const response = await POST(makeRequest({ email: '   ' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects locale null — optional is not nullable', async () => {
    const response = await POST(makeRequest({ email: 'a@example.com', locale: null }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an uppercase locale — the enum is case-sensitive', async () => {
    const response = await POST(makeRequest({ email: 'a@example.com', locale: 'ZH' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/transparency/subscribe — duplicate POST idempotency', () => {
  it('returns success for every consecutive duplicate, not just the first 409', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 409 }));

    const first = await POST(makeRequest({ email: 'dupe@example.com' }));
    const second = await POST(makeRequest({ email: 'dupe@example.com' }));
    const third = await POST(makeRequest({ email: 'dupe@example.com' }));

    for (const res of [first, second, third]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    }
  });

  it('normalizes case before insert so case variants hit the same unique key (409 → success)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const fresh = await POST(makeRequest({ email: '  MixedCase@Example.COM ' }));
    expect(fresh.status).toBe(200);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    const variant = await POST(makeRequest({ email: 'mixedcase@example.com' }));

    expect(variant.status).toBe(200);
    expect(await variant.json()).toEqual({ success: true });
    // 两次插入体逐字节一致 — DB unique 看到的是同一个归一化邮箱
    const callBody = (i: number) =>
      JSON.parse(String((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body));
    expect(callBody(1)).toEqual(callBody(0));
  });
});

describe('POST /api/transparency/subscribe — rate limit semantics', () => {
  it('burns quota on invalid requests too — garbage flood exhausts the window', async () => {
    const ip = '198.51.100.61';
    for (let i = 0; i < 5; i++) {
      const bad = await POST(makeRequest({ email: 'not-an-email' }, ip));
      expect(bad.status).toBe(400);
    }
    // 配额被 5 个非法请求烧光: 第 6 发即使合法也 429
    const valid = await POST(makeRequest({ email: 'a@example.com' }, ip));
    expect(valid.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the flat 429 body before reaching validation or the database', async () => {
    const ip = '198.51.100.62';
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ email: `u${i}@example.com` }, ip));
    }
    const sixth = await POST(makeRequest('not even an object', ip));

    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: 'Too many requests' });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('keeps IPs independent — an exhausted neighbour IP does not affect a fresh one', async () => {
    const flooded = '198.51.100.63';
    for (let i = 0; i < 6; i++) {
      await POST(makeRequest({ email: `f${i}@example.com` }, flooded));
    }
    const other = await POST(makeRequest({ email: 'fresh@example.com' }, '198.51.100.99'));
    expect(other.status).toBe(200);
  });

  it('rates limits on the first x-forwarded-for hop only, ignoring chain suffixes', async () => {
    const ip = '198.51.100.64';
    for (let i = 0; i < 5; i++) {
      // 链路尾段不同, 首段相同 → 同一桶
      const res = await POST(makeRequest({ email: `h${i}@example.com` }, `${ip}, 10.0.0.${i}`));
      expect(res.status).toBe(200);
    }
    const sixth = await POST(makeRequest({ email: 'h6@example.com' }, `${ip}, 10.0.0.99`));
    expect(sixth.status).toBe(429);
  });

  it('allows the same IP again after the 10-minute window elapses', async () => {
    let now = 1_750_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const ip = '198.51.100.65';
      for (let i = 0; i < 5; i++) {
        await POST(makeRequest({ email: `w${i}@example.com` }, ip));
      }
      expect((await POST(makeRequest({ email: 'w6@example.com' }, ip))).status).toBe(429);

      now += 10 * 60 * 1000 + 1; // 越过 resetAt
      const after = await POST(makeRequest({ email: 'w7@example.com' }, ip));
      expect(after.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
