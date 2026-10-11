import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * 服务端读取用户时薪 (用于 AI chat context 注入)
 *
 * 用 admin client 绕过 RLS (chat route 已认证用户, 但 supabase 客户端可能受限)。
 * 失败时返回默认值 $25/hr (DEFAULT_HOURLY_RATE, freedom-time SSOT)。
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { logger } from '@/lib/logger';

/**
 * 读取用户时薪 — 用于 AI chat context (Freedom Translation)
 *
 * 永不抛错 — 失败返回 DEFAULT_HOURLY_RATE (25)。
 *
 * @param userId 用户 UUID
 * @returns 时薪 (默认 25)
 */
export async function getUserHourlyRate(userId: string): Promise<number> {
  const { supabase, error } = createAdminClient();
  if (error || !supabase) {
    logger.warn('[getUserHourlyRate] Admin client not configured, using default:', error);
    return DEFAULT_HOURLY_RATE;
  }

  try {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('hourly_rate')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      // Column might not exist (migration not run yet) — fail safe with default
      logger.warn('[getUserHourlyRate] Profile fetch failed (column may not exist):', profileError.message);
      return DEFAULT_HOURLY_RATE;
    }

    const rate = typeof data?.hourly_rate === 'number' && data.hourly_rate > 0
      ? data.hourly_rate
      : DEFAULT_HOURLY_RATE;
    return rate;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[getUserHourlyRate] Unexpected error, using default:', err);
    return DEFAULT_HOURLY_RATE;
  }
}
