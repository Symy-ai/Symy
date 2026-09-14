/**
 * guard-style-profile — 守护风格画像聚合 (batch56-c)
 *
 * 三轨横向对比 — "我的绿色风格是什么":
 *   - 拦截 (guard): health_events challenge_completed (冲动被守护)
 *   - 替代 (alt):   mindful_recovery + metadata.kind='green_alt_adoption'
 *   - 复用 (reuse): mindful_recovery + metadata.kind='reuse_adoption'
 *
 * 输出: 主导轨 (单轨占比 ≥50% 时明确命名, 否则'均衡型') + 三轨次数 +
 * 覆盖天数 + 连续风格天数 (主导轨未切换的连续活跃天数)。
 *
 * 口径红线:
 * - 输出类型结构面无金额: 各轨 estSaved/savedAmount 只做内部 tie-break 权重,
 *   永不进入输出字段 (红线测试锁定); 私享金额汇总由调用方另行计算。
 * - 样本不足 (三轨合计 <5) → status='insufficient' 稳定降级, 不造伪画像。
 * - 无主导轨 = 均衡型: 展示层用鼓励文案, 绝不暗示某轨"做得不够"。
 * - 纯函数 / 零 IO / 零 DDL: 无效 createdAt 跳过, triggerId 去重。
 */

/** 样本量阈值: 三轨合计少于该次数不出风格结论 (三轨画像需要比单轨更多样本) */
export const GUARD_STYLE_MIN_SAMPLE_SIZE = 5;

/** 三轨标识 */
export type GuardStyleTrack = 'guard' | 'alt' | 'reuse';

/** 风格名 — 主导轨命名 + 均衡型 (无主导轨的鼓励态, 非降级) */
export type GuardStyleId = 'interceptor' | 'substitutor' | 'reuser' | 'balanced';

/** 聚合输入: 一条 health_events 的最小形状 (camelCase 子集, 与 recent-wins 同款) */
export interface GuardStyleEventInput {
  eventType?: string | null;
  triggerId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

/** 三轨次数 — 纯计数, 无金额 */
export interface GuardStyleTrackCounts {
  guard: number;
  alt: number;
  reuse: number;
}

/** 风格画像聚合结果 — 纯计数/天数/标签, 结构上无金额 */
export interface GuardStyleProfile {
  /** 'insufficient' = 样本不足, 调用方渲染鼓励降级文案, 不渲染伪画像 */
  status: 'insufficient' | 'ok';
  styleId: GuardStyleId;
  trackCounts: GuardStyleTrackCounts;
  /** 三轨有效行动合计 */
  totalActions: number;
  /** 有任一轨行动的自然天数 (本地时区, 去重) */
  activeDays: number;
  /** 连续风格天数: 最近连续若干活跃日, 每日主导轨与全局主导轨一致 */
  styleStreakDays: number;
}

const TRACKS: readonly GuardStyleTrack[] = ['guard', 'alt', 'reuse'];

const STYLE_BY_TRACK: Record<GuardStyleTrack, GuardStyleId> = {
  guard: 'interceptor',
  alt: 'substitutor',
  reuse: 'reuser',
};

function classifyTrack(e: GuardStyleEventInput): GuardStyleTrack | null {
  if (e.eventType === 'challenge_completed') return 'guard';
  const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
  if (!meta) return null;
  if (meta.kind === 'green_alt_adoption') return 'alt';
  if (meta.kind === 'reuse_adoption') return 'reuse';
  return null;
}

/** 内部金额权重 (只做排序 tie-break, 不进输出): guard=savedAmount, alt/reuse=estSaved */
function internalWeight(e: GuardStyleEventInput): number {
  const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
  if (!meta) return 0;
  const raw = meta.savedAmount ?? meta.estSaved;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface DayTally {
  counts: GuardStyleTrackCounts;
  weights: GuardStyleTrackCounts;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function emptyProfile(): GuardStyleProfile {
  return {
    status: 'insufficient',
    styleId: 'balanced',
    trackCounts: { guard: 0, alt: 0, reuse: 0 },
    totalActions: 0,
    activeDays: 0,
    styleStreakDays: 0,
  };
}

/** 轨道排序: 次数降序 → 内部金额权重降序 → 稳定序 (guard > alt > reuse) */
function rankTracks(
  counts: GuardStyleTrackCounts,
  weights: GuardStyleTrackCounts,
): GuardStyleTrack[] {
  return [...TRACKS].sort((a, b) => {
    if (counts[a] !== counts[b]) return counts[b] - counts[a];
    if (weights[a] !== weights[b]) return weights[b] - weights[a];
    return TRACKS.indexOf(a) - TRACKS.indexOf(b);
  });
}

/**
 * 聚合三轨事件为守护风格画像。
 * 无法归轨 / createdAt 解析失败 / triggerId 重复的条目跳过;
 * 三轨合计 < GUARD_STYLE_MIN_SAMPLE_SIZE → insufficient 稳定降级。
 */
export function aggregateGuardStyleProfile(
  events: GuardStyleEventInput[] | null | undefined,
): GuardStyleProfile {
  if (!events || events.length === 0) return emptyProfile();

  const counts: GuardStyleTrackCounts = { guard: 0, alt: 0, reuse: 0 };
  const weights: GuardStyleTrackCounts = { guard: 0, alt: 0, reuse: 0 };
  const seen = new Set<string>();
  const perDay = new Map<string, DayTally>();

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

    counts[track] += 1;
    const w = internalWeight(e);
    if (w > 0) weights[track] += w;

    const key = dayKey(date);
    let tally = perDay.get(key);
    if (!tally) {
      tally = { counts: { guard: 0, alt: 0, reuse: 0 }, weights: { guard: 0, alt: 0, reuse: 0 } };
      perDay.set(key, tally);
    }
    tally.counts[track] += 1;
    if (w > 0) tally.weights[track] += w;
  }

  const total = counts.guard + counts.alt + counts.reuse;
  if (total < GUARD_STYLE_MIN_SAMPLE_SIZE) return emptyProfile();

  const ranked = rankTracks(counts, weights);
  const dominant = ranked[0];
  const styleId: GuardStyleId = counts[dominant] / total >= 0.5 ? STYLE_BY_TRACK[dominant] : 'balanced';

  // 连续风格天数: 按日期升序走, 每日主导轨与全局主导轨一致则 +1, 首个不一致日截断
  const sortedDays = [...perDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let streak = 0;
  for (let i = sortedDays.length - 1; i >= 0; i -= 1) {
    const dayRank = rankTracks(sortedDays[i][1].counts, sortedDays[i][1].weights);
    if (dayRank[0] !== dominant) break;
    streak += 1;
  }

  return {
    status: 'ok',
    styleId,
    trackCounts: counts,
    totalActions: total,
    activeDays: perDay.size,
    styleStreakDays: streak,
  };
}
