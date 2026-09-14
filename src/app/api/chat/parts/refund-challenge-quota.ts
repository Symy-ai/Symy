/**
 * Challenge refund helper — Round 120 audit fix (AUDIT-2 P0 #3 + AUDIT-1 refactor #3)
 *
 * 🔧 ARCH fix (Round 120): 提取重复的 daily_see_it_count refund 逻辑 (chat/route.ts 重复 2 处)
 *
 * 旧代码 (line 444-471 + 566-592): 重复 ~30 行 refund 逻辑, 且 catch + warn + 仍告诉用户 "refunded"
 *    → 退款失败时用户被欺骗 ("Your See-it was refunded" 但实际没退)
 *
 * 新代码: 单一 helper, 返回 { refunded: boolean, error?: string }
 *    调用方据此决定向用户显示 "refunded" 还是 "refund failed, please contact support"
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { getLimitWindow } from '@/lib/limit-window';
import { logger } from '@/lib/logger';

export interface RefundResult {
  refunded: boolean;
  /** 退款前 count, 用于日志 */
  previousCount?: number;
  /** 退款失败原因 (refunded=false 时) */
  error?: string;
}

/**
 * 退还用户一次 See-it 额度 (daily_see_it_count 减 1)
 *
 * 使用 CAS (Compare-And-Swap) 防并发:
 *   UPDATE buddy_state SET daily_see_it_count = X-1
 *   WHERE user_id = U AND daily_see_it_count = X AND daily_see_it_date = TODAY
 *
 * 如果当前 count = 0 或 date 不匹配 (跨日), 不退款 (返回 refunded=false, error='no quota to refund')
 *
 * @param userId - 用户 UUID
 * @returns 退款结果 (调用方必须检查 refunded 字段, 不能假设一定成功)
 */
export async function refundChallengeQuota(userId: string): Promise<RefundResult> {
  try {
    const adminResult = createAdminClient();
    if (!adminResult.supabase) {
      logger.error('[RefundChallengeQuota] Admin client unavailable — cannot refund');
      return { refunded: false, error: 'admin_client_unavailable' };
    }

    const todayWindow = getLimitWindow();
    const { data: buddyData, error: readErr } = await adminResult.supabase
      .from('buddy_state')
      .select('daily_see_it_count, daily_see_it_date')
      .eq('user_id', userId)
      .maybeSingle();

    if (readErr) {
      logger.error('[RefundChallengeQuota] DB read error:', readErr);
      return { refunded: false, error: `db_read_error: ${readErr.message}` };
    }

    const storedCount = (buddyData as { daily_see_it_count?: number } | null)?.daily_see_it_count ?? 0;
    const storedDate = (buddyData as { daily_see_it_date?: string } | null)?.daily_see_it_date;

    // 只有当前窗口的 count > 0 才 refund
    if (storedDate !== todayWindow || storedCount <= 0) {
      logger.warn(
        `[RefundChallengeQuota] No quota to refund for user ${userId} ` +
        `(count=${storedCount}, date=${storedDate}, today=${todayWindow})`
      );
      return { refunded: false, error: 'no_quota_to_refund', previousCount: storedCount };
    }

    // CAS update — 防并发 (两个并发 refund 请求只有一个会成功)
    // 🔧 Round 120 audit-6 fix: 检查 rowsAffected, 0 行更新 = CAS 失败 (并发竞争)
    //    旧代码: 只检查 error, 不检查 rowsAffected → CAS 失败 (0 行) 时返回 refunded=true (撒谎)
    //    修复: 检查 count, 0 行 = CAS 失败, 返回 refunded=false
    const { error: updateErr, count: rowsAffected } = await adminResult.supabase
      .from('buddy_state')
      .update({ daily_see_it_count: storedCount - 1 })
      .eq('user_id', userId)
      .eq('daily_see_it_count', storedCount)
      .eq('daily_see_it_date', todayWindow);

    if (updateErr) {
      logger.error('[RefundChallengeQuota] DB update error:', updateErr);
      return { refunded: false, error: `db_update_error: ${updateErr.message}`, previousCount: storedCount };
    }

    // 🔧 Round 120 audit-6 fix: CAS 失败 (0 行更新) = 另一个并发请求已抢先 refund
    //    返回 refunded=false 让调用方知道没退成 (不要撒谎 "refunded")
    if (rowsAffected === 0) {
      logger.warn(`[RefundChallengeQuota] CAS failed — 0 rows updated (concurrent refund won). User: ${userId}`);
      return { refunded: false, error: 'cas_lost_concurrent_refund', previousCount: storedCount };
    }

    logger.info(`[RefundChallengeQuota] Refunded daily_see_it_count for user ${userId}: ${storedCount} → ${storedCount - 1}`);
    return { refunded: true, previousCount: storedCount };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[RefundChallengeQuota] Unexpected error:', err);
    return { refunded: false, error: `unexpected: ${err instanceof Error ? err.message : String(err)}` };
  }
}
