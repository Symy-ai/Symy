/**
 * chat 轮内 profiles 单次快照 — 供 daily-limit/guard-pulse/hourly-rate 共享。
 *
 * 🔧 apicache audit fix: 此前每轮 chat 对 profiles 发起 3 次独立单列查询
 *   (plan / timezone / hourly_rate)。同一请求内三列不变（RLS 用户行），
 *   一次读取共享可省 2 次 DB 往返。
 *
 * 用法: chat route 入口 createProfileSnapshot(userId) → 各 part 消费字段。
 * 失败语义与原各自查询一致: 出错返回 null → 消费方走各自默认值。
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export interface ChatProfileSnapshot {
  plan: string | null;
  timezone: string | null;
  hourlyRate: number | null;
}

const snapshotCache = new Map<string, Promise<ChatProfileSnapshot | null>>();

/**
 * 轮内共享快照。同 userId 并发调用共享同一个 in-flight promise
 * （请求内去重的关键 — 三个消费方几乎同时到达）。
 * 注意: 这是模块级缓存, 存活于函数实例生命周期 — Vercel 函数实例复用时
 * 可能返回上一次的快照。因此仅适合「轮内一致性」场景; 快照带 TTL 1s
 * 防实例复用时跨请求使用过期 plan（daily-limit 检查不能跨请求复用）。
 */
export function getChatProfileSnapshot(userId: string): Promise<ChatProfileSnapshot | null> {
  const cached = snapshotCache.get(userId);
  if (cached) return cached;
  const p = loadSnapshot(userId).finally(() => {
    // 1s 后清出 — 完成即删, 下轮重新读（保守: 不跨轮复用）
    setTimeout(() => snapshotCache.delete(userId), 1000).unref?.();
  });
  snapshotCache.set(userId, p);
  return p;
}

async function loadSnapshot(userId: string): Promise<ChatProfileSnapshot | null> {
  try {
    const { supabase } = createAdminClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('plan, timezone, hourly_rate')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      logger.warn('[chat-profile-snapshot] read failed:', error.message);
      return null;
    }
    // 行缺失(data=null)也返回 null — 与「查询失败」同一语义:
    // daily-limit-guard 用 snapshot===null 判 fail-open, 行不存在
    // 走 plan=null(免费限额)而非误放行。
    if (!data) return null;
    return {
      plan: (data.plan as string | undefined) ?? null,
      timezone: (data.timezone as string | undefined) ?? null,
      hourlyRate: (data.hourly_rate as number | undefined) ?? null,
    };
  } catch (err) {
    // safe to ignore: 快照失败消费方各自回退默认值 — 与原独立查询的失败语义一致
    logger.warn('[chat-profile-snapshot] exception:', err);
    return null;
  }
}
