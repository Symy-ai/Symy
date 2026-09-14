/**
 * Monthly Guard Statement — 月度守护账单 (batch54-b)
 *
 * 月底收官视角: "这个月我守住了什么"。从既有 health_events 只读派生
 * 一张可当账单读的月度结算单 (自然月口径, 与 weekly-guard-compare 的
 * 周一起始周口径区分; monthKey 形如 '2026-09', 对齐 triggerId 的
 * date-key 约定)。
 *
 * 口径红线:
 * - 拦截局数 / pass-abandon 结构与 49-c 漏斗同口径 (triggerId 去重),
 *   不重复实现胜率公式。
 * - 守护自由小时只经 freedom-time 共享通道换算 (U-4 默认 $25),
 *   禁止内联第二个默认时薪 (batch51-b 漂移教训)。
 * - 金额 (guardedAmount) 只存在于 private 字段, 类型层面与 public
 *   (分享面可用) 结构分离 — 分享面结构面无金额由类型保证。
 * - 品类分布复用 guard-category-insight 的 resolveGuardCategory 聚合。
 * - 绿色替代采纳复用 /api/green-alt/adoption 的落库约定
 *   (mindful_recovery + triggerId 前缀 'green-alt-adoption:' + metadata.kind)。
 * - 空月 (无拦截且无转存且无采纳) → noData 降级, 调用方渲染引导文案。
 * - 零 DDL / 零新持久化。
 */

import { DEFAULT_HOURLY_RATE, moneyToHours, formatFreedomTime } from '@/lib/freedom-time';
import {
  aggregateGuardCategoryInsights,
  topGuardCategories,
  type GuardInsightCategory,
} from '@/lib/guard-category-insight';
import type { TrendDirection } from '@/lib/weekly-guard-compare';

