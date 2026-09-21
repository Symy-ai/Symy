import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { warnMissingEnvOnce } from '@/lib/env-consumers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 🔧 ARCH fix (Top-10 #4 — null as unknown as SupabaseClient):
//    旧代码返回 `null as unknown as SupabaseClient` — 类型撒谎, 调用方不知道可能拿到 null。
//    根因修复: 返回 `SupabaseClient | null`, 调用方必须用 isSupabaseConfigured() 或 null check。
//    所有调用方已用 `const configured = isSupabaseConfigured(); const client = configured ? createClient() : null`
//    模式, 所以类型修正不会破坏现有代码。
type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

/**
 * Singleton browser client — must only create ONE instance per browser context,
 * otherwise Supabase Auth warns "Multiple GoTrueClient instances detected"
 * and sign-out may only clear one instance's session.
 *
 * @returns Supabase client, or null if env vars are missing (build time / misconfigured)
 */
let _browserClient: SupabaseBrowserClient | null = null;

export function createClient(): SupabaseBrowserClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    // During build time or when env vars are missing, return null
    // This prevents build failures when Vercel prerenders static pages
    warnMissingEnvOnce('Supabase authenticated client');
    return null;
  }
  if (!_browserClient) {
    _browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return _browserClient;
}

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}
