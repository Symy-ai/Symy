/**
 * GET /api/transparency/weekly — 每周透明度报告 (batch81-a)
 *
 * 公开无鉴权: BP 承诺的北极星指标全公开 (拦截/省下金额/赢回小时/守护者),
 * "每周透明度报告 = 内容引擎"。聚合与降级阶梯在 transparency-weekly-server。
 *
 * 红线: 平台账本 — 快照结构上无用户级字段, 用户级金额永不出现。
 * 降级红线: 聚合失败返回缓存快照, 恒 200 不抛 500。
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';

export async function GET() {
  const snapshot = await loadTransparencyWeekly();
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  });
}
