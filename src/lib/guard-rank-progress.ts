/**
 * Guard rank progress helpers — 纯函数, 负责把 rank + stats 换算成可感进度。
 *
 * 三通道晋升语义（任一达标即晋段）：intercepts / streakDays / badges。
 * 进度公式统一：pct = (base + current) / (base + target)
 *   - base = 当前段位该通道门槛, target = 下一段位该通道门槛
 *   - 分母兜底为当前段位门槛, 避免高段位进度永远显示个位数。
 */

import { GUARD_RANKS, type GuardRank, type GuardRankStats } from './guard-rank';

export interface RankChannelProgress {
  channel: 'intercepts' | 'streakDays' | 'badges';
  pct: number;
  current: number;
  base: number;
  target: number;
}

export function getRankProgressPct(current: GuardRank, stats: GuardRankStats): { channel: RankChannelProgress['channel']; pct: number } | null {
  if (!Number.isFinite(current.level)) return null;
  const next = GUARD_RANKS[current.level + 1];
  if (!next) return null;

  const channels: { channel: RankChannelProgress['channel']; current: number; base: number; target: number }[] = [
    { channel: 'intercepts', current: stats.totalIntercepts, base: current.minIntercepts, target: next.minIntercepts },
    { channel: 'streakDays', current: stats.streakDays, base: current.altStreakDays, target: next.altStreakDays },
    { channel: 'badges', current: stats.badgesUnlocked, base: current.altBadges, target: next.altBadges },
  ];

  let best: { channel: RankChannelProgress['channel']; pct: number } | null = null;
  for (const item of channels) {
    if (!Number.isFinite(item.current) || !Number.isFinite(item.base) || !Number.isFinite(item.target)) continue;
    if (item.current < 0 || item.base < 0 || item.target < 0) continue;
    const base = Math.max(0, item.base);
    const current = Math.max(0, item.current);
    const target = Math.max(base + 1, item.target);
    const denominator = base + target;
    const pct = denominator === 0 ? 0 : (base + current) / denominator;
    if (pct < 0 || pct > 1) continue;
    if (!best || pct > best.pct) best = { channel: item.channel, pct };
  }

  return best;
}

export function getAvgHoursPerGuard(
  weekly: { challengesCompleted: number; totalSaved: number } | null,
  hourlyRate: number,
): number | null {
  if (!weekly || !Number.isFinite(weekly.challengesCompleted) || !Number.isFinite(weekly.totalSaved)) return null;
  if (weekly.challengesCompleted <= 0 || weekly.totalSaved <= 0) return null;
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 25;
  const hours = weekly.totalSaved / rate;
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const avg = hours / weekly.challengesCompleted;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return avg;
}
