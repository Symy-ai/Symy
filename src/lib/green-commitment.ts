/**
 * green-commitment — 绿色承诺追踪纯派生 (batch53-a)
 *
 * 用户在对话里承诺 "这个月不买 X" → 登记卡确认后写 manual_adjustment +
 * metadata {source='green_commitment', category, subject, start_key, end_key}
 * (对齐 triggerId 式日期键约定, 与 weekly-review/post-purchase-review 同通道, 零 DDL)。
 * 到期结算 (到期当天 chat 首轮以结算卡开场) 与结算消解 (source=
 * 'green_commitment_settlement' + ref_key) 也在本文件判定。
 *
 * 口径红线:
 * - 金额只进 hoursReclaimed (私有面); 分享/荣誉面结构上拿不到金额。
 * - 破戒 = 承诺期内该品类出现 challenge_failed — 话术层走非羞辱框架,
 *   本文件只给事实分支, 不做任何评判性字段。
 * - 品类匹配与 guard-category-insight 同词表 (resolveGuardCategory),
 *   另以 itemName 含承诺对象原词作补充命中 (零两套口径)。
 */

import { resolveGuardCategory } from '@/lib/guard-category-insight';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';
import type {
  GreenCommitmentDerivation,
  GreenCommitmentRecord,
  GreenCommitmentSettlement,
} from '@/types/green-commitment';

export type { GreenCommitmentDerivation, GreenCommitmentRecord, GreenCommitmentSettlement };

/** 承诺登记事件在 metadata.source 的标记 */
export const GREEN_COMMITMENT_SOURCE = 'green_commitment';
/** 承诺结算消解事件在 metadata.source 的标记 (一次性开场防重) */
export const GREEN_COMMITMENT_SETTLEMENT_SOURCE = 'green_commitment_settlement';

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 本地日期键 (YYYY-MM-DD) — 与 week_key/triggerId 同款无时区歧义写法 */
export function dateKeyOf(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** 本月最后一天的日期键 (默认档承诺的 end_key) */
export function monthEndKeyOf(date: Date): string {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return dateKeyOf(last);
}

/** 登记时算 end_key: fixed = start + days 天; month_end = 本月月底 */
export function commitmentEndKeyOf(start: Date, durationKind: 'fixed' | 'month_end', days: number | null): string {
  if (durationKind === 'fixed' && days && days >= 1) {
    return dateKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));
  }
  return monthEndKeyOf(start);
}

