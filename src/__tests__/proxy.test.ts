// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  intlMiddleware: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({ default: () => M.intlMiddleware }));
vi.mock('@supabase/ssr', () => ({ createServerClient: M.createServerClient }));
vi.mock('next/server', () => {
  class NextResponseFake {
    status = 200;
    headers = new Map<string, string>();
    cookies = {
      set: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(() => []),
    };
    location?: string;
    constructor(public body?: unknown, public init?: { status?: number; headers?: Record<string, string> }) {
      if (init?.status) this.status = init.status;
    }
    get pathname() { return this.location; }
  }
  const redirect = vi.fn((url: URL | string, status?: number) => {
    const r = new NextResponseFake(null, { status: status ?? 307 });
    r.location = String(url);
    return r;
  });
  const next = vi.fn(() => new NextResponseFake(null, { status: 200 }));
  return { NextResponse: Object.assign(NextResponseFake, { redirect, next }), default: NextResponseFake };
});

import { proxy, config } from '../proxy';
import { NextResponse } from 'next/server';

function makeReq(pathname: string) {
  const url = new URL(`https://symy.ai${pathname}`);
  const nextUrl = Object.assign(url, {
    clone: () => {
      const c = new URL(url.toString());
      return Object.assign(c, { clone: () => c } as object);
    },
  });
  return {
    nextUrl,
    url: url.toString(),
    cookies: { getAll: vi.fn(() => []), set: vi.fn() },
    headers: new Headers(),
  } as unknown as Parameters<typeof proxy>[0];
}

function noSupabaseEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

/**
 * src/proxy.ts (125行) — Next 16 proxy (原 middleware)。
 *
 * 锁定:
 * - /{locale}/api/* → 308 无前缀 API (09-29 监控假绿修复)
 * - /admin+/covenant+/butterfly-demo+/api → 跳过 next-intl (2026-09-22 covenant 事故锚)
 * - Supabase 未配置 → 直接放行 (build 兼容)
 * - 已登录 user 访问 /{locale}/auth/* → 307 回 locale 首页 (callback 例外)
 */
describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noSupabaseEnv();
    M.intlMiddleware.mockReturnValue(new NextResponse(null, { status: 200 }));
  });

  it('/zh/api/health → 308 /api/health (监控假绿修复)', async () => {
    const res = await proxy(makeReq('/zh/api/health'));
    expect(res.status).toBe(308);
  });

  it('/admin 跳过 next-intl (无 locale 注入)', async () => {
    await proxy(makeReq('/admin'));
    expect(M.intlMiddleware).not.toHaveBeenCalled();
  });

  it('/covenant 放行 (2026-09-22 签名 API 事故锚)', async () => {
    await proxy(makeReq('/covenant/sign'));
    expect(M.intlMiddleware).not.toHaveBeenCalled();
  });

  it('/api/* 放行', async () => {
    await proxy(makeReq('/api/chat'));
    expect(M.intlMiddleware).not.toHaveBeenCalled();
  });

  it('localized 路径 → next-intl 执行', async () => {
    M.intlMiddleware.mockReturnValue(new NextResponse(null, { status: 200 }));
    await proxy(makeReq('/zh/dashboard'));
    expect(M.intlMiddleware).toHaveBeenCalled();
  });

  it('next-intl 3xx → 立即透传', async () => {
    const redirectRes = NextResponse.redirect(new URL('https://symy.ai/en'), 307);
    M.intlMiddleware.mockReturnValue(redirectRes);
    const res = await proxy(makeReq('/'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });

  it('Supabase 未配置 → 放行 (build 兼容)', async () => {
    const res = await proxy(makeReq('/zh/dashboard'));
    expect(M.createServerClient).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('已登录访问 /zh/auth/login → 307 回 /zh (callback 例外不跳)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    M.createServerClient.mockReturnValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    });
    const res = await proxy(makeReq('/zh/auth/login'));
    expect(res.status).toBe(307);
    // callback 不重定向
    M.createServerClient.mockReturnValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    });
    const cb = await proxy(makeReq('/zh/auth/callback'));
    expect(cb.status).not.toBe(307);
  });

  it('config matcher 排除静态资源', () => {
    expect(config.matcher[0]).toContain('_next/static');
    expect(config.matcher[0]).toContain('favicon.ico');
  });
});
