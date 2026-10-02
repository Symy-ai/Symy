// supabase-api — 认证客户端工厂（此前 0 测试）
// 契约: env缺失→null+error不炸; 有效请求→user+mergeCookies链;
// getUser失败→error; json helper 全分支可调(Round 123)。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'u-1', email: 't@x.com' } },
        error: null,
      }),
    },
  })),
}));

import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(cookieHeader = '') {
  return new NextRequest('http://localhost/api/test', {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe('createAuthenticatedClient — 认证客户端工厂', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('env 齐全 + getUser 成功 → user 注入', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    const { user, error, supabase, json } = await createAuthenticatedClient(makeRequest());
    expect(user?.id).toBe('u-1');
    expect(error).toBeNull();
    expect(supabase).not.toBeNull();
    expect(typeof json).toBe('function'); // Round 123: 全分支可调
  });

  it('env 缺失 → supabase null + 明确 error (不炸)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const { supabase, user, error, json } = await createAuthenticatedClient(makeRequest());
    expect(supabase).toBeNull();
    expect(user).toBeNull();
    expect(error).toContain('not configured');
    expect(typeof json).toBe('function'); // error 分支 json 也可用
  });

  it('publishable key 新版命名也接受', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_xxx');
    const { supabase } = await createAuthenticatedClient(makeRequest());
    expect(supabase).not.toBeNull();
  });

  it('mergeCookies 直通 Response (cookie 刷新链)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    const { mergeCookies, json } = await createAuthenticatedClient(makeRequest());
    const res = json({ ok: true });
    const merged = mergeCookies(res);
    expect(merged).toBe(res); // 无 pendingCookies 时直通
  });
});
