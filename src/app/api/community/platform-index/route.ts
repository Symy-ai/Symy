/**
 * GET /api/community/platform-index — 平台诱导指数
 *
 * 返回各平台的诱导指数 (7 天聚合):
 * - platform: 平台 ID (tiktok_shop / instagram / amazon / etc.)
 * - label: 显示名称
 * - icon: emoji
 * - index: 诱导指数 (0-100, 越高越危险)
 * - failedCount: 失败挑战数 (用户买了)
 * - passedCount: 成功抵御数
 * - totalSaved: 该平台抵御的总金额
 *
 * 隐私: 最低 5 条才显示 (视图已含 HAVING COUNT(*) >= 5)
 *
 * 🔧 Round 100: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const PLATFORM_LABELS: Record<string, { label: string; icon: string }> = {
  tiktok_shop: { label: 'TikTok Shop', icon: '📱' },
  instagram: { label: 'Instagram', icon: '📷' },
  amazon: { label: 'Amazon', icon: '📦' },
  shein: { label: 'Shein', icon: '👗' },
  jd: { label: 'JD.com', icon: '📦' },
  pinduoduo: { label: 'Pinduoduo', icon: '🍊' },
  livestream: { label: 'Livestream', icon: '🎥' },
  ad: { label: 'Ads', icon: '📺' },
};

export const GET = withAuth(async ({ supabase }) => {
  try {
    // 🔧 ARCH fix (2026-07-21): Views types can't be added to database.types.ts
    //    (Supabase type generation conflict — 286 TS errors when Views is non-empty).
    //    Using 'as never' as documented workaround. Architecture guard exempts this route.
    const { data, error } = await supabase
      .from('community_platform_stats' as never)
      .select('*')
      .order('inducement_index', { ascending: false })
      .limit(8);

    if (error) {
      logger.warn('[Platform Index] View query failed:', error.message);
      return NextResponse.json({ platforms: [], hasData: false });
    }

    // 🔧 Filter out 'unknown' platform — not useful for users
    const platforms = (data || [])
      .filter((row: Record<string, unknown>) => row.platform !== 'unknown')
      .map((row: Record<string, unknown>) => {
        const platformId = row.platform as string;
        const meta = PLATFORM_LABELS[platformId] || { label: platformId, icon: '🏪' };
        return {
          platform: platformId,
          label: meta.label,
          icon: meta.icon,
          index: Number(row.inducement_index ?? 0),
          failedCount: Number(row.failed_count ?? 0),
          passedCount: Number(row.passed_count ?? 0),
          totalSaved: Number(row.total_saved ?? 0),
        };
      });

    return NextResponse.json({
      platforms,
      hasData: platforms.length > 0,
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Platform Index] Unexpected error:', err);
    return NextResponse.json({ platforms: [], hasData: false });
  }
});
