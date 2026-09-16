/**
 * guardian-style-copy 模块契约测试 (batch78-a)
 *
 * 纯 key 映射常量模块 (零 React 零金额样例串)。字典层的双语对称与契约卡
 * 零金额词红线由 guardian-style-i18n-guard 锁死; 本文件锁模块层契约:
 * 每张 map 的 key 集 === 底层渠道枚举全集 (防枚举扩档漏配文案)、
 * 所有值都是 profile.* 且在 zh/en 两本字典均可解析到非空串、
 * 各 map 逐字面量锁定 (重构不得静默改指向)、共享句约定 (三开启档同 key)。
 */

import { describe, expect, it } from 'vitest';
import {
  PRESET_LABEL_KEY, PRESET_DESC_KEY, PRESET_SEE_KEY, PRESET_WONT_KEY,
  INTENSITY_LABEL_KEY, INTENSITY_SEE_KEY, INTENSITY_WONT_KEY,
  NIGHT_LABEL_KEY, NIGHT_SEE_KEY, NIGHT_WONT_KEY,
  PUSH_LABEL_KEY, PUSH_SEE_KEY, PUSH_WONT_KEY,
  SCOPE_MODE_LABEL_KEY, CATEGORY_LABEL_KEY,
  CONTRACT_IDENTITY_KEY, CONTRACT_NIGHT_KEY, CONTRACT_PUSH_KEY,
} from '../guardian-style-copy';
import { GUARDIAN_STYLE_PRESETS } from '@/lib/guardian-style';
import { GUARD_INTENSITIES } from '@/lib/guard-intensity';
import { NIGHT_WINDOW_PRESETS } from '@/lib/night-window';
import { PUSH_FREQUENCIES } from '@/lib/push/preferences';
import { GUARD_SCOPE_CATEGORIES } from '@/lib/guard-scope';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';

/** 所有 map → 其 key 集必须等于的运行时枚举全集 */
const MAP_ENUM_PAIRS: Array<[Record<string, string>, readonly string[]]> = [
  [PRESET_LABEL_KEY, GUARDIAN_STYLE_PRESETS],
  [PRESET_DESC_KEY, GUARDIAN_STYLE_PRESETS],
  [PRESET_SEE_KEY, GUARDIAN_STYLE_PRESETS],
  [PRESET_WONT_KEY, GUARDIAN_STYLE_PRESETS],
  [INTENSITY_LABEL_KEY, GUARD_INTENSITIES],
  [INTENSITY_SEE_KEY, GUARD_INTENSITIES],
  [INTENSITY_WONT_KEY, GUARD_INTENSITIES],
  [NIGHT_LABEL_KEY, NIGHT_WINDOW_PRESETS],
  [NIGHT_SEE_KEY, NIGHT_WINDOW_PRESETS],
  [NIGHT_WONT_KEY, NIGHT_WINDOW_PRESETS],
  [PUSH_LABEL_KEY, PUSH_FREQUENCIES],
  [PUSH_SEE_KEY, PUSH_FREQUENCIES],
  [PUSH_WONT_KEY, PUSH_FREQUENCIES],
  [SCOPE_MODE_LABEL_KEY, ['guard', 'exempt', 'strict'] as const],
  [CATEGORY_LABEL_KEY, GUARD_SCOPE_CATEGORIES],
  [CONTRACT_IDENTITY_KEY, GUARD_INTENSITIES],
  [CONTRACT_NIGHT_KEY, NIGHT_WINDOW_PRESETS],
  [CONTRACT_PUSH_KEY, PUSH_FREQUENCIES],
];

const ALL_MAPS = MAP_ENUM_PAIRS.map(([m]) => m);

function resolve(dict: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' && node.length > 0 ? node : undefined;
}

describe('guardian-style-copy 枚举全覆盖', () => {
  it('每张 map 的 key 集 === 底层渠道枚举全集 (无缺档无多档)', () => {
    for (const [map, enumValues] of MAP_ENUM_PAIRS) {
      expect([...Object.keys(map)].sort(), `map ${Object.values(map)[0]}…`).toEqual([...enumValues].sort());
    }
  });
});

