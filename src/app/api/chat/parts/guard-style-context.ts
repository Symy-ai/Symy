/**
 * guard-style-context — 守护风格画像的 chat 注入点 (batch56-c)
 *
 * 独立注入文件 (照 alt-adoption-context / impulse-profile-context 先例),
 * 零侵入 rescue context-builder: loadLettaTurnContext 在拼 symyFields 时把
 * 本模块产出的单行摘要作为 `symy_guard_style` 字段拼入 (best-effort)。
 *
 * 口径:
 * - 零 DDL / 只读: 两条查询 (challenge_completed 拦截轨 + mindful_recovery
 *   替代/复用轨, 各最近 LIMIT 行), 用 aggregateGuardStyleProfile 聚合。
 * - 任何失败 (查询错误/样本不足) → line undefined, 绝不阻塞聊天。
 * - 注入行只有风格名/次数/天数 (计数), 无金额; 指令明写均衡型是全能不是
 *   做得不够, 不对比不羞辱。
 */

import { logger } from '@/lib/logger';
import { aggregateGuardStyleProfile, type GuardStyleProfile } from '@/lib/guard-style-profile';

/** 拉取行数上限 — 风格看分布, 最近各 200 条足够且单查询可控 */
const CONTEXT_GUARD_STYLE_LIMIT = 200;

/** 结构面收窄 (与既有注入文件同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface GuardStyleStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface EventRow {
  event_type: unknown;
  trigger_id: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const STYLE_LABEL: Record<GuardStyleProfile['styleId'], string> = {
  interceptor: 'interceptor (calm-guard dominant)',
  substitutor: 'substitutor (green-alternative dominant)',
  reuser: 'reuser (reuse dominant)',
  balanced: 'balanced (all three styles)',
};

/** 画像 → 单行英文摘要 (prompt 侧既有约定: context 行用英文, 字段为计数) */
export function buildGuardStyleLine(profile: GuardStyleProfile): string | undefined {
  if (profile.status !== 'ok') return undefined;
  const c = profile.trackCounts;
  return `symy_guard_style: ${STYLE_LABEL[profile.styleId]} — guard ${c.guard} / alternative ${c.alt} / reuse ${c.reuse} actions over ${profile.activeDays} days (${profile.styleStreakDays}-day style streak). This is the user's green style profile. You can naturally name their style ("you keep picking the other path — that's so you"). A balanced style means versatility, NOT falling behind — never imply any style is lacking, never compare them to others, never shame.`;
}

export interface GuardStyleContextResult {
  /** 拼入 symyFields 的单行摘要; 样本不足/失败 → undefined (字段省略) */
  line: string | undefined;
  /** 聚合后的画像 (样本不足为 insufficient 态, 供调用方降级) */
  profile: GuardStyleProfile;
}

/**
 * 读取 → 聚合 → 单行摘要 (chat 每轮 context 构建时 await)。
 * 查询失败 → 静默降级 (line undefined / profile insufficient), 绝不阻塞聊天。
 */
export async function loadGuardStyleContext({
  userId,
  store,
}: {
  userId: string | undefined;
  store: GuardStyleStore | null | undefined;
}): Promise<GuardStyleContextResult> {
  const degraded: GuardStyleContextResult = {
    line: undefined,
    profile: aggregateGuardStyleProfile([]),
  };
  if (!userId || !store) return degraded;
  try {
    const toEvents = (rows: EventRow[]) =>
      rows.map((r) => ({
        eventType: typeof r.event_type === 'string' ? r.event_type : null,
        triggerId: typeof r.trigger_id === 'string' ? r.trigger_id : null,
        metadata: r.metadata,
        createdAt: r.created_at,
      }));

    // 拦截轨: challenge_completed; 替代/复用轨: mindful_recovery (kind 在聚合层过滤)
    const [guardRes, recoveryRes] = await Promise.all([
      store
        .from('health_events')
        .select('event_type, trigger_id, metadata, created_at')
        .eq('user_id', userId)
        .eq('event_type', 'challenge_completed')
        .order('created_at', { ascending: false })
        .limit(CONTEXT_GUARD_STYLE_LIMIT),
      store
        .from('health_events')
        .select('event_type, trigger_id, metadata, created_at')
        .eq('user_id', userId)
        .eq('event_type', 'mindful_recovery')
        .order('created_at', { ascending: false })
        .limit(CONTEXT_GUARD_STYLE_LIMIT),
    ]);

    const events = [
      ...toEvents((guardRes?.data || []) as EventRow[]),
      ...toEvents((recoveryRes?.data || []) as EventRow[]),
    ];
    if (events.length === 0) return degraded;

    const profile = aggregateGuardStyleProfile(events);
    return { line: buildGuardStyleLine(profile), profile };
  } catch (err) {
    // safe to ignore: 风格注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[GuardStyleContext] load failed:', err instanceof Error ? err.message : String(err));
    return degraded;
  }
}