/** 承诺时长 (start..end 含尾, 天) — end < start 防御性返回 0 */
export function commitmentDays(startKey: string, endKey: string): number {
  const start = new Date(startKey + 'T00:00:00');
  const end = new Date(endKey + 'T00:00:00');
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

function metaOf(e: WeeklyGuardEventInput): Record<string, unknown> | null {
  return e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
}

/** 事件本地日期键 (无效 createdAt 返回 null, 调用方跳过) */
function eventKeyOf(e: WeeklyGuardEventInput): string | null {
  const t = new Date(e.createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return dateKeyOf(d);
}

function parseRecord(e: WeeklyGuardEventInput): GreenCommitmentRecord | null {
  const meta = metaOf(e);
  if (!meta || meta.source !== GREEN_COMMITMENT_SOURCE) return null;
  const startKey = typeof meta.start_key === 'string' && KEY_RE.test(meta.start_key) ? meta.start_key : null;
  const endKey = typeof meta.end_key === 'string' && KEY_RE.test(meta.end_key) ? meta.end_key : null;
  if (!startKey || !endKey || endKey < startKey) return null;
  const subject = typeof meta.subject === 'string' && meta.subject.trim() ? meta.subject.trim() : null;
  return { category: resolveGuardCategory({ category: meta.category, itemTitle: subject }), subject, startKey, endKey };
}

/** 结算消解标记 key — `start#end` */
export function commitmentRefKey(startKey: string, endKey: string): string {
  return `${startKey}#${endKey}`;
}

/** 品类/对象匹配 — 词表命中或 itemName 含承诺对象原词 (大小写不敏感) */
function eventMatchesCommitment(record: GreenCommitmentRecord, meta: Record<string, unknown> | null): boolean {
  if (resolveGuardCategory(meta) === record.category && record.category !== 'other') return true;
  if (record.subject && meta) {
    const itemName = typeof meta.itemName === 'string' ? meta.itemName : '';
    if (itemName && itemName.toLowerCase().includes(record.subject.toLowerCase())) return true;
  }
  return false;
}

/**
 * 纯函数: 派生到期结算 + 进行中承诺。
 * events 需含 challenge_completed / challenge_failed / manual_adjustment 三类
 * (调用方一次性拉齐, 与 use-green-commitment 约定)。
 *
 * 结算分支: 窗口内 (start..end 含尾) 该品类 challenge_failed → broken;
 * 否则有任意守护事件 → kept (助攻 = 该品类 challenge_completed 去重计数);
 * 窗口内连任何守护事件都没有 → insufficient (不渲染假达成)。
 */
export function deriveGreenCommitment(
  events: WeeklyGuardEventInput[] | null | undefined,
  now: Date,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): GreenCommitmentDerivation {
  const list = events || [];
  const todayKey = dateKeyOf(now);
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;

  const records: GreenCommitmentRecord[] = [];
  const settledRefKeys = new Set<string>();
  for (const e of list) {
    if (e.eventType !== 'manual_adjustment') continue;
    const meta = metaOf(e);
    if (meta?.source === GREEN_COMMITMENT_SETTLEMENT_SOURCE && typeof meta.ref_key === 'string') {
      settledRefKeys.add(meta.ref_key);
      continue;
    }
    const record = parseRecord(e);
    if (record) records.push(record);
  }

  // 最近登记在前 (同窗多次登记取最近一条)
  records.sort((a, b) => (a.startKey < b.startKey ? 1 : -1));

  let activeCommitment: GreenCommitmentRecord | null = null;
  let due: GreenCommitmentRecord | null = null;
  for (const r of records) {
    if (!activeCommitment && r.endKey >= todayKey) activeCommitment = r;
    // 到期当天 (endKey == todayKey) 的首轮对话即结算 — 窗口含尾, 当天守护事件照常计入
    if (!due && r.endKey <= todayKey && !settledRefKeys.has(commitmentRefKey(r.startKey, r.endKey))) {
      due = r;
    }
    if (activeCommitment && due) break;
  }

  if (!due) return { dueSettlement: null, activeCommitment };

  let assistCount = 0;
  let savedTotal = 0;
  let broken = false;
  let anyGuardActivity = false;
  const seenTriggers = new Set<string>();
  for (const e of list) {
    if (e.eventType !== 'challenge_completed' && e.eventType !== 'challenge_failed') continue;
    const key = eventKeyOf(e);
    if (!key || key < due.startKey || key > due.endKey) continue;
    anyGuardActivity = true;
    const meta = metaOf(e);
    if (!eventMatchesCommitment(due, meta)) continue;
    if (e.eventType === 'challenge_failed') {
      broken = true;
    } else {
      const trig = e.triggerId || e.id || '';
      if (trig && seenTriggers.has(trig)) continue;
      if (trig) seenTriggers.add(trig);
      assistCount += 1;
      const amount = Number(meta?.savedAmount);
      if (Number.isFinite(amount) && amount > 0) savedTotal += amount;
    }
  }

  const settlement: GreenCommitmentSettlement = {
    record: due,
    outcome: broken ? 'broken' : anyGuardActivity ? 'kept' : 'insufficient',
    days: commitmentDays(due.startKey, due.endKey),
    assistCount,
    hoursReclaimed: savedTotal / rate,
    refKey: commitmentRefKey(due.startKey, due.endKey),
  };
  return { dueSettlement: settlement, activeCommitment };
}
