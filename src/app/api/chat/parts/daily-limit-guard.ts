// 第18刀，自 route.ts:105-132 纯机械搬移
import { checkRateLimit } from '@/lib/distributed-lock';
import { logger } from '@/lib/logger';
import type { AuthenticatedClient } from '@/lib/supabase-api';

export async function checkDailyChatLimit(
  hasAuth: boolean,
  userId: string | undefined,
  supabase: AuthenticatedClient['supabase'],
): Promise<Response | null> {
  // 🔧 P0 fix (marketing-improvement-suggestions.md #3): Free tier 每日聊天限制 (50 条/天)
  //    旧代码: 只有 30 条/小时 rate limit, 无每日限制 → 免费用户理论上可无限聊
  //    新代码: 已登录 free 用户每日最多 50 条, premium 用户无限
  //    实现: 复用 checkRateLimit (distributed_locks + increment_rate_limit RPC), 无需新 migration
  const FREE_TIER_DAILY_CHAT_LIMIT = 50;
  const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
  if (hasAuth && userId && supabase) {
    try {
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).maybeSingle();
      const isPremium = profile?.plan === 'premium';
      if (!isPremium) {
        const { allowed: dailyAllowed } = await checkRateLimit(`chat:daily:${userId}`, FREE_TIER_DAILY_CHAT_LIMIT, DAILY_WINDOW_MS);
        if (!dailyAllowed) {
          return Response.json(
            {
              error: 'Daily chat limit reached. Maximum 50 messages per day. Upgrade to Premium for unlimited chatting, or come back tomorrow.',
              dailyLimitReached: true,
              limit: FREE_TIER_DAILY_CHAT_LIMIT,
            },
            { status: 429 },
          );
        }
      }
    } catch (err) {
      // safe to ignore: daily limit query failure should not block chat (fail-open)
      logger.warn('[Chat API] Failed to check free tier daily chat limit:', err);
    }
  }
  return null;
}
