/**
 * Growth Stats server loader — 取数层 (batch82-c)
 *
 * 与 transparency 拆分模式同款: 纯聚合在 growth-stats, 取数在本文件,
 * HTTP 壳在 api/community/growth-stats。页面与 API 共用本 loader,
 * 公开页服务端直调, 不自我 fetch。
 *
 * PostgREST 1000 行上限: .range() 翻页耗尽 (transparency-weekly-server
 * 修好的分页模式) — 每页不足 PAGE_SIZE 才停。
 *
 * 降级红线: 聚合失败不抛 500 — loader 返回 null, API 壳落零值骨架
 * (恒 200), 公开页整段隐藏增长区块 (不展示假数据)。零 DDL: 只读
 * invitations 既有表, 不改 record-ref / invitation-reward 任何行为。
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import {
  aggregateGrowthStats,
  type GrowthInvitationRow,
  type GrowthStats,
} from '@/lib/growth-stats';

const PAGE_SIZE = 1000;

export async function loadGrowthStats(now: Date = new Date()): Promise<GrowthStats | null> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.warn('[growth-stats] no admin client:', adminError);
    return null;
  }

  try {
    const rows: GrowthInvitationRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('invitations')
        .select('referrer_user_id,status')
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        logger.warn('[growth-stats] invitations query failed:', error.message);
        return null;
      }
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
    return aggregateGrowthStats(rows, now);
  } catch (err) {
    // safe to ignore: 取数失败按降级红线返回 null (页面隐藏区块 / API 零值骨架), 不向公开端点抛 500
    logger.warn('[growth-stats] load failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
