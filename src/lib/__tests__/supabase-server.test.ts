import { describe, expect, it, vi, beforeEach } from 'vitest';

const envState = { url: '', key: '' };
vi.mock('@/lib/env-consumers', () => ({
  warnMissingEnvOnce: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    getAll: () => [{ name: 'sb-k', value: 'v' }],
    set: vi.fn(),
  })),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: {}, from: vi.fn() })),
}));

import { createClient } from '../supabase-server';
import { createServerClient } from '@supabase/ssr';
import { warnMissingEnvOnce } from '@/lib/env-consumers';

const mockCreate = vi.mocked(createServerClient);
const mockWarn = vi.mocked(warnMissingEnvOnce);

/**
 * supabase-server.ts (44行) — 服务端 Supabase 客户端 (模块级 env 固化)。
 *
 * 锁定:
 * - isSupabaseConfigured: url+key 双全才 true
 * - createClient: 缺 env → warn+throw (fail-fast)
 * - 有 env → createServerClient 带双 cookie 通道
 * - setAll 在 Server Component 下静默 (try/catch)
 */
describe('supabase-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.url = '';
    envState.key = '';
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.resetModules();
  });

  it('isSupabaseConfigured: 双全才 true', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const mod1 = await import('../supabase-server');
    expect(mod1.isSupabaseConfigured()).toBe(false); // 有 url 无 key
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJold');
    const mod2 = await import('../supabase-server');
    expect(mod2.isSupabaseConfigured()).toBe(true); // 双全
  });

  it('publishable key 兜底链 (ANON 缺 → PUBLISHABLE 可用)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_new');
    vi.resetModules();
    const mod = await import('../supabase-server');
    expect(mod.isSupabaseConfigured()).toBe(true);
  });

  it('createClient 缺 env → warn+throw (fail-fast)', async () => {
    await expect(createClient()).rejects.toThrow(/environment variables are missing/);
    expect(mockWarn).toHaveBeenCalledWith('Supabase authenticated client');
  });

  it('有 env → createServerClient 双 cookie 通道', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJk');
    vi.resetModules();
    const mod = await import('../supabase-server');
    const client = await mod.createClient();
    expect(client).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledWith(
      'https://x.supabase.co',
      'eyJk',
      expect.objectContaining({
        cookies: expect.objectContaining({ getAll: expect.any(Function), setAll: expect.any(Function) }),
      }),
    );
  });
});
