// email/resync — 重同步入口契约（此前 0 测试, 530行大文件锁入口）
// 契约: 认证401/分布式锁429/锁TTL=180s(R19-H-7)/daysBack clamp 1-90。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const acquireLockMock = vi.fn();
const releaseLockMock = vi.fn();
vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: (...a: unknown[]) => acquireLockMock(...a),
  releaseLock: (...a: unknown[]) => releaseLockMock(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let authResult: { supabase: unknown; user: { id: string } | null; error: string | null; mergeCookies: <T extends NextResponse>(r: T) => T };
vi.mock('@/lib/supabase-api', () => ({
  // eslint-disable-next-line require-await -- 直返 mock
  createAuthenticatedClient: async () => authResult,
}));

// 可控深链 supabase: email_connections 表按 scenario 返回, 其余自愈 Proxy (imap-connect 模板)
let connectionsPayload: { data: unknown; error: unknown } = { data: [], error: null };
const proxySupabase = {
  from: vi.fn((table: string) => {
    if (table === 'email_connections') {
      const terminal = Promise.resolve(connectionsPayload);
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return terminal.then.bind(terminal);
          return () => proxy;
        },
      });
      return proxy;
    }
    const terminal = Promise.resolve({ data: null, error: null });
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return terminal.then.bind(terminal);
        return () => proxy;
      },
    });
    return proxy;
  }),
};

import { POST } from '../route';

function req(body: unknown = {}) {
  return new NextRequest('http://localhost/api/email/resync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/email/resync — 入口契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionsPayload = { data: [], error: null };
    acquireLockMock.mockResolvedValue(true);
    authResult = {
      supabase: proxySupabase,
      user: { id: 'u-1' },
      error: null,
      mergeCookies: (r) => r,
    };
  });

  it('未认证 → 401', async () => {
    authResult = { supabase: null, user: null, error: 'no auth', mergeCookies: (r) => r };
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('锁被占 → 429 带 receipts:[] scanned:0 (前端可解析)', async () => {
    acquireLockMock.mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.receipts).toEqual([]);
    expect(body.scanned).toBe(0);
  });

  it('锁参数: email-resync:{uid} + 180s TTL (R19-H-7) + failClosed', async () => {
    await POST(req()).catch(() => {});
    expect(acquireLockMock).toHaveBeenCalledWith('email-resync:u-1', 180_000, true);
  });

  it('daysBack 越界(500) → zod 400 拒绝 (BUG-114 DoS 防护)', async () => {
    const res = await POST(req({ daysBack: 500 }));
    expect(res.status).toBe(400);
  });

  it('无 active 连接 → 400 提示先连邮箱 (ARCH Round 11 H5: 200→400)', async () => {
    connectionsPayload = { data: [], error: null };
    const res = await POST(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No active email connection');
  });

  it('OAuth 连接 → 400 指引走 /api/email/scan (resync 只管 IMAP)', async () => {
    connectionsPayload = { data: [{ id: 'c1', user_id: 'u-1', email_address: 'a@gmail.com', provider: 'google', access_token: 'tok', refresh_token: 'r', token_expiry: null, scopes: null, status: 'active', last_sync_at: null, last_history_id: null }], error: null };
    const res = await POST(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('/api/email/scan');
  });

  it('IMAP 凭证缺失 → 500 服务端问题 (解密失败非用户错, ARCH Round 11 H5)', async () => {
    connectionsPayload = { data: [{ id: 'c1', user_id: 'u-1', email_address: null, provider: 'imap_qq', access_token: null, refresh_token: null, token_expiry: null, scopes: null, status: 'active', last_sync_at: null, last_history_id: null }], error: null };
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('credentials incomplete or decryption failed');
  });

  it('不支持的邮箱 provider → 400 明示 unsupported (detectIMAPProvider 白名单)', async () => {
    connectionsPayload = { data: [{ id: 'c1', user_id: 'u-1', email_address: 'user@unknown-mail.example', provider: 'imap_unknown', access_token: 'tok', refresh_token: null, token_expiry: null, scopes: null, status: 'active', last_sync_at: null, last_history_id: null }], error: null };
    const res = await POST(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unsupported email provider');
  });
});
