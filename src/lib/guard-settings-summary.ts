/**
 * guard-settings-summary — 设置页「守护总控索引」聚合纯函数 (batch68-b)
 *
 * 把既有四渠道状态 (绿色守护总开关 / 守护强度 / 深夜时段 / 守护范围 /
 * push 订阅与偏好 / 守护记录规模) 聚合成一屏索引:
 *   - 当前守护风格: 反查 guardian-style 四预设, 全维度命中 → 预设, 否则自定义;
 *     任一输入未知 → unknown (不猜)。
 *   - 四组状态 (对话 / 购物车 / push / 资料与证据): on / partial / off / unknown。
 *   - 绿色规则覆盖: 只透传健康度级别 + 未覆盖品类数量 (零长列表、零金额、零碳值)。
 *
 * 本文件零 React 零 fetch — 数据获取归 guard-settings-probes / 各 hook,
 * 渲染归 guard-control-index 组件; 全部输入可注入, 便于构造全状态矩阵测试。
 */

import {
  GUARDIAN_STYLE_PRESETS,
  buildGuardianStylePlan,
  type GuardianStylePreset,
} from '@/lib/guardian-style';
import type { GuardIntensity } from '@/lib/guard-intensity';
import type { NightWindowPreset } from '@/lib/night-window';
import { GUARD_SCOPE_CATEGORIES, type GuardScope } from '@/lib/guard-scope';
import type { PushFrequency } from '@/lib/push/preferences';

/** 单组守护状态: on 全量生效 / partial 有待完成项 / off 关闭 / unknown 数据源失败 */
export type GuardGroupStatus = 'on' | 'partial' | 'off' | 'unknown';

/** 可缺失的输入 — 数据源失败时传 'unknown', 聚合层不猜 */
export type Known<T> = T | 'unknown';

/** push 守护输入 — 订阅态 + 节奏 + 四个 UI 可见通道开关 (dailyAlgorithm 为无 UI 存量键, 不参与判定) */
export interface GuardPushSnapshot {
  subscribed: boolean;
  frequency: PushFrequency;
  channels: {
    missYou: boolean;
    dreamFund: boolean;
    challenge: boolean;
    weeklyGuardian: boolean;
  };
}

/** 绿色规则覆盖输入 — 只保留级别与未覆盖品类数 (隐私红线: 无长列表/金额/碳值) */
export interface GuardCoverageSnapshot {
  health: 'healthy' | 'partial' | 'noData' | 'noEntries';
  uncoveredCategories: number;
}

/** 资料与证据输入 — 守护记录规模 (只数条数) */
export interface GuardEvidenceSnapshot {
  totalEvents: number;
}

export interface GuardSettingsInput {
  /** 绿色守护总开关 (设置页 props 直传) */
  greenGuardEnabled: Known<boolean>;
  guardIntensity: Known<GuardIntensity>;
  nightWindow: Known<NightWindowPreset>;
  guardScope: Known<GuardScope>;
  push: Known<GuardPushSnapshot>;
  evidence: Known<GuardEvidenceSnapshot>;
  coverage: Known<GuardCoverageSnapshot>;
}

export type GuardControlStyle =
  | { kind: 'preset'; preset: GuardianStylePreset }
  | { kind: 'custom' }
  | { kind: 'unknown' };

export interface GuardSettingsSummary {
  style: GuardControlStyle;
  groups: {
    chat: GuardGroupStatus;
    cart: GuardGroupStatus;
    push: GuardGroupStatus;
    evidence: GuardGroupStatus;
  };
  coverage: GuardCoverageSnapshot | null;
  /** 购物车组 partial 提示用的豁免品类数 (其余状态为 null) */
  cartExemptCount: number | null;
}

function scopeEquals(a: GuardScope, b: GuardScope): boolean {
  return GUARD_SCOPE_CATEGORIES.every((category) => a[category] === b[category]);
}

/**
 * 四渠道现值反查守护风格预设 — buildGuardianStylePlan 的逆映射。
 * 与预设计划全维度逐字节一致 → 该预设; 否则视为用户自定义组合。
 */