describe('guardian-style-copy key 形状与字典可解析', () => {
  it('所有值都是 profile.* 形状', () => {
    for (const map of ALL_MAPS) {
      for (const value of Object.values(map)) {
        expect(value).toMatch(/^profile\.[A-Za-z0-9]+$/);
      }
    }
  });

  it('每个 key 在 zh 与 en 字典均解析到非空串 (零 raw key 泄漏)', () => {
    for (const map of ALL_MAPS) {
      for (const key of Object.values(map)) {
        expect(resolve(zh as Record<string, unknown>, key), `zh missing ${key}`).toBeDefined();
        expect(resolve(en as Record<string, unknown>, key), `en missing ${key}`).toBeDefined();
      }
    }
  });

  it('key 名零金额线索 (amount/money/currency/price/cost/saved)', () => {
    for (const map of ALL_MAPS) {
      for (const key of Object.values(map)) {
        expect(key.toLowerCase()).not.toMatch(/amount|money|currency|price|cost|saved/);
      }
    }
  });
});

describe('guardian-style-copy 逐字面量锁定', () => {
  it('label/see/wont 三族映射不漂移', () => {
    expect(PRESET_LABEL_KEY).toEqual({
      gentleCompanion: 'profile.guardianStylePresetGentleCompanion',
      balancedGuard: 'profile.guardianStylePresetBalancedGuard',
      strictCoach: 'profile.guardianStylePresetStrictCoach',
      nightLightGuard: 'profile.guardianStylePresetNightLightGuard',
    });
    expect(PRESET_DESC_KEY).toEqual({
      gentleCompanion: 'profile.guardianStylePresetGentleCompanionDesc',
      balancedGuard: 'profile.guardianStylePresetBalancedGuardDesc',
      strictCoach: 'profile.guardianStylePresetStrictCoachDesc',
      nightLightGuard: 'profile.guardianStylePresetNightLightGuardDesc',
    });
    expect(INTENSITY_LABEL_KEY).toEqual({
      gentle: 'profile.guardIntensityGentle',
      balanced: 'profile.guardIntensityBalanced',
      strict: 'profile.guardIntensityStrict',
    });
    expect(SCOPE_MODE_LABEL_KEY).toEqual({
      guard: 'profile.guardScopeModeGuard',
      exempt: 'profile.guardScopeModeExempt',
      strict: 'profile.guardScopeModeStrict',
    });
    expect(CATEGORY_LABEL_KEY).toEqual({
      electronics: 'profile.guardScopeCatElectronics',
      clothing: 'profile.guardScopeCatClothing',
      beauty: 'profile.guardScopeCatBeauty',
      home: 'profile.guardScopeCatHome',
      food: 'profile.guardScopeCatFood',
    });
  });

  it('契约卡三族映射不漂移', () => {
    expect(CONTRACT_IDENTITY_KEY).toEqual({
      gentle: 'profile.guardianStyleContractIdentityGentle',
      balanced: 'profile.guardianStyleContractIdentityBalanced',
      strict: 'profile.guardianStyleContractIdentityStrict',
    });
    expect(CONTRACT_NIGHT_KEY).toEqual({
      early: 'profile.guardianStyleContractNightOn',
      standard: 'profile.guardianStyleContractNightOn',
      nightOwl: 'profile.guardianStyleContractNightOn',
      off: 'profile.guardianStyleContractNightOff',
    });
    expect(CONTRACT_PUSH_KEY).toEqual({
      daily: 'profile.guardianStyleContractPushDaily',
      weekly: 'profile.guardianStyleContractPushWeekly',
      off: 'profile.guardianStyleContractPushOff',
    });
  });

  it('共享句约定: 夜间三开启档同 label/see/wont key, off 各自独立', () => {
    expect(NIGHT_SEE_KEY.early).toBe(NIGHT_SEE_KEY.standard);
    expect(NIGHT_SEE_KEY.standard).toBe(NIGHT_SEE_KEY.nightOwl);
    expect(NIGHT_SEE_KEY.off).not.toBe(NIGHT_SEE_KEY.early);
    expect(NIGHT_WONT_KEY.early).toBe(NIGHT_WONT_KEY.nightOwl);
    expect(NIGHT_LABEL_KEY.early).not.toBe(NIGHT_LABEL_KEY.standard);
    expect(NIGHT_LABEL_KEY.off).not.toBe(NIGHT_LABEL_KEY.early);
  });
});
