/**
 * create-weekly-challenges helper — 共享的挑战创建逻辑
 *
 * 🔧 Round 107: 抽取 fallback 逻辑, 避免两个 route 重复代码
 *
 * 策略:
 * 1. 先尝试新签名 create_weekly_challenges(p_week_offset)
 * 2. 如果 migration 100 未应用 (签名不匹配), fallback:
 *    - weekOffset=0: 尝试旧签名 create_weekly_challenges()
 *    - weekOffset≠0: 直接 INSERT 指定周的挑战
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';

export interface CreateChallengesResult {
  success: boolean;
  usedFallback: boolean;
  error?: string;
}

export async function createWeeklyChallengesWithFallback(
  supabase: SupabaseClient<Database>,
  weekOffset: number,
): Promise<CreateChallengesResult> {
  // 1. 先尝试新签名 create_weekly_challenges(p_week_offset)
  const { error: rpcError } = await supabase.rpc('create_weekly_challenges', {
    p_week_offset: weekOffset,
  });

  if (!rpcError) {
    return { success: true, usedFallback: false };
  }

  // 2. 检查是否是函数签名不匹配 (migration 100 未应用)
  const isSignatureMismatch = rpcError.message.includes('Could not find the function')
    || rpcError.message.includes('p_week_offset');

  if (!isSignatureMismatch) {
    // 其他错误, 直接返回
    return { success: false, usedFallback: false, error: rpcError.message };
  }

  logger.warn('[Admin] create_weekly_challenges(p_week_offset) not available, using fallback');

  // 3. Fallback: weekOffset=0 → 旧签名; weekOffset≠0 → 直接 INSERT
  if (weekOffset === 0) {
    // 🔧 Round 110 fix: 去重检查 — 旧 RPC 无 UNIQUE 约束, 每次调用都会 INSERT 重复行
    //   旧代码: 直接调 create_weekly_challenges() → 无 UNIQUE → duplicates
    //   修复: 先检查本周挑战是否已存在, 存在则跳过 RPC, 只做过期清理
    const checkWeekStart = new Date();
    checkWeekStart.setHours(0, 0, 0, 0);
    const checkDayOfWeek = checkWeekStart.getDay();
    const checkDaysSinceMonday = checkDayOfWeek === 0 ? 6 : checkDayOfWeek - 1;
    checkWeekStart.setDate(checkWeekStart.getDate() - checkDaysSinceMonday);
    const checkWeekEnd = new Date(checkWeekStart);
    checkWeekEnd.setDate(checkWeekEnd.getDate() + 7);

    const { data: existingThisWeek } = await supabase
      .from('community_challenges')
      .select('id')
      .eq('title_key', 'defense.challenge.tiktok')
      .gte('start_date', checkWeekStart.toISOString())
      .lt('start_date', checkWeekEnd.toISOString())
      .limit(1);

    if (existingThisWeek && existingThisWeek.length > 0) {
      // 本周挑战已存在, 只做过期清理, 不调 RPC (避免 duplicates)
      logger.info('[Admin] Current week challenges already exist, skipping old RPC (dedup)');
      const { error: expireErr } = await supabase
        .from('community_challenges')
        .update({ is_active: false })
        .lt('end_date', new Date().toISOString())
        .eq('is_active', true);
      if (expireErr) {
        logger.warn('[Admin] Failed to mark expired challenges inactive:', expireErr.message);
      }
      return { success: true, usedFallback: true };
    }

    // 本周挑战不存在, 调旧 RPC 创建
    const { error: rpcError2 } = await supabase.rpc('create_weekly_challenges');
    if (rpcError2) {
      return { success: false, usedFallback: true, error: rpcError2.message };
    }
    return { success: true, usedFallback: true };
  }

  // 4. 直接 INSERT 下周/上周挑战
  // PG date_trunc('week') uses Monday (ISO 8601). JS getDay() returns 0=Sunday.
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const dayOfWeek = weekStart.getDay(); // 0=Sun, 1=Mon
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday + weekOffset * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const challenges = [
    {
      title: '7天不买TikTok推荐',
      title_key: 'defense.challenge.tiktok',
      description: '7天内不在TikTok Shop购买推荐商品',
      platform: 'tiktok_shop',
      start_date: weekStart.toISOString(),
      end_date: weekEnd.toISOString(),
      is_active: true,
    },
    {
      title: '7天不买直播间商品',
      title_key: 'defense.challenge.livestream',
      description: '7天内不在任何直播间购买商品',
      platform: 'livestream',
      start_date: weekStart.toISOString(),
      end_date: weekEnd.toISOString(),
      is_active: true,
    },
    {
      title: '7天不买超过$50的非必需品',
      title_key: 'defense.challenge.budget50',
      description: '7天内不购买超过$50的非必需品',
      platform: null,
      max_amount: 50.00,
      start_date: weekStart.toISOString(),
      end_date: weekEnd.toISOString(),
      is_active: true,
    },
  ];

  // 检查是否已存在 (避免重复)
  const { data: existing } = await supabase
    .from('community_challenges')
    .select('id, title_key, start_date')
    .eq('title_key', 'defense.challenge.tiktok')
    .gte('start_date', weekStart.toISOString())
    .lt('start_date', weekEnd.toISOString());

  if (existing && existing.length > 0) {
    logger.info('[Admin] Challenges for this week already exist, skipping INSERT');
  } else {
    const { error: insertError } = await supabase
      .from('community_challenges')
      .insert(challenges);

    if (insertError) {
      return { success: false, usedFallback: true, error: insertError.message };
    }
  }

  // 当 weekOffset > 0 时, 把当前周挑战标记为 inactive
  // 🔧 Round 108: 无论 weekOffset 值, 都标记过期挑战 (end_date < NOW()) 为 inactive
  //   这样 fallback 行为与 SQL 函数一致 (SQL 函数总是 UPDATE end_date < NOW())
  const nowIso = new Date().toISOString();
  const { error: expireError } = await supabase
    .from('community_challenges')
    .update({ is_active: false })
    .lt('end_date', nowIso)
    .eq('is_active', true);

  if (expireError) {
    logger.warn('[Admin] Failed to mark expired challenges inactive:', expireError.message);
  }

  if (weekOffset > 0) {
    const { error: updateError } = await supabase
      .from('community_challenges')
      .update({ is_active: false })
      .lt('start_date', weekStart.toISOString())
      .eq('is_active', true);

    if (updateError) {
      logger.warn('[Admin] Failed to mark old challenges inactive:', updateError.message);
    }
  }

  return { success: true, usedFallback: true };
}
