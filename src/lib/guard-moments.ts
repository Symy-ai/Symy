/**
 * guard-moments — 守护时刻时间线聚合 (batch58-a)
 *
 * "我和小象一起走过的时刻": 从 health_events 派生三类胜利时刻, 按时间倒序、
 * 按月分组, 供 chat 域时间线页回看:
 *   - 拦截 (guard): challenge_completed (冲动被守护)
 *   - 替代 (alt):   mindful_recovery + metadata.kind='green_alt_adoption'
 *   - 复用 (reuse): mindful_recovery + metadata.kind='reuse_adoption'
 *
 * 口径红线:
 * - 只庆祝胜利时刻: broken/failed 类事件不进时间线 (不采用羞辱框架)。
 * - estSaved/savedAmount 仅进 GuardMoment.estSaved 供 App 内展示, 分享面
 *   数据结构 (组件层 GuardMomentsShareData) 类型上无金额。
 * - 纯函数 / 零 IO / 零 DDL: 无效 createdAt 跳过, triggerId 去重。
 */

/** 三类时刻标识 — 与 guard-style-profile 三轨同语义 */
export type GuardMomentTrack = 'guard' | 'alt' | 'reuse';

/** 聚合输入: 一条 health_events 的最小形状 (与 guard-style-profile 同款) */
export interface GuardMomentEventInput {
  eventType?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

/** 单条胜利时刻 — estSaved 仅 App 内展示, 永不进分享面 */
export interface GuardMoment {
  id: string;
  track: GuardMomentTrack;
  date: Date;
  /** 该条省钱估算 (guard=savedAmount, alt/reuse=estSaved); 无则为 0 */
  estSaved: number;
}

/** 月分组 — monthKey 为本地时区 YYYY-MM, 组内时刻倒序 */
export interface GuardMomentMonthGroup {
  monthKey: string;
  moments: GuardMoment[];
}

export interface GuardMomentsTimeline {
  /** 'empty' = 无任何胜利时刻, 调用方渲染引导空态 */
  status: 'empty' | 'ok';
  /** 月份倒序 */
  months: GuardMomentMonthGroup[];
  trackCounts: { guard: number; alt: number; reuse: number };
  totalMoments: number;
  /** 有时刻的自然天数 (本地时区, 去重) */
  activeDays: number;
  /** 累计省钱估算 (App 内私享 only) */
  totalSaved: number;
}

function classifyTrack(e: GuardMomentEventInput): GuardMomentTrack | null {
  if (e.eventType === 'challenge_completed') return 'guard';
  const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
  if (!meta) return null;
  if (meta.kind === 'green_alt_adoption') return 'alt';
  if (meta.kind === 'reuse_adoption') return 'reuse';
  return null;
}

/** 该条省钱估算: guard=savedAmount, alt/reuse=estSaved; 无效/非正数为 0 */
function momentSaved(e: GuardMomentEventInput): number {
  const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
  if (!meta) return 0;
  const raw = e.eventType === 'challenge_completed' ? meta.savedAmount : meta.estSaved;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function emptyTimeline(): GuardMomentsTimeline {
  return {
    status: 'empty',
    months: [],
    trackCounts: { guard: 0, alt: 0, reuse: 0 },
    totalMoments: 0,
    activeDays: 0,
    totalSaved: 0,
  };
}

/**
 * 聚合三类胜利时刻为倒序时间线。
 * 无法归类 / createdAt 解析失败 / triggerId 重复的条目跳过;
 * 无有效时刻 → status='empty' (引导去完成第一次拦截, 不造伪数据)。
 */
export function aggregateGuardMoments(
  events: GuardMomentEventInput[] | null | undefined,
): GuardMomentsTimeline {
  if (!events || events.length === 0) return emptyTimeline();

  const seen = new Set<string>();
  const moments: GuardMoment[] = [];

  for (const e of events) {
    if (!e) continue;
    const track = classifyTrack(e);
    if (!track) continue;
    const date = e.createdAt instanceof Date ? e.createdAt : new Date(String(e.createdAt ?? ''));
    if (!Number.isFinite(date.getTime())) continue;
    if (typeof e.triggerId === 'string' && e.triggerId) {
      if (seen.has(e.triggerId)) continue;
      seen.add(e.triggerId);
    }

    moments.push({
      id: typeof e.triggerId === 'string' && e.triggerId ? e.triggerId : `${track}-${date.getTime()}`,
      track,
      date,
      estSaved: momentSaved(e),
    });
  }

  if (moments.length === 0) return emptyTimeline();

  // 时间倒序 (乱序输入归位)
  moments.sort((a, b) => b.date.getTime() - a.date.getTime());

  // 按月分组 (moments 已倒序, 组内保持倒序)
  const byMonth = new Map<string, GuardMoment[]>();
  const days = new Set<string>();
  const trackCounts = { guard: 0, alt: 0, reuse: 0 };
  let totalSaved = 0;
  for (const m of moments) {
    const key = monthKey(m.date);
    let group = byMonth.get(key);
    if (!group) {
      group = [];
      byMonth.set(key, group);
    }
    group.push(m);
    trackCounts[m.track] += 1;
    days.add(dayKey(m.date));
    totalSaved += m.estSaved;
  }

  // 月份倒序
  const months = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, group]) => ({ monthKey: key, moments: group }));

  return {
    status: 'ok',
    months,
    trackCounts,
    totalMoments: moments.length,
    activeDays: days.size,
    totalSaved,
  };
}
