/**
 * GET /api/community/inducement-strategies — 高发诱导战术 Top 10 (batch81-b)
 *
 * BP 第 13 页「本周诱导战术榜」的数据底座 — 替换前端硬编码的 MOCK_STRATEGIES。
 *
 * 口径 (与 platform-index 对齐):
 * - 近 7 天 impulse_events 全社区聚合 (admin client 跨用户读; community_* 视图
 *   能跨用户靠的是 owner 权限, 零 DDL 下拿不到同等待遇, 故走既有 admin 先例)
 * - impulse_events 无 strategy 列: 战术从 is_flash_sale + title/raw_text
 *   关键词在线推导 (词表见 lib/inducement-tactics, 复用既有检测器)
 * - 诚实原则: 已分类事件 < MIN_TACTIC_SAMPLE_EVENTS 时 source='sample',
 *   前端亮 Sample 角标, 不冒充真实洞察
 *
 * 隐私: 只返回聚合计数/百分比, 用户级原文不出服务端。
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  aggregateInducementTactics,
  INDUCEMENT_TACTIC_META,
  MIN_TACTIC_SAMPLE_EVENTS,
  type TacticEventInput,
} from '@/lib/inducement-tactics';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;
const PAGE_SIZE = 1000; // PostgREST 单页上限
const MAX_EVENTS = 10_000; // 兜底上限: 触顶即按已取页聚合 (当前体量远低于此)

export const GET = withAuth(async () => {
  try {
    const { supabase: admin } = createAdminClient();
    if (!admin) {
      logger.warn('[Inducement Strategies] Admin client unavailable');
      return NextResponse.json({ strategies: [], source: 'sample', totalEvents: 0 });
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const events: TacticEventInput[] = [];

    for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
      const { data, error } = await admin
        .from('impulse_events')
        .select('is_flash_sale, title, raw_text')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        logger.warn('[Inducement Strategies] Aggregation query failed:', error.message);
        return NextResponse.json({ strategies: [], source: 'sample', totalEvents: 0 });
      }

      for (const row of data ?? []) {
        events.push({ isFlashSale: row.is_flash_sale, title: row.title, rawText: row.raw_text });
      }
      if ((data ?? []).length < PAGE_SIZE) break;
    }

    const { strategies, classifiedCount, totalEvents } = aggregateInducementTactics(events);
    const source = classifiedCount >= MIN_TACTIC_SAMPLE_EVENTS ? 'real' : 'sample';

    return NextResponse.json({
      strategies: strategies.map(({ id, percentage }) => ({
        strategy: id,
        labelKey: INDUCEMENT_TACTIC_META[id].labelKey,
        defaultLabel: INDUCEMENT_TACTIC_META[id].defaultLabel,
        percentage,
      })),
      source,
      totalEvents,
    });
  } catch (err) {
    // safe to ignore: 非关键展示数据, 降级空列表后前端走 sample fallback
    logger.error('[Inducement Strategies] Unexpected error:', err);
    return NextResponse.json({ strategies: [], source: 'sample', totalEvents: 0 });
  }
});
