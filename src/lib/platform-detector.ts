/**
 * Platform detector — auto-detect purchase platform from chat messages + impulse_events.
 *
 * 🔧 Round 82 F3 方案 B: 从聊天消息自动检测 platform, 写入 active_challenges.metadata.platform.
 *    BlindSpotMap livestream 维度读 metadata.platform, 之前是死代码 (show: false).
 *
 * Detection strategy (in priority order):
 * 1. Match against recent impulse_events (same user, same amount, last 24h)
 *    — most reliable, uses structured data
 * 2. Keyword regex on chat message text
 *    — fallback when no impulse_event matches
 *
 * Supported platforms (for keyword detection):
 * - TikTok Shop / 抖音 (tiktok, douyin, tiktok shop)
 * - Instagram (instagram, insta)
 * - Amazon (amazon, 亚马逊)
 * - Shein (shein)
 * - JD (jd.com, 京东)
 * - Pinduoduo (pinduoduo, pdd, 拼多多)
 * - Livestream generic (livestream, live, 直播, 直播间)
 */

import 'server-only';

import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Keyword → platform mapping for chat message detection.
 * Keywords are case-insensitive, matched as substrings.
 *
 * Platform values match the ones used in impulse_events.platform
 * (so BlindSpotMap's getPlatform() can detect them consistently).
 */
const PLATFORM_KEYWORDS: Array<{ keywords: string[]; platform: string }> = [
  // TikTok / 抖音 (livestream — highest priority for BlindSpotMap livestream dimension)
  { keywords: ['tiktok', 'tiktok shop', 'douyin', '抖音'], platform: 'tiktok_shop' },
  // Instagram
  { keywords: ['instagram', 'insta', 'ig ad'], platform: 'instagram' },
  // Amazon
  { keywords: ['amazon', '亚马逊'], platform: 'amazon' },
  // Shein
  { keywords: ['shein'], platform: 'shein' },
  // JD
  { keywords: ['jd.com', '京东', 'jingdong'], platform: 'jd' },
  // Pinduoduo
  { keywords: ['pinduoduo', 'pdd', '拼多多'], platform: 'pinduoduo' },
  // Generic livestream (catches "bought from a livestream" without specific platform)
  { keywords: ['livestream', 'live stream', '直播', '直播间'], platform: 'livestream' },
  // Generic "ad" (lower confidence — many platforms have ads)
  { keywords: ['ad', '广告', 'sponsored'], platform: 'ad' },
];

/**
 * Detect platform from a text message using keyword matching.
 *
 * @param text - Chat message text (e.g., "I bought a jacket from TikTok shop")
 * @returns Detected platform string (e.g., 'tiktok_shop'), or null if no match.
 *
 * @example
 * detectPlatformFromText("I bought a $159 jacket from TikTok shop")
 * // → 'tiktok_shop'
 *
 * detectPlatformFromText("Saw an ad on Instagram")
 * // → 'instagram'
 *
 * detectPlatformFromText("Bought something")
 * // → null
 */
export function detectPlatformFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  for (const { keywords, platform } of PLATFORM_KEYWORDS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        logger.info(`[PlatformDetector] Detected platform "${platform}" from keyword "${keyword}" in text`);
        return platform;
      }
    }
  }

  return null;
}

/**
 * Look up the most recent impulse_event with matching amount for this user.
 * Used when challenge status='failed' (user bought) to find the platform
 * from a previously-recorded impulse_event.
 *
 * @param supabaseClient - Supabase client (admin or user-scoped)
 * @param userId - User ID
 * @param amount - Purchase amount to match (within $0.01 tolerance)
 * @param withinMs - Time window in milliseconds (default: 24h)
 * @returns Platform string from impulse_event, or null if no match.
 */
export async function findPlatformFromImpulseEvents(
  supabaseClient: SupabaseClient,
  userId: string,
  amount: number,
  withinMs: number = 24 * 60 * 60 * 1000,
): Promise<string | null> {
  if (!supabaseClient || !userId || !Number.isFinite(amount) || amount <= 0) return null;

  try {
    const since = new Date(Date.now() - withinMs).toISOString();
    // Use range filter: amount between (amount-0.01) and (amount+0.01)
    const minAmount = Math.max(0, amount - 0.01);
    const maxAmount = amount + 0.01;

    const { data, error } = await supabaseClient
      .from('impulse_events')
      .select('platform')
      .eq('user_id', userId)
      .gte('created_at', since)
      .gte('amount', minAmount)
      .lte('amount', maxAmount)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      logger.warn('[PlatformDetector] impulse_events query error:', error.message);
      return null;
    }

    if (data && data.length > 0 && data[0].platform) {
      logger.info(`[PlatformDetector] Found platform "${data[0].platform}" from impulse_events (amount=$${amount})`);
      return (data[0] as { platform: string }).platform;
    }

    return null;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[PlatformDetector] findPlatformFromImpulseEvents error:', err);
    return null;
  }
}

/**
 * Combined detection: try impulse_events first (structured data), then chat text.
 *
 * @param supabaseClient - Supabase client (admin or user-scoped)
 * @param userId - User ID
 * @param amount - Purchase amount
 * @param chatText - Chat message text (optional, for keyword fallback)
 * @returns Detected platform or null
 */
export async function autoDetectPlatform(
  supabaseClient: SupabaseClient | null,
  userId: string,
  amount: number,
  chatText?: string,
): Promise<string | null> {
  // Strategy 1: Look up impulse_events (most reliable)
  if (supabaseClient) {
    const fromImpulse = await findPlatformFromImpulseEvents(supabaseClient, userId, amount);
    if (fromImpulse) return fromImpulse;
  }

  // Strategy 2: Keyword detection from chat text
  if (chatText) {
    const fromText = detectPlatformFromText(chatText);
    if (fromText) return fromText;
  }

  return null;
}
