/**
 * active-guards — 进行中守护面板纯聚合 (batch59-a)
 *
 * 把散落在三处的「进行中守护」聚到一张面板:
 * - 进行中挑战: active_challenges 表的 status='active' 行 (24h 窗口,
 *   与 challenge-store 的 expired 判定同口径);
 * - 进行中承诺: health_events manual_adjustment + source='green_commitment'
 *   (start_key/end_key 本地日期键, 当日仍算 active, 次日移出);
 * - 冷静期项: 买前三问「冷静 24h」的 localStorage pending 记录
 *   (7 天未回访视同过期, 与 prepurchase-store prune 同口径)。
 *
 * 只读派生零 IO, 无 cron 无写入 (SOS 事件由面板组件另写, source=guard_sos)。
 *
 * 口径红线:
 * - 金额字段 (guardedAmount/assistSaved) 只进 App 内私享, 永不进分享/荣誉面
 *   (分享面走 buildActiveGuardsShareData, 输出类型无金额字段)。
 * - 剩余时间用本地日期键比较, 无时区歧义 (与 triggerId/week_key 同款约定)。
 */

import { resolveGuardCategory } from '@/lib/guard-category-insight';
import { dateKeyOf, GREEN_COMMITMENT_SOURCE } from '@/lib/green-commitment';

/** 挑战窗口 — 与 challenge-store 的 expired 判定 (24h) 同口径 */
export const CHALLENGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 冷静期 pending 超过到期 7 天视同过期 — 与 prepurchase-store prune 同口径 */
export const COOLDOWN_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** SOS 求助事件在 metadata.source 的标记 (面板组件写入) */
export const GUARD_SOS_SOURCE = 'guard_sos';

