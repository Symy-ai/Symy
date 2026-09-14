/**
 * recent-wins — 小象高光记忆纯派生 (batch54-a)
 *
 * 近 14 天「用户赢了」的结构化记忆, 对冲 failure-heavy 注入 (挑战历史/盲区):
 *   - 承诺守住: manual_adjustment + source='green_commitment_settlement' + outcome='kept'
 *     (ref_key=start#end 对应登记记录, 取 subject 原词与 commitmentDays)
 *   - 守护连胜: guard-win-rate 的 streak 口径 (对 14 天窗口事件复用 deriveGuardWinRate)
 *   - cooldown 成功: manual_adjustment + source='cooldown_followup' + cooldown_success=true
 *   - 复盘 worth: manual_adjustment + source='post_purchase_review' + rating='worth'
 *
 * 口径红线:
 * - 零 DDL / 零新持久化: 只读既有 health_events, 口径全部读上游 source 约定,
 *   连胜计算直接复用 deriveGuardWinRate, 不做第二套数。
 * - 输出类型结构面无金额: 只有天数/次数/主题原词截断。
 * - 样本不足 (窗口内无任何高光) → null 稳定降级。
 * - 损坏 metadata / 无效 createdAt: 跳过该条, 绝不 throw。
 */

import { deriveGuardWinRate, type GuardWinRateEventInput } from '@/lib/guard-win-rate';
import { commitmentDays, GREEN_COMMITMENT_SETTLEMENT_SOURCE, GREEN_COMMITMENT_SOURCE } from '@/lib/green-commitment';
import { POST_PURCHASE_REVIEW_SOURCE } from '@/lib/post-purchase-review';

/** 高光回看窗口 (天) */
export const RECENT_WINS_WINDOW_DAYS = 14;

export type RecentWinKind = 'kept_promise' | 'guard_streak' | 'cooldown' | 'worth_review';

export interface RecentWinItem {
  kind: RecentWinKind;
  /** kept_promise/guard_streak: 天数; 次数类为 undefined */
  days?: number;
  /** cooldown/worth_review: 窗口内次数 */
  count?: number;
  /** 主题原词 (kept_promise 的承诺对象, 截断) */
  subject?: string | null;
  /** 该高光最近一次出现时间 (排序 tie-break, 非展示字段) */
  lastAt: string;
}

/** health_events 最小字段 (与既有注入点同款 camelCase 子集) */
export interface RecentWinsEventInput {
  eventType: string;
  triggerSource?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

const REF_KEY_RE = /^(\d{4}-\d{2}-\d{2})#(\d{4}-\d{2}-\d{2})$/;
const MIN_STREAK_DAYS = 2;

function metaOf(e: RecentWinsEventInput): Record<string, unknown> | null {
  return e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
}

/** 难度权重: 承诺守住 > 连胜 > 次数类 (简报排序口径) */
function difficultyRank(kind: RecentWinKind): number {
  switch (kind) {
    case 'kept_promise':
      return 3;
    case 'guard_streak':
      return 2;
    default:
      return 1;
  }
}

/**
 * 纯函数: 从 health_events 派生最近 14 天高光 (top 3, 难度优先 + 最近 tie-break)。
 * 无任何高光 → null。永不 throw。
 */
export function pickRecentWins(
  events: RecentWinsEventInput[] | null | undefined,
  now: Date,
): RecentWinItem[] | null {
  const list = (events || []).filter((e) => e && typeof e.createdAt === 'string');
  const nowMs = now.getTime();
  const windowMs = RECENT_WINS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // 窗口过滤 (无效 createdAt 跳过 — 高光派生不做数据修复)
  const windowed: RecentWinsEventInput[] = [];
  for (const e of list) {
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > nowMs || nowMs - t > windowMs) continue;
    windowed.push(e);
  }

