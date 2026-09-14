/**
 * guardian-style — 「我的守护风格」生活型预设 SSOT (batch61-a)
 *
 * 把四个既有设置渠道 (guard-intensity 三档 / night-window 四档 / push 提醒节奏
 * 三档 / guard-scope 五品类三态) 编排成四个生活型预设。预设 → 计划的映射是
 * 纯函数, 测试逐字段锁死; 写回走既有 API 与 localStorage 通道
 * (见 hooks/guardian-style-apply.ts), 零 DDL、不新增字段、不改字段语义。
 *
 * 与 batch56-c 的 guard-style-profile (行为画像) 无关 — 那回答"用户被守护得
 * 怎么样", 本文件回答"用户想把小象养成什么样"。
 *
 * 本文件零 React 依赖, 设置页向导与写回层共用。
 */

import {
  GUARD_SCOPE_CATEGORIES,
  defaultGuardScope,
  normalizeGuardScope,
  type GuardScope,
  type GuardScopeCategory,
  type GuardScopeMode,
} from '@/lib/guard-scope';
import { isGuardIntensity, type GuardIntensity } from '@/lib/guard-intensity';
import { isNightWindowPreset, type NightWindowPreset } from '@/lib/night-window';
import { PUSH_FREQUENCIES, type PushFrequency } from '@/lib/push/preferences';

export type GuardianStylePreset = 'gentleCompanion' | 'balancedGuard' | 'strictCoach' | 'nightLightGuard';

export const GUARDIAN_STYLE_PRESETS = [
  'gentleCompanion',
  'balancedGuard',
  'strictCoach',
  'nightLightGuard',
] as const;

/** 预设缺失/损坏时的兜底 — 与 app 默认状态一致 (balanced + standard + daily + 全 guard) */
export const DEFAULT_GUARDIAN_STYLE_PRESET: GuardianStylePreset = 'balancedGuard';

/** 一次「完成」要写入的全部维度 — 每个字段都是既有渠道的原生值类型, 零新字段 */
export interface GuardianStylePlan {
  guardIntensity: GuardIntensity;
  nightWindow: NightWindowPreset;
  pushFrequency: PushFrequency;
  guardScope: GuardScope;
}

export type GuardianStylePlanPatch = Partial<{
  guardIntensity: GuardIntensity;
  nightWindow: NightWindowPreset;
  pushFrequency: PushFrequency;
  guardScope: GuardScope;
}>;

export function isGuardianStylePreset(value: unknown): value is GuardianStylePreset {
  return typeof value === 'string' && (GUARDIAN_STYLE_PRESETS as readonly string[]).includes(value);
}

export function normalizeGuardianStylePreset(value: unknown): GuardianStylePreset {
  return isGuardianStylePreset(value) ? value : DEFAULT_GUARDIAN_STYLE_PRESET;
}

function scopeWithAll(mode: GuardScopeMode): GuardScope {
  const scope = {} as Record<GuardScopeCategory, GuardScopeMode>;
  for (const category of GUARD_SCOPE_CATEGORIES) scope[category] = mode;
  return scope;
}

/**
 * 预设 → 计划的唯一定义点。每次调用返回全新 guardScope 对象
 * (defaultGuardScope/scopeWithAll 均现建), 调用方改动不会串预设。
 *
 * 四个预设两两至少两个维度不同:
 * - gentleCompanion  温柔陪伴: gentle / standard / weekly / 全 guard
 * - balancedGuard    均衡守护: balanced / standard / daily / 全 guard (= app 默认)
 * - strictCoach      严格教练: strict / early / daily / 全 strict
 * - nightLightGuard  夜间轻守: gentle / nightOwl / off / 全 guard
 */
export function buildGuardianStylePlan(preset: GuardianStylePreset): GuardianStylePlan {
  switch (preset) {
    case 'gentleCompanion':
      return { guardIntensity: 'gentle', nightWindow: 'standard', pushFrequency: 'weekly', guardScope: defaultGuardScope() };
    case 'strictCoach':
      return { guardIntensity: 'strict', nightWindow: 'early', pushFrequency: 'daily', guardScope: scopeWithAll('strict') };
    case 'nightLightGuard':
      return { guardIntensity: 'gentle', nightWindow: 'nightOwl', pushFrequency: 'off', guardScope: defaultGuardScope() };
    case 'balancedGuard':
      return { guardIntensity: 'balanced', nightWindow: 'standard', pushFrequency: 'daily', guardScope: defaultGuardScope() };
  }
}

function isPushFrequency(value: unknown): value is PushFrequency {
  return typeof value === 'string' && (PUSH_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * 微调合并: 只接受各渠道枚举内的合法值, 非法值整字段忽略 (不半写)。
 * 纯函数 — 返回新对象, 入参 plan 及其 guardScope 不被改动;
 * patch.guardScope 走 normalizeGuardScope, 语义为整表替换 (非法品类/模式逐键降级 guard)。
 */
export function applyGuardianStylePlanPatch(plan: GuardianStylePlan, patch: GuardianStylePlanPatch): GuardianStylePlan {
  const next: GuardianStylePlan = { ...plan, guardScope: { ...plan.guardScope } };
  if (isGuardIntensity(patch.guardIntensity)) next.guardIntensity = patch.guardIntensity;
  if (isNightWindowPreset(patch.nightWindow)) next.nightWindow = patch.nightWindow;
  if (isPushFrequency(patch.pushFrequency)) next.pushFrequency = patch.pushFrequency;
  if (patch.guardScope !== undefined) next.guardScope = normalizeGuardScope(patch.guardScope);
  return next;
}