export interface ActiveGuardsEventInput {
  id?: string;
  eventType: string;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActiveGuardsChallengeInput {
  id: string;
  itemName: string;
  amount: number | null;
  createdAt: string;
}

export interface ActiveGuardsCooldownInput {
  subject: string | null;
  askedAt: number;
  dueAt: number;
  amount: number | null;
}

export interface ActiveChallengeGuard {
  kind: 'challenge';
  id: string;
  itemName: string;
  category: ReturnType<typeof resolveGuardCategory>;
  /** 预估守护金额 — 仅 App 内私享, 永不进分享/荣誉面 */
  guardedAmount: number | null;
  hoursLeft: number;
}

export interface ActiveCommitmentGuard {
  kind: 'commitment';
  /** `start#end` 日期键对 (与 commitmentRefKey 同款) */
  id: string;
  subject: string | null;
  category: ReturnType<typeof resolveGuardCategory>;
  daysLeft: number;
  assistCount: number;
  /** 窗口内助攻拦截的 savedAmount 之和 — 仅 App 内私享 */
  assistSaved: number;
  startKey: string;
  endKey: string;
}

export interface ActiveCooldownGuard {
  kind: 'cooldown';
  id: string;
  subject: string | null;
  category: ReturnType<typeof resolveGuardCategory>;
  /** 用户填过的价格 — 仅 App 内私享 */
  guardedAmount: number | null;
  hoursLeft: number;
  /** 到期待回访 (dueAt 已过) — 展示 revisit 入口 */
  dueForRevisit: boolean;
}

export interface ActiveGuardsSummary {
  status: 'empty' | 'ok';
  challenges: ActiveChallengeGuard[];
  commitments: ActiveCommitmentGuard[];
  cooldowns: ActiveCooldownGuard[];
  totalCount: number;
  /** 连续坚持天数 — 最早一件 active 项发起日至今 (含尾, 至少 1) */
  persistDays: number;
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 两个本地日期键的差 (b - a, 天) */
function diffDays(aKey: string, bKey: string): number {
  const a = new Date(aKey + 'T00:00:00').getTime();
  const b = new Date(bKey + 'T00:00:00').getTime();
  const days = Math.round((b - a) / 86400000);
  return Number.isFinite(days) ? days : 0;
}

function metaOf(e: ActiveGuardsEventInput): Record<string, unknown> | null {
  return e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
}

/** 事件本地日期键 (无效 createdAt 返回 null, 调用方跳过) */
function eventKeyOf(e: ActiveGuardsEventInput): string | null {
  const t = new Date(e.createdAt).getTime();
  return Number.isFinite(t) ? dateKeyOf(new Date(t)) : null;
}

/** 品类/对象匹配 — 与 green-commitment.eventMatchesCommitment 同口径 */
function eventMatchesRecord(
  record: { category: ReturnType<typeof resolveGuardCategory>; subject: string | null },
  meta: Record<string, unknown> | null,
): boolean {
  if (resolveGuardCategory(meta) === record.category && record.category !== 'other') return true;
  if (record.subject && meta) {
    const itemName = typeof meta.itemName === 'string' ? meta.itemName : '';
    if (itemName && itemName.toLowerCase().includes(record.subject.toLowerCase())) return true;
  }
  return false;
}

interface ParsedCommitment {
  startKey: string;
  endKey: string;
  subject: string | null;
  category: ReturnType<typeof resolveGuardCategory>;
}

function parseCommitment(e: ActiveGuardsEventInput): ParsedCommitment | null {
  const meta = metaOf(e);
  if (!meta || meta.source !== GREEN_COMMITMENT_SOURCE) return null;
  const startKey = typeof meta.start_key === 'string' && KEY_RE.test(meta.start_key) ? meta.start_key : null;
  const endKey = typeof meta.end_key === 'string' && KEY_RE.test(meta.end_key) ? meta.end_key : null;
  if (!startKey || !endKey || endKey < startKey) return null;
  const subject = typeof meta.subject === 'string' && meta.subject.trim() ? meta.subject.trim() : null;
  return { category: resolveGuardCategory({ category: meta.category, itemTitle: subject }), subject, startKey, endKey };
}

/**
 * 纯函数: 聚合三类进行中守护。
 * events 需含 manual_adjustment (承诺登记) + challenge_completed (助攻计数)。
 */
export function aggregateActiveGuards(input: {
  now: Date;
  challenge: ActiveGuardsChallengeInput | null;
  events: ActiveGuardsEventInput[] | null | undefined;
  cooldown: ActiveGuardsCooldownInput | null;
}): ActiveGuardsSummary {
  const now = input.now;
  const events = input.events || [];
  const todayKey = dateKeyOf(now);

  // —— 挑战: 24h 窗口内才算进行中 (过期不出现) ——
  const challenges: ActiveChallengeGuard[] = [];
  if (input.challenge) {
    const created = new Date(input.challenge.createdAt).getTime();
    const hoursLeft = Number.isFinite(created)
      ? Math.max(0, (created + CHALLENGE_WINDOW_MS - now.getTime()) / 3600000)
      : 0;
    if (Number.isFinite(created) && hoursLeft > 0) {
      challenges.push({
        kind: 'challenge',
        id: input.challenge.id,
        itemName: input.challenge.itemName,
        category: resolveGuardCategory({ itemTitle: input.challenge.itemName }),
        guardedAmount: input.challenge.amount,
        hoursLeft,
      });
    }
  }

  // —— 承诺: end_key >= 今天 (当日仍算 active, 次日移出); 同窗多次登记去重 ——
  const seenRefKeys = new Set<string>();
  const parsed: ParsedCommitment[] = [];
  for (const e of events) {
    if (e.eventType !== 'manual_adjustment') continue;
    const record = parseCommitment(e);
    if (!record) continue;
    const refKey = `${record.startKey}#${record.endKey}`;
    if (seenRefKeys.has(refKey)) continue; // 同窗多次登记取先到的一条 (窗口本身相同)
    seenRefKeys.add(refKey);
    if (record.endKey >= todayKey) parsed.push(record);
  }
  parsed.sort((a, b) => (a.startKey < b.startKey ? 1 : -1));

  const commitments: ActiveCommitmentGuard[] = parsed.map((record) => {
    const refKey = `${record.startKey}#${record.endKey}`;
    let assistCount = 0;
    let assistSaved = 0;
    const seenTriggers = new Set<string>();
    for (const e of events) {
      if (e.eventType !== 'challenge_completed') continue;
      const key = eventKeyOf(e);
      if (!key || key < record.startKey || key > record.endKey) continue;
      const meta = metaOf(e);
      if (!eventMatchesRecord(record, meta)) continue;
      const trig = e.triggerId || e.id || '';
      if (trig && seenTriggers.has(trig)) continue;
      if (trig) seenTriggers.add(trig);
      assistCount += 1;
      const amount = Number(meta?.savedAmount);
      if (Number.isFinite(amount) && amount > 0) assistSaved += amount;
    }
    return {
      kind: 'commitment',
      id: refKey,
      subject: record.subject,
      category: record.category,
      daysLeft: diffDays(todayKey, record.endKey),
      assistCount,
      assistSaved,
      startKey: record.startKey,
      endKey: record.endKey,
    };
  });

  // —— 冷静期: pending 记录 7 天未回访视同过期 ——
  const cooldowns: ActiveCooldownGuard[] = [];
  if (input.cooldown && now.getTime() - input.cooldown.dueAt <= COOLDOWN_STALE_MS) {
    cooldowns.push({
      kind: 'cooldown',
      id: 'prepurchase_pending',
      subject: input.cooldown.subject,
      category: resolveGuardCategory({ itemTitle: input.cooldown.subject }),
      guardedAmount: input.cooldown.amount,
      hoursLeft: Math.max(0, (input.cooldown.dueAt - now.getTime()) / 3600000),
      dueForRevisit: input.cooldown.dueAt <= now.getTime(),
    });
  }

  const totalCount = challenges.length + commitments.length + cooldowns.length;

  // —— 连续坚持天数: 最早一件 active 项发起日至今 (含尾) ——
  let persistDays = 0;
  if (totalCount > 0) {
    const startKeys: string[] = [];
    if (input.challenge && challenges.length > 0) {
      const t = new Date(input.challenge.createdAt).getTime();
      if (Number.isFinite(t)) startKeys.push(dateKeyOf(new Date(t)));
    }
    for (const c of commitments) startKeys.push(c.startKey);
    if (cooldowns.length > 0 && input.cooldown) startKeys.push(dateKeyOf(new Date(input.cooldown.askedAt)));
    const earliest = startKeys.sort()[0];
    if (earliest) persistDays = Math.max(1, diffDays(earliest, todayKey) + 1);
  }

  return {
    status: totalCount > 0 ? 'ok' : 'empty',
    challenges,
    commitments,
    cooldowns,
    totalCount,
    persistDays,
  };
}
