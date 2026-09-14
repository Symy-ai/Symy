/**
 * guard-pulse — 按小时守护脉搏 (纯函数, batch68-c)
 *
 * 用户已经能看到周环比、月度热力图与未来 7 天预报, 但还不知道「一天中
 * 什么时候最容易破防」。本模块把既有守护事件按 0-23 小时 (用户本地时区)
 * 聚合出近 28 天的触发节奏, 识别 1-2 个高风险时段, 供 chat 数据问答
 * (parts/guard-pulse-turn.ts) 消费; 后续 push 任务可消费 DTO 里的
 * suggestion 字段 (本模块不做任何推送)。
 *
 * 口径红线:
 * - 零 DDL / 只读: 只消费事件 createdAt + eventType + metadata.kind, 不碰写路径。
 * - 事件口径与 category-guard-counts 同源: 拦截轮次 = challenge_completed +
 *   challenge_failed; 采纳 = mindful_recovery + metadata.kind
 *   (green_alt_adoption / reuse_adoption)。其余类型 (reward/手记) 不计入。
 * - 稳定降级: activeDays < MIN_ACTIVE_DAYS 或总样本 < MIN_TOTAL_SAMPLE 恒
 *   'insufficient', 不用单日噪声下结论。
 * - 高风险时段可测: 小时须落在 ≥ MIN_HOUR_ACTIVE_DAYS 个不同日子才够格;
 *   从密度最高的种子小时沿相邻小时双向合并 (循环邻接, 跨零点也算相邻),
 *   至多 MAX_WINDOW_HOURS 小时; 第二时段密度须 ≥ 第一时段一半才输出。
 * - 展示红线: 输出结构只有小时/次数/天数/密度 — 无金额无碳数值; 等级只
 *   描述触发节奏 (high/medium), 不做失败人格标签。
 * - 时区: IANA 字符串经 Intl 换算本地小时与日子 (无效/缺失回退运行时本地);
 *   DST 与非整小时偏移由 formatToParts 自然处理, 跨日事件按本地日子归属。
 */

/** 回看窗口: 最近 28 天 (含今天, 按用户本地日子计) */
export const PULSE_LOOKBACK_DAYS = 28;

/** 样本不足判定: 有记录的日子少于该数 → insufficient */
export const MIN_ACTIVE_DAYS = 3;

/** 样本不足判定: 可读事件少于该数 → insufficient */
export const MIN_TOTAL_SAMPLE = 6;

/** 单小时成时段的门槛: 该小时须落在至少 N 个不同日子 (单日极端不成时段) */
export const MIN_HOUR_ACTIVE_DAYS = 2;

/** 相邻合并上限: 单个高风险时段至多跨 N 个小时 */
export const MAX_WINDOW_HOURS = 4;

/** 相邻小时并入门槛: 密度 ≥ 种子小时密度 × 该比例才并入 */
export const EXPAND_RATIO = 0.5;

/** 第二时段输出门槛: 密度 ≥ 第一时段密度 × 该比例才输出 */
export const SECOND_WINDOW_RATIO = 0.5;

/** 等级边界: 时段密度 ≥ 全局日均密度 × 该倍数 → high, 否则 medium */
export const HIGH_DENSITY_RATIO = 2;

/** 时段前行动建议 — 可执行动作 id, 供卡片文案与后续 push 消费 */
export type GuardPulseSuggestion = 'move_cart_earlier' | 'delay_24h' | 'wishlist_next_noon';

