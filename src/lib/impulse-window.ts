/**
 * Impulse Window — 冲动高发时段聚合 (batch48-c)
 *
 * 从既有守护事件 (health_events challenge_reward, 含 guard_ledger 同源时间戳)
 * 按本地时区的小时数聚合成 4 个时段桶, 找出占比最高的"危险窗口"。
 *
 * 口径红线:
 * - 零 DDL / 只读: 仅消费事件 createdAt, 不碰 ledger 写入结构。
 * - 样本 < MIN_SAMPLE_SIZE 返回 insufficient 态, 不硬造结论。
 * - 时段判断恒用 Date.getHours() (本地时区); 测试以本地构造的固定 Date 注入, 无 UTC 炸弹。
 */

/** 时段边界常量 — 全部集中在此, 禁散落魔数 */
export const WINDOW_BOUNDARIES = {
  /** 清晨开始 (含) */
  dawnStart: 5,
  /** 白天开始 (含) */
  daytimeStart: 11,
  /** 晚间开始 (含) */
  eveningStart: 17,
  /** 深夜开始 (含) */
  lateNightStart: 22,
} as const;

/** 深夜窗口文案用的展示区间 (跨零点) */
export const LATE_NIGHT_LABEL_RANGE = '22:00–05:00' as const;

/**
 * 默认深夜小时集 (本地时区 0..23, 跨零点) — 由 WINDOW_BOUNDARIES 推导,
 * batch49-a 起深夜桶可注入 (用户自定义夜间窗口); 不传时行为与基线逐字节一致。
 */
export const DEFAULT_LATE_NIGHT_HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h).filter(
  (h) => h >= WINDOW_BOUNDARIES.lateNightStart || h < WINDOW_BOUNDARIES.dawnStart,
);

/** 样本量阈值: 少于该条数不做结论 */
export const MIN_SAMPLE_SIZE = 8;

/** 占比阈值: top 桶占比 ≥ 该值才算"高危结论" (dominant), 否则文案不夸大 */
export const DOMINANT_SHARE_THRESHOLD = 0.35;

export type ImpulseWindowId = 'dawn' | 'daytime' | 'evening' | 'lateNight';

export const WINDOW_IDS: readonly ImpulseWindowId[] = ['dawn', 'daytime', 'evening', 'lateNight'];

/** 聚合输入: 一条守护事件的最小形状 (health_events camelCase 子集) */
export interface ImpulseWindowEventInput {
  /** ISO 字符串或 Date; 无效条目跳过不计样本 */
  createdAt?: string | Date | null;
}

export interface ImpulseWindowSummary {
  /** 'insufficient' = 样本不足, 不渲染伪洞察 */
  status: 'insufficient' | 'ok';
  /** 占比最高时段 (insufficient 时为 null) */
  topWindow: ImpulseWindowId | null;
  /** top 桶占比 0..1 (insufficient 时 0) */
  topShare: number;
  /** top 桶样本量 */
  topCount: number;
  /** 有效总样本量 */
  total: number;
  /** top 占比 ≥ DOMINANT_SHARE_THRESHOLD 才为 true; false 时文案不得夸大 */
  dominant: boolean;
  /** 各桶计数 (不含零值桶的也补零, 顺序同 WINDOW_IDS) */
  counts: Record<ImpulseWindowId, number>;
}

/** 深夜小时集参数: 数组或 Set; 传空数组表示无深夜小时 */
export type LateNightHoursInput = ReadonlySet<number> | readonly number[];

function toHourSet(hours: LateNightHoursInput): Set<number> {
  if (hours instanceof Set) return hours;
  return new Set(hours);
}

/** 小时 (0..23) → 时段桶; 深夜桶可注入 (batch49-a), 默认 22:00–05:00 与基线一致 */
export function hourToWindow(hour: number, lateNightHours: LateNightHoursInput = DEFAULT_LATE_NIGHT_HOURS): ImpulseWindowId {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (toHourSet(lateNightHours).has(h)) return 'lateNight';
  // 不在深夜集合内的小时落入相邻桶: 傍晚侧 (>=eveningStart) 归 evening, 凌晨侧归 dawn
  if (h >= WINDOW_BOUNDARIES.eveningStart) return 'evening';
  if (h >= WINDOW_BOUNDARIES.daytimeStart) return 'daytime';
  return 'dawn';
}

/** 某时刻是否落在指定时段窗口内 (本地时区); 深夜桶可注入 */
export function isDateInWindow(
  date: Date,
  windowId: ImpulseWindowId,
  lateNightHours: LateNightHoursInput = DEFAULT_LATE_NIGHT_HOURS,
): boolean {
  return hourToWindow(date.getHours(), lateNightHours) === windowId;
}

function emptyCounts(): Record<ImpulseWindowId, number> {
  return { dawn: 0, daytime: 0, evening: 0, lateNight: 0 };
}

/**
 * 聚合守护事件的时段分布。
 * createdAt 解析失败 (NaN) 的条目直接丢弃, 不计入 total。
 */
export function aggregateImpulseWindows(
  events: ImpulseWindowEventInput[] | null | undefined,
  lateNightHours: LateNightHoursInput = DEFAULT_LATE_NIGHT_HOURS,
): ImpulseWindowSummary {
  const counts = emptyCounts();
  const hourSet = toHourSet(lateNightHours);
  let total = 0;

  for (const e of events || []) {
    if (!e) continue;
    const date = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
    const time = date.getTime();
    if (!Number.isFinite(time)) continue;
    counts[hourToWindow(date.getHours(), hourSet)] += 1;
    total += 1;
  }

  if (total < MIN_SAMPLE_SIZE) {
    return {
      status: 'insufficient',
      topWindow: null,
      topShare: 0,
      topCount: 0,
      total,
      dominant: false,
      counts,
    };
  }

  let topWindow: ImpulseWindowId = WINDOW_IDS[0];
  for (const id of WINDOW_IDS) {
    if (counts[id] > counts[topWindow]) topWindow = id;
  }
  const topCount = counts[topWindow];
  const topShare = topCount / total;

  return {
    status: 'ok',
    topWindow,
    topShare,
    topCount,
    total,
    dominant: topShare >= DOMINANT_SHARE_THRESHOLD,
    counts,
  };
}
