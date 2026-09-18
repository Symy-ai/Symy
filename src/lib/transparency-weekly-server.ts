/**
 * Transparency Weekly server loader — 取数 + 降级阶梯 (batch81-a)
 *
 * 降级红线: 聚合失败不抛 500 — 快照表最新行 → 进程内缓存 → 零值骨架, 恒 200。
 * 快照表 (141_transparency_snapshots.sql) 由 owner 手动执行; 表不存在时读写
 * 一律静默跳过 (错误视为"无快照"), 路由与页面照常工作。
 *
 * 页面与 API 共用本 loader: 公开页服务端直调, 不自我 fetch。
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import type { Json } from '@/lib/database.types';
import {
  aggregateTransparency,
  asTransparencySnapshot,
  emptyTransparency,
  type TransparencySnapshot,
} from '@/lib/transparency-weekly';

/** 进程内最后一份成功快照 (serverless 实例级, 表缺失时的最低保障) */
let memorySnapshot: TransparencySnapshot | null = null;

/** @测试钩子 — 定型降级阶梯用例的进程内缓存初态 */
export function __setTransparencyMemoryCacheForTests(snapshot: TransparencySnapshot | null): void {
  memorySnapshot = snapshot;
}

async function readPersistedSnapshot(supabase: NonNullable<ReturnType<typeof createAdminClient>['supabase']>): Promise<TransparencySnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('transparency_snapshots')
      .select('payload')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return asTransparencySnapshot((data[0] as { payload: unknown }).payload);
  } catch {
    // safe to ignore: 快照表读取失败 (表未建/权限等) 按"无快照"降级 — 返回 null 即恢复
    return null;
  }
}

/** best-effort 持久化 — 表未建 (owner 未执行 141) 或写失败都不影响主流程 */
async function persistSnapshot(supabase: NonNullable<ReturnType<typeof createAdminClient>['supabase']>, snapshot: TransparencySnapshot): Promise<void> {
  try {
    const { error } = await supabase
      .from('transparency_snapshots')
      .upsert(
        { week_start: snapshot.weekStart.slice(0, 10), payload: snapshot as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: 'week_start' },
      );
    if (error) logger.warn('[transparency] snapshot persist skipped:', error.message);
  } catch (err) {
    // safe to ignore: 快照持久化是 best-effort — 写失败不影响主流程, 进程内缓存仍在
    logger.warn('[transparency] snapshot persist skipped:', err instanceof Error ? err.message : String(err));
  }
}

/** 聚合失败 → 降级: 持久化快照优先 (跨实例), 进程内缓存兜底, 最后零值骨架。原 generatedAt 保留 — 数据年龄要诚实 */
async function degradedSnapshot(
  supabase: NonNullable<ReturnType<typeof createAdminClient>['supabase']> | null,
  now: Date,
): Promise<TransparencySnapshot> {
  const persisted = supabase ? await readPersistedSnapshot(supabase) : null;
  const fallback = persisted ?? memorySnapshot;
  if (fallback) return { ...fallback, degraded: true };
  return emptyTransparency(now, true);
}

export async function loadTransparencyWeekly(now: Date = new Date()): Promise<TransparencySnapshot> {
  const { supabase, error: adminError } = createAdminClient();
  if (!supabase) {
    logger.warn('[transparency] no admin client:', adminError);
    return degradedSnapshot(null, now);
  }

  const [health, passed] = await Promise.all([
    supabase.from('health_events').select('id,user_id,event_type,trigger_id,created_at'),
    supabase.from('active_challenges').select('amount,completed_at').eq('status', 'passed'),
  ]);

  if (health.error || passed.error) {
    logger.warn(
      '[transparency] aggregate query failed:',
      health.error?.message ?? passed.error?.message,
    );
    return degradedSnapshot(supabase, now);
  }

  const snapshot = aggregateTransparency(health.data ?? [], passed.data ?? [], now);
  memorySnapshot = snapshot;
  await persistSnapshot(supabase, snapshot);
  return snapshot;
}
