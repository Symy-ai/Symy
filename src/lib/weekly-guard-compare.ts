/**
 * Weekly Guard Compare — 守护周对比 (batch50-c)
 *
 * 从既有 health_events 只读派生"本周 vs 上周"三个指标:
 *   拦截参与次数 = challenge_completed + challenge_failed (与 49-c 漏斗同口径, triggerId 去重)
 *   挑战通过率   = passed / settled (settled 为 0 时该周无结论, 记 null)
 *   守护自由小时 = Σ challenge_reward(deposit) amount / hourlyRate (U-4 默认 $25)
 *
 * 口径红线:
 * - 周界以传入 now 的本地周一 00:00 为起点 (跨年/时区由调用方注入 now 决定, 函数本身纯)。
 * - 上周完全无数据 (拦截与转存均为 0) 返回 'noBaseline', 前端走"下周开始对比"引导态,
 *   不渲染 0% 或负趋势 (沿用 49-c 反假洞察原则)。
 * - 小时/金额仅用户私域 insight 展示, 永不进分享面 (红线)。
 */

import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';

export { DEFAULT_HOURLY_RATE };

export type TrendDirection = 'up' | 'flat' | 'down';

/** health_events 最小字段 (GET /api/buddy/health-events 返回的 camelCase 子集) */
export interface WeeklyGuardEventInput {
  id?: string;
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/** 单周聚合: 三指标的原始分子 + 派生值 */
export interface WeeklyGuardBucket {
  /** 拦截参与次数 (有结局的局数, 去重后) */
  intercepts: number;
  passed: number;
  /** 通过率 0..1; 本周 settled 为 0 时 null (无结论, 不是 0%) */
  passRate: number | null;
  /** 守护金额 (Σ转存条目 amount, 仅私有统计, 不进分享面) */
  guardedAmount: number;
  /** guardedAmount / hourlyRate 换算的自由小时数 */
  hoursReclaimed: number;
}

export interface WeeklyGuardCompareResult {
  /** 'noBaseline' = 上周无任何守护数据, 调用方渲染引导态而非对比 */
  status: 'noBaseline' | 'ok';
  thisWeek: WeeklyGuardBucket;
  lastWeek: WeeklyGuardBucket;
  /** 三指标趋势: 相等 → flat (含双方均无结论的 passRate) */
  trends: {
    intercepts: TrendDirection;
    passRate: TrendDirection;
    hoursReclaimed: TrendDirection;
  };
}

/** 单类事件的幂等去重 key: triggerId 优先 (写入方约定), 缺失回退 id */
function dedupKey(e: WeeklyGuardEventInput, prefix: string): string {
  return `${prefix}:${e.triggerId || e.id || `${e.createdAt}:${e.eventType}`}`;
}

/** 本地周一 00:00 为周起点 */
export function localWeekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday=0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
}

function emptyBucket(): WeeklyGuardBucket {
  return { intercepts: 0, passed: 0, passRate: null, guardedAmount: 0, hoursReclaimed: 0 };
}

function bucketHasData(b: WeeklyGuardBucket): boolean {
  return b.intercepts > 0 || b.guardedAmount > 0;
}

function trendOf(cur: number, prev: number): TrendDirection {
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

function rateTrend(cur: number | null, prev: number | null): TrendDirection {
  if (cur === null || prev === null) return 'flat';
  return trendOf(cur, prev);
}

/**
 * 纯函数: 聚合本周/上周三指标 + 趋势。无效 createdAt 的条目跳过;
 * 三类事件各自按 triggerId 去重 (与 deriveGuardWinRate 同款防御)。
 */
export function weeklyGuardCompare(
  events: WeeklyGuardEventInput[] | null | undefined,
  now: Date,
  hourlyRate: number = DEFAULT_HOURLY_RATE,
): WeeklyGuardCompareResult {
  const thisWeekStart = localWeekStart(now);
  const lastWeekStart = new Date(
    thisWeekStart.getFullYear(),
    thisWeekStart.getMonth(),
    thisWeekStart.getDate() - 7,
  );

  const thisWeek = emptyBucket();
  const lastWeek = emptyBucket();
  const seen = new Set<string>();
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE;

  for (const e of events || []) {
    if (!e || typeof e.eventType !== 'string') continue;
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;

    const d = new Date(t);
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    let bucket: WeeklyGuardBucket;
    if (local >= thisWeekStart) bucket = thisWeek;
    else if (local >= lastWeekStart) bucket = lastWeek;
    else continue; // 更早的历史不参与对比

    if (e.eventType === 'challenge_completed' || e.eventType === 'challenge_failed') {
      const key = dedupKey(e, e.eventType);
      if (seen.has(key)) continue;
      seen.add(key);
      bucket.intercepts += 1;
      if (e.eventType === 'challenge_completed') bucket.passed += 1;
    } else if (e.eventType === 'challenge_reward' && e.triggerSource === 'deposit_api') {
      const meta = (e.metadata && typeof e.metadata === 'object') ? e.metadata : null;
      if (!meta || meta.source !== 'deposit') continue;
      const amount = Number(meta.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const key = dedupKey(e, 'deposit');
      if (seen.has(key)) continue;
      seen.add(key);
      bucket.guardedAmount += amount;
    }
  }

  for (const b of [thisWeek, lastWeek]) {
    if (b.intercepts > 0) b.passRate = b.passed / b.intercepts;
    b.hoursReclaimed = b.guardedAmount / rate;
  }

  if (!bucketHasData(lastWeek)) {
    return {
      status: 'noBaseline',
      thisWeek,
      lastWeek,
      trends: { intercepts: 'flat', passRate: 'flat', hoursReclaimed: 'flat' },
    };
  }

  return {
    status: 'ok',
    thisWeek,
    lastWeek,
    trends: {
      intercepts: trendOf(thisWeek.intercepts, lastWeek.intercepts),
      passRate: rateTrend(thisWeek.passRate, lastWeek.passRate),
      hoursReclaimed: trendOf(thisWeek.hoursReclaimed, lastWeek.hoursReclaimed),
    },
  };
}