/** 聚合输入: 一条守护事件的最小形状 (health_events camelCase 子集) */
export interface GuardPulseEventInput {
  eventType?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface GuardPulseHourStat {
  /** 0-23 (用户本地小时) */
  hour: number;
  /** 该小时拦截轮次 (completed + failed) */
  intercepts: number;
  /** 该小时采纳次数 (替代 + 复用) */
  adoptions: number;
  /** 该小时有事件的不同日子数 */
  activeDays: number;
}

export interface GuardPulseWindow {
  /** 时段内小时集合 (升序) */
  hours: number[];
  /** 展示起点 (本地小时; 跨零点时段为时钟上的起点) */
  startHour: number;
  /** 展示终点 (含; startHour === endHour 表示单小时) */
  endHour: number;
  /** 时段是否跨零点 (如 23:00-01:00) */
  wrapsMidnight: boolean;
  intercepts: number;
  adoptions: number;
  /** 时段覆盖的不同日子数 */
  activeDays: number;
  /** 每活跃日平均事件数 (触发密度; 保留原始浮点, 展示层不直接渲染) */
  density: number;
  level: 'high' | 'medium';
  /** 时段前可执行动作 (DTO 保留字段, 本任务不接线 push) */
  suggestion: GuardPulseSuggestion;
}

export interface GuardPulse {
  /** 'insufficient' = 样本不足, windows 恒空, 不渲染伪结论 */
  status: 'ok' | 'insufficient';
  lookbackDays: number;
  /** 实际参与换算的时区 (无效/缺失输入回退运行时本地时区, 如实带出) */
  resolvedTimezone: string;
  totalIntercepts: number;
  totalAdoptions: number;
  /** 近 28 天有守护事件的不同本地日子数 */
  activeDays: number;
  /** 0-23 逐小时统计, 恒 24 行 (insufficient 时也如实带出) */
  hours: GuardPulseHourStat[];
  /** 高风险时段 (0-2 个, 密度降序); insufficient 时恒空 */
  windows: GuardPulseWindow[];
  /** 近 28 天可读事件总数 */
  totalSample: number;
}

/** 拦截结算事件 (与 category-guard-counts 同口径) */
function isSettledRound(eventType: string): boolean {
  return eventType === 'challenge_completed' || eventType === 'challenge_failed';
}

/** 采纳事件: mindful_recovery + metadata.kind (与 guard-style-profile 同轨道) */
function isAdoptionEvent(eventType: string, metadata: Record<string, unknown> | null | undefined): boolean {
  if (eventType !== 'mindful_recovery') return false;
  return metadata?.kind === 'green_alt_adoption' || metadata?.kind === 'reuse_adoption';
}

interface HourBucket {
  intercepts: number;
  adoptions: number;
  days: Set<number>;
}

/**
 * 时区读取器: 把时刻换算成目标时区的 {本地小时, 本地日子序号}。
 * dayNumber 用 UTC 日序号表示本地日子, 日子差值计算天然免疫 DST。
 * 无效时区返回 null (调用方回退运行时本地 getter)。
 */
function createTzReader(
  timeZone: string,
): ((d: Date) => { hour: number; dayNumber: number }) | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return (d: Date) => {
      const parts = fmt.formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      let hour = Number.parseInt(get('hour'), 10);
      if (hour === 24) hour = 0;
      const year = Number(get('year'));
      const month = Number(get('month'));
      const day = Number(get('day'));
      const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
      return { hour, dayNumber };
    };
  } catch {
    // safe to ignore: 无效 IANA 时区 — 调用方以 null 回退运行时本地时区, 不中断聚合
    return null;
  }
}

/** 回退读取器: 运行时本地时区 (服务端通常 UTC; 测试注入本地 Date) */
function localReader(d: Date): { hour: number; dayNumber: number } {
  const dayNumber = Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
  return { hour: d.getHours(), dayNumber };
}

/** 小时展示区间: 跨零点时段的时钟起点 = 线性缺口最后一小时 + 1 */
function windowBounds(hours: number[]): {
  startHour: number;
  endHour: number;
  wrapsMidnight: boolean;
} {
  const sorted = [...hours].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const wraps = max - min + 1 !== sorted.length;
  if (!wraps) return { startHour: min, endHour: max, wrapsMidnight: false };
  let gapMax = -1;
  for (let h = 0; h < 24; h++) {
    if (!hours.includes(h)) gapMax = h;
  }
  const startHour = (gapMax + 1) % 24;
  const endHour = (startHour + sorted.length - 1) % 24;
  return { startHour, endHour, wrapsMidnight: true };
}

/** 时段前动作: 采纳占半 → 收藏夹次日午休; 高风险 → 清购物车; 其余 → 延后 24h */
function pickSuggestion(intercepts: number, adoptions: number, level: 'high' | 'medium'): GuardPulseSuggestion {
  const total = intercepts + adoptions;
  if (total > 0 && adoptions / total >= 0.5) return 'wishlist_next_noon';
  return level === 'high' ? 'move_cart_earlier' : 'delay_24h';
}

/** 够格小时池的条目 */
interface PoolEntry {
  events: number;
  intercepts: number;
  adoptions: number;
  density: number;
  days: Set<number>;
}

/**
 * 池中种子小时: 密度 → 事件数 → 小时号 (确定性裁决, 表驱动测试锁定)。
 */
function pickSeedHour(pool: Map<number, PoolEntry>): number | null {
  let best: number | null = null;
  for (const [hour, stat] of pool) {
    if (best === null) {
      best = hour;
      continue;
    }
    const bestStat = pool.get(best)!;
    if (stat.density > bestStat.density) best = hour;
    else if (stat.density === bestStat.density) {
      if (stat.events > bestStat.events) best = hour;
      else if (stat.events === bestStat.events && hour < best) best = hour;
    }
  }
  return best;
}

/**
 * 从种子小时沿循环相邻小时双向合并出时段: 邻格须够格且密度 ≥ 种子密度 ×
 * EXPAND_RATIO, 每步并入事件更多的那一侧, 至多 MAX_WINDOW_HOURS 小时。
 * 从池中删除已并入的小时 (供第二时段在剩余小时上重挑种子)。
 */
