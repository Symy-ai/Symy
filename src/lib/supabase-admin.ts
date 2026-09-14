import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * 服务端 Admin Supabase 客户端
 *
 * 使用 Secret Key（新版 sb_secret_...）或 Service Role Key（旧版 eyJ...）
 * 创建绕过 RLS 的 admin 客户端。
 *
 * Supabase 2025 迁移指南：
 * - 新版 Secret Key: sb_secret_...  （替代旧版 admin service key）
 * - 新版 Publishable Key: sb_publishable_...（替代旧版 anon key）
 * - 两种格式都可以直接传给 createClient(url, key)
 * - 参考: https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// 支持新版 Secret Key (sb_secret_...) 和旧版 Service Role Key (eyJ...)
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||  // 新版: sb_secret_xxx  /  旧版: eyJ...
  process.env.SUPABASE_SECRET_KEY ||        // 也支持这个变量名
  '';

export interface AdminClientResult {
  supabase: SupabaseClient<Database> | null;
  error: string | null;
}

/**
 * 获取配置缺失的诊断信息
 */
export function getSupabaseAdminDiagnostics(): { urlSet: boolean; keySet: boolean; keyFormat: 'none' | 'legacy' | 'new' } {
  const keyFormat = !SUPABASE_SECRET_KEY
    ? 'none' as const
    : SUPABASE_SECRET_KEY.startsWith('sb_secret_')
      ? 'new' as const
      : 'legacy' as const;

  return {
    urlSet: !!SUPABASE_URL,
    keySet: !!SUPABASE_SECRET_KEY,
    keyFormat,
  };
}

/**
 * 创建 Admin Supabase 客户端（绕过 RLS）
 *
 * 同时支持：
 * - 新版 Secret Key (sb_secret_...)  ← Supabase 2025 推荐
 * - 旧版 Service Role Key (eyJ...)    ← 向后兼容
 *
 * 🔧 2026-07-15 (ARCH-4 #12 修复): Singleton — 之前每次调用创建新 client (~80 call sites)
 *    每个 createClient 会建立新的 HTTP 连接池 + auth state, 浪费内存 + 连接
 *    修复: 模块级缓存, 同一进程内复用同一 client (admin service key 不会变)
 *
 * 用法：
 *   const { supabase, error } = createAdminClient();
 *   if (error || !supabase) return errorResponse(error);
 *   // ... 操作数据 ...
 */

// 🔧 2026-07-15: Singleton cache — 避免每次调用创建新 client
let _cachedAdminClient: SupabaseClient<Database> | null = null;
let _adminClientError: string | null = null;

export function createAdminClient(): AdminClientResult {
  // 返回缓存的 client (如果已创建)
  if (_cachedAdminClient) {
    return { supabase: _cachedAdminClient, error: null };
  }
  if (_adminClientError) {
    return { supabase: null, error: _adminClientError };
  }

  if (!SUPABASE_URL) {
    _adminClientError = 'Missing NEXT_PUBLIC_SUPABASE_URL. Set it in Vercel Environment Variables.';
    return { supabase: null, error: _adminClientError };
  }

  if (!SUPABASE_SECRET_KEY) {
    _adminClientError = 'Missing SUPABASE_SERVICE_ROLE_KEY (new: sb_secret_... or legacy: eyJ...). Set it in Vercel Environment Variables.';
    return { supabase: null, error: _adminClientError };
  }

  _cachedAdminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,  // 关键：禁用 session 持久化，确保 secret key 绕过 RLS
      autoRefreshToken: false, // Admin 客户端不需要 token 刷新
      detectSessionInUrl: false,
    },
  });
  return { supabase: _cachedAdminClient, error: null };
}

