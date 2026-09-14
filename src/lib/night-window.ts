/**
 * night-window — 「我的深夜时段」四档预设 SSOT (batch49-a)
 *
 * 用户自定义冲动危险时段 (早睡型 21–24 / 标准型 22–05 / 夜猫型 0–5 / 关闭)。
 * 持久化: localStorage ('symy-night-window', 见 hooks/use-night-window.ts), 零 DDL。
 *
 * 语义:
 * - standard 与 impulse-window 默认深夜桶 (22:00–05:00) 逐小时一致 —
 *   未设置/损坏输入降级到 standard, 行为与 batch48-c 基线完全相同。
 * - off 仅关闭 night-guard banner, 统计卡照常用默认窗口分桶 (数据透明)。
 *
 * 本文件零依赖 (仅从 impulse-window 导入默认小时集), 设置 UI 与聚合/banner 共用。
 */

import { DEFAULT_LATE_NIGHT_HOURS } from '@/lib/impulse-window';

export type NightWindowPreset = 'early' | 'standard' | 'nightOwl' | 'off';

export const NIGHT_WINDOW_PRESETS: readonly NightWindowPreset[] = ['early', 'standard', 'nightOwl', 'off'];

export const DEFAULT_NIGHT_WINDOW: NightWindowPreset = 'standard';

export interface NightWindowOption {
  /** 该档位的深夜小时集 (本地时区 0..23); off 为空数组 */
  hours: readonly number[];
  /** 展示区间文案 (locale 中性的数字区间) */
  rangeLabel: string;
}

export const NIGHT_WINDOW_OPTIONS: Record<NightWindowPreset, NightWindowOption> = {
  early: { hours: [21, 22, 23], rangeLabel: '21:00–24:00' },
  standard: { hours: DEFAULT_LATE_NIGHT_HOURS, rangeLabel: '22:00–05:00' },
  nightOwl: { hours: [0, 1, 2, 3, 4], rangeLabel: '00:00–05:00' },
  off: { hours: [], rangeLabel: '' },
};

export function isNightWindowPreset(value: unknown): value is NightWindowPreset {
  return typeof value === 'string' && (NIGHT_WINDOW_PRESETS as readonly string[]).includes(value);
}

/** 缺失/损坏输入 → standard (与现状一致的降级语义) */
export function normalizeNightWindow(value: unknown): NightWindowPreset {
  return isNightWindowPreset(value) ? value : DEFAULT_NIGHT_WINDOW;
}

/**
 * 聚合/banner 用的深夜小时集:
 * off → 默认窗口 (统计照常, banner 层自行判 off 不渲染); 其余 → 该档位小时集。
 */
export function nightWindowToHours(preset: NightWindowPreset): readonly number[] {
  if (preset === 'off') return DEFAULT_LATE_NIGHT_HOURS;
  return NIGHT_WINDOW_OPTIONS[preset].hours;
}
