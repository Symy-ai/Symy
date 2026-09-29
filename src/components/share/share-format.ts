'use client';

/**
 * 晒卡格式化 helpers — 无依赖叶子 (arch 批1 F4)
 *
 * 🔧 架构批1 F4 (09-29, 依据 ~/briefs/arch-next-targets.md):
 *   8 张分享卡 (badge/challenge/dream/guardian-stats/intercept/milestone/streak/weekly)
 *   曾全部反向 import card-templates 的 formatShareHoursLabel / formatHoursNumber /
 *   getMilestoneState, 而 card-templates 又 import 全部 8 卡 — madge 18 条环里的 8 条。
 *   提取到本叶子文件, 8 卡改引, 环全消; card-templates re-export 保持既有引用方兼容
 *   (share-modal / daily-green-report / card-templates.test 均零改动)。
 *
 * 面子/里子铁律 (owner 09-06): 金额永不进卡 — 本文件所有函数只处理赢回小时。
 */

import { formatFreedomTime } from '@/lib/freedom-time';

/**
 * 赢回小时展示数字 — 统计格子等纯数字槽位用 (≥10 取整, <10 保留 1 位, 不夸大)。
 * 0/负数/NaN 与亚小时 (<0.1h, 免出「0.0 小时」) 返回空串, 由调用方走兜底文案。
 */
export function formatHoursNumber(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0 || hours < 0.1) return '';
  return hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
}

/**
 * 晒卡赢回时间完整标签 (数字+单位) — 英雄行/分享文案槽位用。
 * 亚小时出「N 分钟」, 取整方向与 app 内 formatFreedomTime 同向 (round),
 * 同一笔拦截两个面数字一致 (QA 冒烟边界观察 #4/#5)。
 * <0.1h 与 0/负/NaN 同语义返回空串, 由调用方走「一次绿色的选择」兜底文案。
 */
export function formatShareHoursLabel(hours: number, locale: string): string {
  if (!Number.isFinite(hours) || hours <= 0 || hours < 0.1) return '';
  return formatFreedomTime(hours, locale);
}

/** 里程碑解锁阈值 — 拦截次数达到即解锁 (现有数据推导, 零 DDL) */
export const MILESTONE_THRESHOLDS = [10, 50, 100] as const;

export interface MilestoneState {
  count: number;
  /** count ≥ 首个阈值 (10) — 第 N 次守护进入可庆祝态 */
  unlocked: boolean;
  /** 下一个未达成阈值; 全部达成时 null */
  next: number | null;
  /** 距下一阈值还差几次 (next 为 null 时 0) */
  remaining: number;
}

export function getMilestoneState(count: number): MilestoneState {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const next = MILESTONE_THRESHOLDS.find((m) => m > safeCount) ?? null;
  return {
    count: safeCount,
    unlocked: safeCount >= MILESTONE_THRESHOLDS[0],
    next,
    remaining: next ? next - safeCount : 0,
  };
}
