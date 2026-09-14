/**
 * Push preferences — 订阅偏好单一事实源 (batch60-b)
 *
 * push_subscriptions.preferences JSONB 的读写归一化 + 「通道 × 频率」过滤矩阵。
 * cron (用户级早停) 与 push-sender (设备级终门) 共用同一个 isPushChannelEnabled，
 * 保证两层的过滤语义逐字节一致；多设备混合偏好在设备级自然收敛
 * (设备 A daily 收、设备 B off 不收)。
 *
 * 通道 × 频率语义 (频率 = 用户选择的提醒节奏 daily / weekly / off):
 * - dailyAlgorithm  日常通道: 仅 frequency='daily' 发; 存量 dailyAlgorithm=false 继续生效
 * - missYou         日常通道: 仅 frequency='daily' 发; missYou=false 关
 * - weeklyGuardian  周报通道: daily / weekly 都发 (存量默认频率 'daily' 的用户不回退
 *                   batch27-c 的沉默大多数触达), frequency='off' 不发; 开关可关
 * - dreamFund       事件通道: 豁免频率 (里程碑只在发生时出现一次), 仅受 dreamFund 开关控制
 * - challenge       事件通道: 豁免频率 (挑战结算不可补发), 仅受 challenge 开关控制
 *
 * 红线: 零 DDL (只读写既有 preferences JSON 列); 不新增推送通道。
 */

import { z } from 'zod';

export const PUSH_FREQUENCIES = ['daily', 'weekly', 'off'] as const;
export type PushFrequency = (typeof PUSH_FREQUENCIES)[number];

/** 推送通道名 = push-sender 的 prefKey 空间 (url 推断 + explicitPrefKey 一致) */
export type PushChannel = 'dailyAlgorithm' | 'missYou' | 'dreamFund' | 'challenge' | 'weeklyGuardian';

export interface NormalizedPushPreferences {
  missYou: boolean;
  dreamFund: boolean;
  challenge: boolean;
  weeklyGuardian: boolean;
  /** 存量兼容键: 早期 cron 的防御性开关, 无 UI 写入口, 读到 false 继续尊重 */
  dailyAlgorithm: boolean;
  frequency: PushFrequency;
}

export const DEFAULT_PUSH_PREFERENCES: NormalizedPushPreferences = {
  missYou: true,
  dreamFund: true,
  challenge: true,
  weeklyGuardian: true,
  dailyAlgorithm: true,
  frequency: 'daily',
};

/** 已认证写入面 (PATCH / subscribe preferences) — strict, 未知字段 (含 endpoint/keys) 一律拒绝 */
export const pushPreferencesSchema = z
  .object({
    missYou: z.boolean().optional(),
    dreamFund: z.boolean().optional(),
    challenge: z.boolean().optional(),
    weeklyGuardian: z.boolean().optional(),
    dailyAlgorithm: z.boolean().optional(),
    frequency: z.enum(PUSH_FREQUENCIES).optional(),
  })
  .strict();

const TOGGLE_KEYS = ['missYou', 'dreamFund', 'challenge', 'weeklyGuardian', 'dailyAlgorithm'] as const;

/**
 * 宽容归一化: 把 preferences JSONB (可能缺键 / 旧形状 / 脏数据) 合并到默认值上。
 * 只认 boolean 开关与合法频率枚举, 其他一律落回默认 — cron 读到坏行不崩、不误发。
 */
export function normalizePushPreferences(raw: unknown): NormalizedPushPreferences {
  const prefs: NormalizedPushPreferences = { ...DEFAULT_PUSH_PREFERENCES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return prefs;

  const record = raw as Record<string, unknown>;
  for (const key of TOGGLE_KEYS) {
    if (typeof record[key] === 'boolean') prefs[key] = record[key];
  }
  if (record.frequency === 'daily' || record.frequency === 'weekly' || record.frequency === 'off') {
    prefs.frequency = record.frequency;
  }
  return prefs;
}

/** 通道 → 开关键 (challenge 通道的开关存储键就叫 challenge) */
const CHANNEL_TOGGLE: Record<PushChannel, (typeof TOGGLE_KEYS)[number]> = {
  dailyAlgorithm: 'dailyAlgorithm',
  missYou: 'missYou',
  dreamFund: 'dreamFund',
  challenge: 'challenge',
  weeklyGuardian: 'weeklyGuardian',
};

/** 事件通道豁免频率 (里程碑/结算只在事件发生那一刻有意义, 不可补发) */
const FREQUENCY_EXEMPT_CHANNELS: ReadonlySet<PushChannel> = new Set(['dreamFund', 'challenge']);

/**
 * 该设备 (一行订阅) 上此通道是否应发送 — cron 与 push-sender 共用的唯一过滤点。
 */
export function isPushChannelEnabled(prefs: NormalizedPushPreferences, channel: PushChannel): boolean {
  if (!prefs[CHANNEL_TOGGLE[channel]]) return false;
  if (FREQUENCY_EXEMPT_CHANNELS.has(channel)) return true;
  if (prefs.frequency === 'off') return false;
  // 日常通道只在 daily 节奏发; weeklyGuardian 在 daily/weekly 节奏都发 (off 已被上行拦住)
  if (channel === 'dailyAlgorithm' || channel === 'missYou') return prefs.frequency === 'daily';
  return true;
}
