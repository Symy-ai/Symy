/**
 * GET /api/community/growth-stats — K 因子与邀请漏斗公开聚合 (batch82-c)
 *
 * 公开无鉴权: BP 承诺 (0918 p20 验证期) 的病毒机制建档数据层 —
 * 邀请漏斗 (发出/pending/完成) + 去重邀请者 + K 因子近似值。
 * 聚合与取数在 growth-stats / growth-stats-server。
 *
 * 红线: 只读聚合 — 输出键面无个人字段, 邀请奖励代币数 (非钱) 永不出现。
 * 降级红线: 聚合失败返回最后成功快照 (degraded:true + 原 generatedAt),
 * 无缓存时返回零值骨架, 恒 200 不抛 500。
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { loadGrowthStats } from '@/lib/growth-stats-server';

export async function GET() {
  return NextResponse.json(await loadGrowthStats(), {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  });
}