/** health_events 最小字段 (GET /api/buddy/health-events 返回的 camelCase 子集) */
export interface MonthlyGuardEventInput {
  id?: string;
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface MonthlyGuardStatementOptions {
  /** 自然月 key, 'YYYY-MM' (如 '2026-09'); 非法输入降级 noData */
  monthKey: string;
  /** 用户时薪 — 只经 freedom-time 共享通道, 非法值回落 DEFAULT_HOURLY_RATE */
  hourlyRate?: number;
  /** 'zh'|'en' — 决定 hoursLabel 单位词 (纯函数, 不依赖 i18n hook) */
  locale?: string;
}

/** 月度小象寄语档位 — 三档全温暖向 */
export type MonthlyStatementTone = 'harvest' | 'steady' | 'starting';

/** 分享面可用字段 — 结构上拿不到金额 (类型保证 amount-free) */
export interface MonthlyGuardStatementPublic {
  monthKey: string;
  /** 本月拦截局数 = passed + abandoned (triggerId 去重) */
  intercepts: number;
  passed: number;
  abandoned: number;
  /** 通过率 0..1; 本月 settled 为 0 时 null (无结论, 不是 0%) */
  passRate: number | null;
  /** 守护自由小时 (换算自转存金额, 但只有小时数, 无金额) */
  hoursReclaimed: number;
  /** locale 感知的自由时间标签 (如 '37 小时' / '37 hours') */
  hoursLabel: string;
  /** 按 resolveGuardCategory 聚合的品类分布 top 3 (排除 other) */
  topCategories: Array<{ category: GuardInsightCategory; count: number }>;
  /** 本月最长连胜天数 (当日 ≥1 passed 且 0 failed 的连续日数最大值) */
  longestStreakDays: number;
  /** 本月绿色替代采纳次数 (green-alt ledger 读取约定) */
  greenAltAdoptions: number;
  /** 上月同口径对比 (方向三档) */
  compare: {
    prevIntercepts: number;
    prevHoursReclaimed: number;
    /** 'noBaseline' = 上月无任何守护数据, 调用方不渲染对比行 */
    status: 'noBaseline' | 'ok';
    intercepts: TrendDirection;
    hoursReclaimed: TrendDirection;
  };
  /** 小象月度寄语档位 (丰收/平稳/起步, 全温暖向) */
  tone: MonthlyStatementTone;
}

/** App 内私享字段 — 金额只在这里, 永不进分享/荣誉面 */
export interface MonthlyGuardStatementPrivate {
  /** 本月转存金额合计 (Σ challenge_reward(deposit) amount) */
  guardedAmount: number;
}

export interface MonthlyGuardStatement {
  /** 'noData' = 本月无守护数据, 调用方渲染引导态 */
  status: 'noData' | 'ok';
  monthKey: string;
  public: MonthlyGuardStatementPublic;
  private: MonthlyGuardStatementPrivate;
}

/** green-alt adoption 落库约定 (与 /api/green-alt/adoption 同款) */
const GREEN_ALT_TRIGGER_PREFIX = 'green-alt-adoption:';

/** 单类事件的幂等去重 key: triggerId 优先, 缺失回退 id */
function dedupKey(e: MonthlyGuardEventInput, prefix: string): string {
  return `${prefix}:${e.triggerId || e.id || `${e.createdAt}:${e.eventType}`}`;
}

function emptyPublic(monthKey: string, locale: string): MonthlyGuardStatementPublic {
  return {
    monthKey,
    intercepts: 0,
    passed: 0,
    abandoned: 0,
    passRate: null,
    hoursReclaimed: 0,
    hoursLabel: formatFreedomTime(0, locale),
    topCategories: [],
    longestStreakDays: 0,
    greenAltAdoptions: 0,
    compare: {
      prevIntercepts: 0,
      prevHoursReclaimed: 0,
      status: 'noBaseline',
      intercepts: 'flat',
      hoursReclaimed: 'flat',
    },
    tone: 'starting',
  };
}

function trendOf(cur: number, prev: number): TrendDirection {
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

/** 'YYYY-MM' → [year, monthIndex]; 非法返回 null */
function parseMonthKey(monthKey: string): [number, number] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey || '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return [year, month];
}

/**
 * 纯函数: 聚合单月守护士单 + 上月对比。
 * 无效 createdAt 的条目跳过; 各类事件按 triggerId 去重 (与 49-c/50-c 同款防御)。
 * 月份归属以 createdAt 的本地时间为准 (跨月事件各归各月)。
 */
export function buildMonthlyStatement(
  events: MonthlyGuardEventInput[] | null | undefined,
  options: MonthlyGuardStatementOptions,
): MonthlyGuardStatement {
  const monthKey = options.monthKey;
  const locale = options.locale === 'zh' ? 'zh' : 'en';
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    return { status: 'noData', monthKey, public: emptyPublic(monthKey, locale), private: { guardedAmount: 0 } };
  }
  const [year, month] = parsed;
  const monthStart = new Date(year, month, 1);
  const nextMonthStart = new Date(year, month + 1, 1);
  const prevMonthStart = new Date(year, month - 1, 1);

  const pub = emptyPublic(monthKey, locale);
  const priv: MonthlyGuardStatementPrivate = { guardedAmount: 0 };

  /** 本地日期 → {passed, failed} (连胜口径, 仅本月) */
  const dayOutcomes = new Map<string, { passed: number; failed: number }>();
  /** 本月参与品类聚合的事件 (拦截 + 转存, 与品类透视同源) */
  const monthCategoryEvents: Array<{ metadata?: Record<string, unknown> | null }> = [];
  /** 上月桶 (对比行) */
  let prevIntercepts = 0;
  let prevGuardedAmount = 0;
  const seen = new Set<string>();
  const rate = Number.isFinite(options.hourlyRate) && (options.hourlyRate as number) > 0
    ? (options.hourlyRate as number)
    : DEFAULT_HOURLY_RATE;