  // 登记记录索引 (ref_key → subject): 登记可能早于 14 天窗口, 从全量列表取
  const subjectByRefKey = new Map<string, string | null>();
  for (const e of list) {
    if (e.eventType !== 'manual_adjustment') continue;
    const meta = metaOf(e);
    if (!meta || meta.source !== GREEN_COMMITMENT_SOURCE) continue;
    const startKey = typeof meta.start_key === 'string' ? meta.start_key : '';
    const endKey = typeof meta.end_key === 'string' ? meta.end_key : '';
    if (!startKey || !endKey) continue;
    const subject = typeof meta.subject === 'string' && meta.subject.trim() ? meta.subject.trim() : null;
    subjectByRefKey.set(`${startKey}#${endKey}`, subject);
  }

  const items: RecentWinItem[] = [];

  // 1. 承诺守住 (kept 结算标记, 窗口内)
  for (const e of windowed) {
    if (e.eventType !== 'manual_adjustment') continue;
    const meta = metaOf(e);
    if (!meta || meta.source !== GREEN_COMMITMENT_SETTLEMENT_SOURCE || meta.outcome !== 'kept') continue;
    const refKey = typeof meta.ref_key === 'string' ? meta.ref_key : '';
    const m = refKey.match(REF_KEY_RE);
    if (!m) continue;
    items.push({
      kind: 'kept_promise',
      days: commitmentDays(m[1], m[2]),
      subject: (subjectByRefKey.get(refKey) ?? null)?.slice(0, 20) ?? null,
      lastAt: e.createdAt,
    });
  }

  // 2. 守护连胜 (复用 deriveGuardWinRate 的 streak 口径, 输入即窗口事件)
  const streak = deriveGuardWinRate(
    windowed.map((e) => ({
      eventType: e.eventType,
      triggerSource: e.triggerSource ?? null,
      triggerId: e.triggerId ?? null,
      metadata: e.metadata ?? null,
      createdAt: e.createdAt,
    })) satisfies GuardWinRateEventInput[],
  ).streakDays;
  if (streak >= MIN_STREAK_DAYS && windowed.length > 0) {
    const latest = windowed
      .filter((e) => e.eventType === 'challenge_completed' || e.eventType === 'challenge_failed')
      .map((e) => e.createdAt)
      .sort()
      .pop();
    items.push({ kind: 'guard_streak', days: streak, lastAt: latest || windowed[0].createdAt });
  }

  // 3+4. 次数类 (cooldown 成功 / worth 复盘), 各自按 review_key/条目幂等计数
  const cooldownSeen = new Set<string>();
  const worthSeen = new Set<string>();
  let cooldownCount = 0;
  let cooldownLast = '';
  let worthCount = 0;
  let worthLast = '';
  for (const e of windowed) {
    if (e.eventType !== 'manual_adjustment') continue;
    const meta = metaOf(e);
    if (!meta) continue;
    if (meta.source === 'cooldown_followup' && meta.cooldown_success === true) {
      const key = String(meta.review_key || e.triggerId || `${e.createdAt}:cooldown`);
      if (cooldownSeen.has(key)) continue;
      cooldownSeen.add(key);
      cooldownCount += 1;
      if (e.createdAt > cooldownLast) cooldownLast = e.createdAt;
    } else if (meta.source === POST_PURCHASE_REVIEW_SOURCE && meta.rating === 'worth') {
      const key = typeof meta.review_key === 'string' && meta.review_key ? `r:${meta.review_key}` : `r:${e.createdAt}`;
      if (worthSeen.has(key)) continue;
      worthSeen.add(key);
      worthCount += 1;
      if (e.createdAt > worthLast) worthLast = e.createdAt;
    }
  }
  if (cooldownCount > 0) items.push({ kind: 'cooldown', count: cooldownCount, lastAt: cooldownLast });
  if (worthCount > 0) items.push({ kind: 'worth_review', count: worthCount, lastAt: worthLast });

  if (items.length === 0) return null;

  items.sort((a, b) =>
    difficultyRank(b.kind) - difficultyRank(a.kind) || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0),
  );
  return items.slice(0, 3);
}
