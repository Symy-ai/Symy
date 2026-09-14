/**
 * green-commitment-context — 进行中绿色承诺的 chat 注入点 (batch53-a)
 *
 * 独立注入文件 (参照 impulse-profile-context.ts 先例), 不改 rescue
 * context-builder / 既有 parts 装配语义: loadLettaTurnContext 在拼 symyFields
 * 时把本模块产出的单行摘要作为 `symy_green_commitment` 字段拼入 (best-effort)。
 *
 * 口径:
 * - 零 DDL / 只读: 读 health_events manual_adjustment (最近 LIMIT 行), 用
 *   deriveGreenCommitment 取进行中承诺 (到期结算卡另有前端派生, 此处只注入)。
 * - 任何失败 (查询错误/无承诺) → undefined, 调用方按字段缺省省略, 绝不阻塞聊天。
 * - 摘要只含承诺对象原词 (截断) + 剩余天数, 无金额, prompt 注入面最小化。
 */

import { logger } from '@/lib/logger';
import { deriveGreenCommitment } from '@/lib/green-commitment';

/** 拉取行数上限 — 只找最近一条进行中承诺, manual_adjustment 近期窗口足够 */
const CONTEXT_COMMITMENT_LIMIT = 50;

/** 结构面收窄 (与 impulse-profile-context 同模式, stub 测试验证契约) */
interface HealthEventsRead {
  select: (cols: string) => HealthEventsRead;
  eq: (col: string, val: string) => HealthEventsRead;
  order: (col: string, opts: { ascending: boolean }) => HealthEventsRead;
  limit: (n: number) => HealthEventsRead;
  then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => unknown;
}

export interface GreenCommitmentStore {
  from: (table: 'health_events') => HealthEventsRead;
}

interface CommitmentEventRow {
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function daysUntil(endKey: string, now: Date): number {
  const end = new Date(endKey + 'T00:00:00');
  const diff = Math.round((end.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  return diff >= 0 ? diff : 0;
}

/** 进行中承诺 → 单行英文摘要 (固定枚举字段 + 截断原词 + 剩余天数, 无金额) */
export function buildGreenCommitmentLine(args: {
  subject: string | null;
  endKey: string;
  now: Date;
}): string | undefined {
  const { subject, endKey, now } = args;
  const daysLeft = daysUntil(endKey, now);
  const what = subject ? subject.slice(0, 20) : 'a category';
  return `symy_green_commitment: active promise — no buying ${what} until ${endKey} (${daysLeft} day(s) left) — the user made this promise to themselves in chat. Naturally acknowledge it when they mention the topic (warm guardian, never police; no shaming if they slip).`;
}

/**
 * 读取 → 派生 → 进行中承诺单行摘要 (chat 每轮 context 构建时 await)。
 * 失败/无承诺 → undefined。
 */
export async function loadGreenCommitmentContextLine({
  userId,
  store,
}: {
  userId: string | undefined;
  store: GreenCommitmentStore | null | undefined;
}): Promise<string | undefined> {
  if (!userId || !store) return undefined;
  try {
    const res = await store
      .from('health_events')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'manual_adjustment')
      .order('created_at', { ascending: false })
      .limit(CONTEXT_COMMITMENT_LIMIT);
    const rows = (res?.data || []) as CommitmentEventRow[];
    if (rows.length === 0) return undefined;
    const now = new Date();
    const derivation = deriveGreenCommitment(
      rows.map((r) => ({
        eventType: 'manual_adjustment',
        triggerSource: null,
        triggerId: null,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      now,
    );
    const active = derivation.activeCommitment;
    if (!active) return undefined;
    return buildGreenCommitmentLine({ subject: active.subject, endKey: active.endKey, now });
  } catch (err) {
    // safe to ignore: 承诺注入是 best-effort — 失败静默降级, 绝不阻塞聊天
    logger.warn('[GreenCommitmentContext] load failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
