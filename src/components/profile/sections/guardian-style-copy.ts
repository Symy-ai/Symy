/**
 * guardian-style-copy — 向导文案 key 映射 (batch61-a)
 *
 * 纯数据无 React: 把枚举值映射到 profile.guardianStyle* i18n key,
 * 让向导与契约卡组件只管渲染。文案本体在 i18n/messages/ 下的 zh 与 en 字典,
 * 双语对称与契约卡零金额红线由 guardian-style-i18n-guard 测试锁死。
 * 各渠道取值名复用既有 label key (守护强度三档 / 深夜时段四档 / 提醒节奏三档 /
 * 品类与三态), 不在本文件重复定义。
 */

import type { GuardIntensity } from '@/lib/guard-intensity';
import type { NightWindowPreset } from '@/lib/night-window';
import type { PushFrequency } from '@/lib/push/preferences';
import type { GuardianStylePreset } from '@/lib/guardian-style';
import type { GuardScopeCategory, GuardScopeMode } from '@/lib/guard-scope';

export const PRESET_LABEL_KEY: Record<GuardianStylePreset, string> = {
  gentleCompanion: 'profile.guardianStylePresetGentleCompanion',
  balancedGuard: 'profile.guardianStylePresetBalancedGuard',
  strictCoach: 'profile.guardianStylePresetStrictCoach',
  nightLightGuard: 'profile.guardianStylePresetNightLightGuard',
};

export const PRESET_DESC_KEY: Record<GuardianStylePreset, string> = {
  gentleCompanion: 'profile.guardianStylePresetGentleCompanionDesc',
  balancedGuard: 'profile.guardianStylePresetBalancedGuardDesc',
  strictCoach: 'profile.guardianStylePresetStrictCoachDesc',
  nightLightGuard: 'profile.guardianStylePresetNightLightGuardDesc',
};

export const PRESET_SEE_KEY: Record<GuardianStylePreset, string> = {
  gentleCompanion: 'profile.guardianStyleSeeGentleCompanion',
  balancedGuard: 'profile.guardianStyleSeeBalancedGuard',
  strictCoach: 'profile.guardianStyleSeeStrictCoach',
  nightLightGuard: 'profile.guardianStyleSeeNightLightGuard',
};

export const PRESET_WONT_KEY: Record<GuardianStylePreset, string> = {
  gentleCompanion: 'profile.guardianStyleWontSeeGentleCompanion',
  balancedGuard: 'profile.guardianStyleWontSeeBalancedGuard',
  strictCoach: 'profile.guardianStyleWontSeeStrictCoach',
  nightLightGuard: 'profile.guardianStyleWontSeeNightLightGuard',
};

export const INTENSITY_LABEL_KEY: Record<GuardIntensity, string> = {
  gentle: 'profile.guardIntensityGentle',
  balanced: 'profile.guardIntensityBalanced',
  strict: 'profile.guardIntensityStrict',
};

export const INTENSITY_SEE_KEY: Record<GuardIntensity, string> = {
  gentle: 'profile.guardianStyleIntensitySeeGentle',
  balanced: 'profile.guardianStyleIntensitySeeBalanced',
  strict: 'profile.guardianStyleIntensitySeeStrict',
};

export const INTENSITY_WONT_KEY: Record<GuardIntensity, string> = {
  gentle: 'profile.guardianStyleIntensityWontSeeGentle',
  balanced: 'profile.guardianStyleIntensityWontSeeBalanced',
  strict: 'profile.guardianStyleIntensityWontSeeStrict',
};

/** 三个开启档共用 {range} 插值句, off 单独一句 */
export const NIGHT_LABEL_KEY: Record<NightWindowPreset, string> = {
  early: 'profile.nightWindowEarly',
  standard: 'profile.nightWindowStandard',
  nightOwl: 'profile.nightWindowNightOwl',
  off: 'profile.nightWindowOff',
};

export const NIGHT_SEE_KEY: Record<NightWindowPreset, string> = {
  early: 'profile.guardianStyleNightSeeOn',
  standard: 'profile.guardianStyleNightSeeOn',
  nightOwl: 'profile.guardianStyleNightSeeOn',
  off: 'profile.guardianStyleNightSeeOff',
};

export const NIGHT_WONT_KEY: Record<NightWindowPreset, string> = {
  early: 'profile.guardianStyleNightWontSeeOn',
  standard: 'profile.guardianStyleNightWontSeeOn',
  nightOwl: 'profile.guardianStyleNightWontSeeOn',
  off: 'profile.guardianStyleNightWontSeeOff',
};

export const PUSH_LABEL_KEY: Record<PushFrequency, string> = {
  daily: 'profile.pushPrefsFrequencyDaily',
  weekly: 'profile.pushPrefsFrequencyWeekly',
  off: 'profile.pushPrefsFrequencyOff',
};

export const PUSH_SEE_KEY: Record<PushFrequency, string> = {
  daily: 'profile.guardianStylePushSeeDaily',
  weekly: 'profile.guardianStylePushSeeWeekly',
  off: 'profile.guardianStylePushSeeOff',
};

export const PUSH_WONT_KEY: Record<PushFrequency, string> = {
  daily: 'profile.guardianStylePushWontSeeDaily',
  weekly: 'profile.guardianStylePushWontSeeWeekly',
  off: 'profile.guardianStylePushWontSeeOff',
};

export const SCOPE_MODE_LABEL_KEY: Record<GuardScopeMode, string> = {
  guard: 'profile.guardScopeModeGuard',
  exempt: 'profile.guardScopeModeExempt',
  strict: 'profile.guardScopeModeStrict',
};

export const CATEGORY_LABEL_KEY: Record<GuardScopeCategory, string> = {
  electronics: 'profile.guardScopeCatElectronics',
  clothing: 'profile.guardScopeCatClothing',
  beauty: 'profile.guardScopeCatBeauty',
  home: 'profile.guardScopeCatHome',
  food: 'profile.guardScopeCatFood',
};

/** 契约卡 (荣誉面) — 身份句 + 夜间时段 + 提醒节奏 + 品类承诺 */
export const CONTRACT_IDENTITY_KEY: Record<GuardIntensity, string> = {
  gentle: 'profile.guardianStyleContractIdentityGentle',
  balanced: 'profile.guardianStyleContractIdentityBalanced',
  strict: 'profile.guardianStyleContractIdentityStrict',
};

/** 三个开启档共用 {range} 插值句, off 单独一句 */
export const CONTRACT_NIGHT_KEY: Record<NightWindowPreset, string> = {
  early: 'profile.guardianStyleContractNightOn',
  standard: 'profile.guardianStyleContractNightOn',
  nightOwl: 'profile.guardianStyleContractNightOn',
  off: 'profile.guardianStyleContractNightOff',
};

export const CONTRACT_PUSH_KEY: Record<PushFrequency, string> = {
  daily: 'profile.guardianStyleContractPushDaily',
  weekly: 'profile.guardianStyleContractPushWeekly',
  off: 'profile.guardianStyleContractPushOff',
};