export function deriveGuardianStylePreset(
  guardIntensity: GuardIntensity,
  nightWindow: NightWindowPreset,
  pushFrequency: PushFrequency,
  guardScope: GuardScope,
): GuardianStylePreset | 'custom' {
  for (const preset of GUARDIAN_STYLE_PRESETS) {
    const plan = buildGuardianStylePlan(preset);
    if (
      plan.guardIntensity === guardIntensity &&
      plan.nightWindow === nightWindow &&
      plan.pushFrequency === pushFrequency &&
      scopeEquals(plan.guardScope, guardScope)
    ) {
      return preset;
    }
  }
  return 'custom';
}

/** 对话守护 = 总开关 × 守护强度 × 深夜时段: 关总开关即 off; 温和强度或深夜档 off 记 partial */
export function summarizeChatGuard(
  greenGuardEnabled: Known<boolean>,
  guardIntensity: Known<GuardIntensity>,
  nightWindow: Known<NightWindowPreset>,
): GuardGroupStatus {
  if (greenGuardEnabled === 'unknown' || guardIntensity === 'unknown' || nightWindow === 'unknown') return 'unknown';
  if (!greenGuardEnabled) return 'off';
  if (guardIntensity === 'gentle' || nightWindow === 'off') return 'partial';
  return 'on';
}

/** 购物车守护 = 守护范围五品类: 全豁免 off / 有豁免 partial / 无豁免 on */
export function summarizeCartGuard(guardScope: Known<GuardScope>): { status: GuardGroupStatus; exemptCount: number | null } {
  if (guardScope === 'unknown') return { status: 'unknown', exemptCount: null };
  const exemptCount = GUARD_SCOPE_CATEGORIES.filter((category) => guardScope[category] === 'exempt').length;
  if (exemptCount === GUARD_SCOPE_CATEGORIES.length) return { status: 'off', exemptCount };
  if (exemptCount > 0) return { status: 'partial', exemptCount };
  return { status: 'on', exemptCount: 0 };
}

/** push 守护 = 订阅 × 节奏 × 四通道: 未订阅 off; 订阅但节奏 off 或任一通道关 记 partial */
export function summarizePushGuard(push: Known<GuardPushSnapshot>): GuardGroupStatus {
  if (push === 'unknown') return 'unknown';
  if (!push.subscribed) return 'off';
  const allChannelsOn = Object.values(push.channels).every(Boolean);
  if (push.frequency === 'off' || !allChannelsOn) return 'partial';
  return 'on';
}

/** 资料与证据 = 守护记录规模: 0 条 off / 1–4 条 partial / ≥5 条 on (与数据管理 warm note 同一阈值语义) */
export function summarizeEvidenceGuard(evidence: Known<GuardEvidenceSnapshot>): GuardGroupStatus {
  if (evidence === 'unknown') return 'unknown';
  if (evidence.totalEvents <= 0) return 'off';
  if (evidence.totalEvents < 5) return 'partial';
  return 'on';
}

/** 总控索引聚合入口 — 全部输入可独立 unknown, 单源失败不污染其他组 */
export function summarizeGuardSettings(input: GuardSettingsInput): GuardSettingsSummary {
  const { greenGuardEnabled, guardIntensity, nightWindow, guardScope, push, evidence, coverage } = input;

  let style: GuardControlStyle = { kind: 'unknown' };
  if (
    guardIntensity !== 'unknown' &&
    nightWindow !== 'unknown' &&
    guardScope !== 'unknown' &&
    push !== 'unknown'
  ) {
    const derived = deriveGuardianStylePreset(guardIntensity, nightWindow, push.frequency, guardScope);
    style = derived === 'custom' ? { kind: 'custom' } : { kind: 'preset', preset: derived };
  }

  const cart = summarizeCartGuard(guardScope);
  const globalGuardOff = greenGuardEnabled === false;

  return {
    style,
    groups: {
      chat: summarizeChatGuard(greenGuardEnabled, guardIntensity, nightWindow),
      cart: globalGuardOff ? 'off' : cart.status,
      push: globalGuardOff ? 'off' : summarizePushGuard(push),
      evidence: globalGuardOff ? 'off' : summarizeEvidenceGuard(evidence),
    },
    coverage: coverage === 'unknown' ? null : coverage,
    cartExemptCount: cart.exemptCount,
  };
}
