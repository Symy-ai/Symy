import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env-consumers', () => ({ warnMissingEnvOnce: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: {}, marker: 'client' })),
}));

import { warnMissingEnvOnce } from '@/lib/env-consumers';
import { createBrowserClient } from '@supabase/ssr';

const mockWarn = vi.mocked(warnMissingEnvOnce);
const mockCreate = vi.mocked(createBrowserClient);

/**
 * supabase-browser.ts (39行) — 浏览器单例 client (ARCH Top-10 #4 修复件)。
 *
 * 锁定:
 * - 缺 env → null + warn (类型诚实, 非 null as cast)
 * - 单例: 同模块二次调用同实例 (防 GoTrueClient 多实例)
 * - isSupabaseConfigured 门
 */
describe('supabase-browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  });

  it('缺 env → null + warn (类型诚实锚)', async () => {
    const mod = await import('../supabase-browser');
    expect(mod.createClient()).toBeNull();
    expect(mod.isSupabaseConfigured()).toBe(false);
    expect(mockWarn).toHaveBeenCalledWith('Supabase authenticated client');
  });

  it('有 env → 单例 (二次调用同实例, 防多 GoTrueClient)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJk');
    const mod = await import('../supabase-browser');
    const c1 = mod.createClient();
    const c2 = mod.createClient();
    expect(c1).toBe(c2); // 单例
    expect(mockCreate).toHaveBeenCalledTimes(1); // 只建一次
    expect(mod.isSupabaseConfigured()).toBe(true);
  });
});
