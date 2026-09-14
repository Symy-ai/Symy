/**
 * impulse-profile-context — 冲动触发画像的 chat 注入点 (batch52-c)
 *
 * 独立注入文件, 不改 rescue context-builder / 既有 parts 装配语义:
 * loadLettaTurnContext 在拼 symyFields 时把本模块产出的单行摘要作为
 * `symy_impulse_profile` 字段拼入 (与 symy_shopping_facts 同级的 best-effort 通道)。
 *
 * 口径:
 * - 零 DDL / 只读: 读 health_events challenge_completed (最近 LIMIT 行),
 *   用 aggregateImpulseTriggerProfile 聚合 (原因从 itemName 本地派生, 与
 *   intercept-reason-chip 展示层同源同词表)。
 * - 任何失败 (查询错误/空) → undefined, 调用方按字段缺省省略注入, 绝不阻塞聊天。
 * - 摘要只含 reasonId/品类 id/时段 id (固定枚举) + 次数占比, 无金额无自由文本,
 *   无 prompt 注入面。
 */

import { logger } from '@/lib/logger';
import {
  aggregateImpulseTriggerProfile,
  type ImpulseTriggerProfile,
} from '@/lib/impulse-trigger-profile';

/** 拉取行数上限 — 画像只要分布, 最近 100 条拦截足够且单查询可控 */
const CONTEXT_PROFILE_LIMIT = 100;

/**
 * 最小读结构面 — supabase-js client 运行时满足 (与 shopping-facts 的
 * store 契约收窄同一模式, 避开 supabase-js 泛型 TS2589; 调用方用
 * `as unknown as ImpulseProfileStore` 一次性收窄, stub 测试验证契约)。
 */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  /** supabase thenable — await 兼容 */
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface ImpulseProfileStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface ProfileEventRow {
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** 画像 → 单行英文摘要 (prompt 侧既有约定: context 行用英文; 字段全为固定枚举 + 计数) */
export function buildImpulseProfileLine(profile: ImpulseTriggerProfile): string | undefined {
  if (profile.status !== 'ok' || profile.topReasons.length === 0) return undefined;

  const segments: string[] = [];
  const top = profile.topReasons[0];
  segments.push(`top trigger ${top.reasonId} (${top.count}/${profile.totalIntercepts})`);
  if (profile.topCategory) segments.push(`most intercepted category ${profile.topCategory}`);
  if (profile.window.status === 'ok' && profile.window.topWindow) {
    segments.push(`peak window ${profile.window.topWindow} (${Math.round(profile.window.topShare * 100)}%)`);
  }
  segments.push(`${profile.totalIntercepts} intercepts over ${profile.activeDays} days`);

  return `symy_impulse_profile: ${segments.join(', ')} — the user's impulse trigger profile. Naturally reference it when relevant (e.g. when they mention wanting to buy something similar). Never shame the user; frame triggers as patterns, not weakness.`;
}

/**
 * 读取 → 聚合 → 单行摘要 (chat 每轮 context 构建时 await)。
 * 失败/样本不足 → undefined。
 */
export async function loadImpulseProfileContextLine({
  userId,
  store,
}: {
  userId: string | undefined;
  store: ImpulseProfileStore | null | undefined;
}): Promise<string | undefined> {
  if (!userId || !store) return undefined;
  try {
    const res = await store
      .from('health_events')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'challenge_completed')
      .order('created_at', { ascending: false })
      .limit(CONTEXT_PROFILE_LIMIT);
    const rows = (res?.data || []) as ProfileEventRow[];
    if (rows.length === 0) return undefined;
    return buildImpulseProfileLine(
      aggregateImpulseTriggerProfile(
        rows.map((r) => ({ metadata: r.metadata, createdAt: r.created_at })),
      ),
    );
  } catch (err) {
    // safe to ignore: 画像注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[ImpulseProfileContext] load failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
