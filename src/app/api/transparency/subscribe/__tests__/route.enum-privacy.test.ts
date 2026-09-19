/**
 * Tests for POST /api/transparency/subscribe — enumeration & privacy contracts (batch90-b)
 *
 * migration 144 (anon INSERT GRANT) 落地后该端点首次真正面对公网流量; b84-c 测过
 * happy path、b87-c 测过限流与幂等, 本文件钉死三条公开契约:
 * - 防枚举: 同一邮箱首次 (201) 与重复 (409) 的响应 status + 原始 body 逐字节相同,
 *   且成功响应体零邮箱回显 — 探测者拿不到「谁订阅过」的任何信号
 * - 隐私: 全部分支 (201/409/404/意外 status/env 缺失/网络层 throw) 的 logger 调用
 *   参数整体 JSON.stringify 后, 原始邮箱零出现, 出现处必为 maskEmail 形态
 * - 意外上游 status (403 = migration 144 未执行时 42501 permission denied 的实况):
 *   客户端只收通用 500 文案, 上游错误细节 (code/message/hint/表名) 不透传;
 *   服务端日志保留原始 body 供排查, 但邮箱仍脱敏
 * - locale 只以 zh/en 枚举值入库, 插入体键集合钉死 {email, locale} (防指纹字段潜入)
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

function allLoggedJson(): string {
  return JSON.stringify(
    [
      (logger.info as ReturnType<typeof vi.fn>).mock.calls,
      (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      (logger.error as ReturnType<typeof vi.fn>).mock.calls,
    ].flat(),
  );
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

describe('POST /api/transparency/subscribe — anti-enumeration byte parity', () => {
  it('first (201) and duplicate (409) responses are byte-identical in status and raw body', async () => {
    const email = 'probe.a1b2c3@example.com';

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const first = await POST(makeRequest({ email }));

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    const dupe = await POST(makeRequest({ email }));

    expect(first.status).toBe(200);
    // 原始 text 逐字节对比 (强于 b84-c 的解析后 toEqual) — 任何字段差异都算泄漏
    expect(await dupe.text()).toBe(await first.text());
    expect(dupe.status).toBe(first.status);
  });

  it('success bodies carry zero email echo — no @, no local-part marker, no masked form either', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const fresh = await POST(makeRequest({ email: 'probe.a1b2c3@example.com' }));

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    const dupe = await POST(makeRequest({ email: 'probe.a1b2c3@example.com' }));

    for (const res of [fresh, dupe]) {
      const raw = await res.text();
      expect(raw).not.toContain('@');
      expect(raw).not.toContain('probe');
      expect(raw).not.toContain('a1b2c3');
      expect(JSON.parse(raw)).toEqual({ success: true });
    }
  });
});

describe('POST /api/transparency/subscribe — logger never receives the raw email', () => {
  it('sweeps every branch: raw emails absent, masked forms present in the serialized log args', async () => {
    const longLocal = 'postmaster.personal@supabase.co';
    const shortLocal = 'a@x.io';

    // 201 首订 + 409 重复 (info 分支)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    await POST(makeRequest({ email: longLocal }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));
    await POST(makeRequest({ email: longLocal }));

    // 403 意外状态 (error 分支, errorBody 与邮箱同入日志参数)
    fetchMock.mockResolvedValueOnce(new Response('upstream oops', { status: 403 }));
    await POST(makeRequest({ email: shortLocal }));

    // 404 表未建 (warn 分支) + env 缺失 (error 分支, 无 email 参数)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await POST(makeRequest({ email: longLocal }));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await POST(makeRequest({ email: longLocal }));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);

    // 网络层 throw (catch 分支)
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNRESET 2606:4700::6810:85e5'));
    await POST(makeRequest({ email: shortLocal }));

    const logged = allLoggedJson();
    expect(logged).not.toContain(longLocal);
    expect(logged).not.toContain(shortLocal);
    // 出现处必为 maskEmail 形态 (local 前 1-2 字符 + *** + 完整 domain)
    expect(logged).toContain('po***@supabase.co');
    expect(logged).toContain('a***@x.io');
  });

  it('local part is never fully present even when the domain is preserved', async () => {
    await POST(makeRequest({ email: 'victims.list@probe.example' }));

    const logged = allLoggedJson();
    expect(logged).toContain('vi***@probe.example');
    expect(logged).not.toContain('victims.list');
  });
});

describe('POST /api/transparency/subscribe — unexpected upstream status (403)', () => {
  // migration 144 未执行时的实况: anon INSERT 被 42501 拒, PostgREST 回 403 + 细节体
  const upstreamDetail = JSON.stringify({
    code: '42501',
    message: 'permission denied for table transparency_subscribers',
    details: null,
    hint: 'GRANT INSERT ON TABLE transparency_subscribers TO anon',
  });

  it('returns the generic 500 copy with an exact body — no upstream detail passthrough', async () => {
    fetchMock.mockResolvedValueOnce(new Response(upstreamDetail, { status: 403 }));

    const response = await POST(makeRequest({ email: 'attacker@example.com' }));

    expect(response.status).toBe(500);
    // body 只能读一次: 先取原始 text 逐串查, 再解析钉死整个响应形状 (多任何一个透传键都红)
    const raw = await response.text();
    for (const secret of ['42501', 'permission denied', 'GRANT', 'transparency_subscribers', 'hint']) {
      expect(raw).not.toContain(secret);
    }
    expect(JSON.parse(raw)).toEqual({ error: 'Failed to subscribe' });
  });

  it('keeps the upstream body server-side for debugging with the email still masked', async () => {
    fetchMock.mockResolvedValueOnce(new Response(upstreamDetail, { status: 403 }));

    await POST(makeRequest({ email: 'attacker@example.com' }));

    expect(logger.error).toHaveBeenCalledWith('[transparency/subscribe] insert error', {
      status: 403,
      body: upstreamDetail,
      email: 'at***@example.com',
    });
  });

  it('falls back to an empty log body when reading the upstream body itself throws', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 403,
      text: () => Promise.reject(new Error('body stream error')),
    } as unknown as Response);

    const response = await POST(makeRequest({ email: 'attacker@example.com' }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to subscribe' });
    expect(logger.error).toHaveBeenCalledWith('[transparency/subscribe] insert error', {
      status: 403,
      body: '',
      email: 'at***@example.com',
    });
  });
});

describe('POST /api/transparency/subscribe — locale enum & insert payload pinning', () => {
  it('stores only the zh/en enum values verbatim, and the insert body carries exactly {email, locale}', async () => {
    await POST(makeRequest({ email: 'zh.user@example.com', locale: 'zh' }));
    await POST(makeRequest({ email: 'en.user@example.com', locale: 'en' }));

    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)) as { email: string; locale: string },
    );
    expect(bodies.map((b) => b.locale)).toEqual(['zh', 'en']);
    // 键集合钉死: 未来任何指纹字段 (IP/UA/时间戳) 潜入插入体都红
    for (const body of bodies) {
      expect(Object.keys(body).sort()).toEqual(['email', 'locale']);
    }
  });
});
