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
 * 降级红线: 聚合失败不抛 500 — loader 返回最后成功快照 (degraded:true),
 * 无缓存时返回零值骨架; API 恒 200, 公开页展示降级提示。零 DDL: 只读
 * invitations 既有表, 不改 record-ref / invitation-reward 任何行为。
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import {
  aggregateGrowthStats,
  emptyGrowthStats,
  type GrowthInvitationRow,
  type GrowthStats,
} from '@/lib/growth-stats';

const PAGE_SIZE = 1000;

/** 进程内最后一份成功快照 (serverless 实例级; generatedAt 保留数据年龄) */
let memorySnapshot: GrowthStats | null = null;

/** @测试钩子 — 定型降级阶梯用例的进程内缓存初态 */
export function __setGrowthMemoryCacheForTests(snapshot: GrowthStats | null): void {
  memorySnapshot = snapshot;
}

export async function loadGrowthStats(now: Date = new Date()): Promise<GrowthStats> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.warn('[growth-stats] no admin client:', adminError);
    return memorySnapshot ? { ...memorySnapshot, degraded: true } : emptyGrowthStats(now, true);
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
        return memorySnapshot ? { ...memorySnapshot, degraded: true } : emptyGrowthStats(now, true);
      }
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
    const snapshot = aggregateGrowthStats(rows, now);
    memorySnapshot = snapshot;
    return snapshot;
  } catch (err) {
    // safe to ignore: 取数失败按降级红线返回缓存/零值快照, 不向公开端点抛 500
    logger.warn('[growth-stats] load failed:', err instanceof Error ? err.message : String(err));
    return memorySnapshot ? { ...memorySnapshot, degraded: true } : emptyGrowthStats(now, true);
  }
}