  for (const e of events || []) {
    if (!e || typeof e.eventType !== 'string') continue;
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    const inMonth = local >= monthStart && local < nextMonthStart;
    const inPrevMonth = local >= prevMonthStart && local < monthStart;
    if (!inMonth && !inPrevMonth) continue;

    if (e.eventType === 'challenge_completed' || e.eventType === 'challenge_failed') {
      const key = dedupKey(e, e.eventType);
      if (seen.has(key)) continue;
      seen.add(key);
      const day = `${local.getFullYear()}-${local.getMonth()}-${local.getDate()}`;
      if (inMonth) {
        pub.intercepts += 1;
        if (e.eventType === 'challenge_completed') pub.passed += 1;
        else pub.abandoned += 1;
        const o = dayOutcomes.get(day) || { passed: 0, failed: 0 };
        if (e.eventType === 'challenge_completed') o.passed += 1;
        else o.failed += 1;
        dayOutcomes.set(day, o);
        monthCategoryEvents.push({ metadata: e.metadata });
      } else {
        prevIntercepts += 1;
      }
    } else if (e.eventType === 'challenge_reward' && e.triggerSource === 'deposit_api') {
      const meta = (e.metadata && typeof e.metadata === 'object') ? e.metadata : null;
      if (!meta || meta.source !== 'deposit') continue;
      const amount = Number(meta.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const key = dedupKey(e, 'deposit');
      if (seen.has(key)) continue;
      seen.add(key);
      if (inMonth) {
        priv.guardedAmount += amount;
        monthCategoryEvents.push({ metadata: e.metadata });
      } else {
        prevGuardedAmount += amount;
      }
    } else if (e.eventType === 'mindful_recovery'
      && typeof e.triggerId === 'string'
      && e.triggerId.startsWith(GREEN_ALT_TRIGGER_PREFIX)) {
      const meta = (e.metadata && typeof e.metadata === 'object') ? e.metadata : null;
      if (!meta || meta.kind !== 'green_alt_adoption') continue;
      const key = dedupKey(e, 'adoption');
      if (seen.has(key)) continue;
      seen.add(key);
      if (inMonth) pub.greenAltAdoptions += 1;
    }
  }

  // 空月: 无拦截且无转存且无采纳 → noData (引导态, 不造 0 结论)
  if (pub.intercepts === 0 && priv.guardedAmount === 0 && pub.greenAltAdoptions === 0) {
    return { status: 'noData', monthKey, public: pub, private: priv };
  }

  if (pub.intercepts > 0) pub.passRate = pub.passed / pub.intercepts;
  pub.hoursReclaimed = moneyToHours(priv.guardedAmount, rate);
  pub.hoursLabel = formatFreedomTime(pub.hoursReclaimed, locale);

  // 品类 top 3: 复用品类透视聚合 (other 排除, 同 count 稳定排序)
  pub.topCategories = topGuardCategories(aggregateGuardCategoryInsights(monthCategoryEvents, rate))
    .map((r) => ({ category: r.category, count: r.count }));

  // 本月最长连胜: 连续 "当日 ≥1 passed 且 0 failed" 的日数最大值
  // (相邻日以 Date.UTC 日序差 = 1 判定, 避开月末/DST 边界手算)
  const qualifyingOrdinals = [...dayOutcomes.entries()]
    .filter(([, o]) => o.passed >= 1 && o.failed === 0)
    .map(([day]) => {
      const [y, m, d] = day.split('-').map(Number);
      return Math.floor(Date.UTC(y, m, d) / 86400000);
    })
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prevOrdinal = Number.NaN;
  for (const ordinal of qualifyingOrdinals) {
    run = ordinal === prevOrdinal + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prevOrdinal = ordinal;
  }
  pub.longestStreakDays = best;

  // 上月对比行: 上月完全无数据 → noBaseline (不渲染 0/负趋势)
  const prevHasData = prevIntercepts > 0 || prevGuardedAmount > 0;
  const prevHours = moneyToHours(prevGuardedAmount, rate);
  pub.compare = prevHasData
    ? {
        prevIntercepts,
        prevHoursReclaimed: prevHours,
        status: 'ok',
        intercepts: trendOf(pub.intercepts, prevIntercepts),
        hoursReclaimed: trendOf(pub.hoursReclaimed, prevHours),
      }
    : pub.compare;

  // 小象寄语档位: 按拦截局数三档, 全温暖向 (起步也是"开始", 不是"差")
  pub.tone = pub.intercepts >= 10 ? 'harvest' : pub.intercepts >= 3 ? 'steady' : 'starting';

  return { status: 'ok', monthKey, public: pub, private: priv };
}