function buildWindow(pool: Map<number, PoolEntry>, seed: number): {
  hours: number[];
  intercepts: number;
  adoptions: number;
  days: Set<number>;
  density: number;
} {
  const seedStat = pool.get(seed)!;
  const chain: number[] = [seed];
  let intercepts = seedStat.intercepts;
  let adoptions = seedStat.adoptions;
  const days = new Set(seedStat.days);
  pool.delete(seed);

  const threshold = seedStat.density * EXPAND_RATIO;
  while (chain.length < MAX_WINDOW_HOURS) {
    const prev = (chain[0] + 23) % 24;
    const next = (chain[chain.length - 1] + 1) % 24;
    const prevOk = pool.has(prev) && pool.get(prev)!.density >= threshold;
    const nextOk = pool.has(next) && pool.get(next)!.density >= threshold;
    if (!prevOk && !nextOk) break;
    let pick: number;
    if (prevOk && nextOk) {
      pick = pool.get(prev)!.events >= pool.get(next)!.events ? prev : next;
    } else {
      pick = prevOk ? prev : next;
    }
    const stat = pool.get(pick)!;
    if (pick === prev) chain.unshift(pick);
    else chain.push(pick);
    intercepts += stat.intercepts;
    adoptions += stat.adoptions;
    for (const d of stat.days) days.add(d);
    pool.delete(pick);
  }

  const events = intercepts + adoptions;
  return {
    hours: chain,
    intercepts,
    adoptions,
    days,
    density: days.size > 0 ? events / days.size : 0,
  };
}

/**
 * 聚合按小时守护脉搏。纯函数: 无效条目跳过, 空/undefined 输入恒
 * insufficient, 绝不抛错。样本达标才输出 0-2 个高风险时段。
 */
export function aggregateGuardPulse(
  events: GuardPulseEventInput[] | null | undefined,
  now: Date,
  timeZone?: string | null,
): GuardPulse {
  const tz = typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : null;
  const tzReader = tz ? createTzReader(tz) : null;
  const reader = tzReader ?? localReader;
  const resolvedTimezone = tzReader ? tz! : Intl.DateTimeFormat().resolvedOptions().timeZone;

  const buckets: HourBucket[] = Array.from({ length: 24 }, () => ({ intercepts: 0, adoptions: 0, days: new Set<number>() }));
  const allDays = new Set<number>();
  let totalIntercepts = 0;
  let totalAdoptions = 0;
  let totalSample = 0;
  const nowDay = reader(now).dayNumber;

  for (const e of events || []) {
    if (!e) continue;
    const eventType = typeof e.eventType === 'string' ? e.eventType : '';
    const isAdoption = isAdoptionEvent(eventType, e.metadata);
    if (!isSettledRound(eventType) && !isAdoption) continue;
    const date = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
    const time = date.getTime();
    if (!Number.isFinite(time)) continue;
    const { hour, dayNumber } = reader(date);
    const daysAgo = nowDay - dayNumber;
    if (daysAgo < 0 || daysAgo >= PULSE_LOOKBACK_DAYS) continue;

    const bucket = buckets[hour];
    if (isAdoption) {
      bucket.adoptions += 1;
      totalAdoptions += 1;
    } else {
      bucket.intercepts += 1;
      totalIntercepts += 1;
    }
    bucket.days.add(dayNumber);
    allDays.add(dayNumber);
    totalSample += 1;
  }

  const hours: GuardPulseHourStat[] = buckets.map((b, hour) => ({
    hour,
    intercepts: b.intercepts,
    adoptions: b.adoptions,
    activeDays: b.days.size,
  }));

  const activeDays = allDays.size;
  const enough = activeDays >= MIN_ACTIVE_DAYS && totalSample >= MIN_TOTAL_SAMPLE;
  const windows: GuardPulseWindow[] = [];
  if (enough) {
    const globalDensity = activeDays > 0 ? totalSample / activeDays : 0;
    const pool = new Map<number, PoolEntry>();
    for (const h of hours) {
      const events_ = h.intercepts + h.adoptions;
      if (h.activeDays >= MIN_HOUR_ACTIVE_DAYS && events_ > 0) {
        pool.set(h.hour, {
          events: events_,
          intercepts: h.intercepts,
          adoptions: h.adoptions,
          density: events_ / h.activeDays,
          days: buckets[h.hour].days,
        });
      }
    }

    while (pool.size > 0 && windows.length < 2) {
      const seed = pickSeedHour(pool);
      if (seed === null) break;
      const win = buildWindow(pool, seed);
      const prev = windows[0];
      if (prev && win.density < prev.density * SECOND_WINDOW_RATIO) break;
      const level: 'high' | 'medium' =
        globalDensity > 0 && win.density >= globalDensity * HIGH_DENSITY_RATIO ? 'high' : 'medium';
      windows.push({
        hours: [...win.hours].sort((a, b) => a - b),
        ...windowBounds(win.hours),
        intercepts: win.intercepts,
        adoptions: win.adoptions,
        activeDays: win.days.size,
        density: win.density,
        level,
        suggestion: pickSuggestion(win.intercepts, win.adoptions, level),
      });
    }
  }

  return {
    status: enough ? 'ok' : 'insufficient',
    lookbackDays: PULSE_LOOKBACK_DAYS,
    resolvedTimezone,
    totalIntercepts,
    totalAdoptions,
    activeDays,
    hours,
    windows,
    totalSample,
  };
}
