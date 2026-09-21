import { describe, expect, it } from 'vitest';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';

type CopyRecord = Record<string, unknown>;

const zhProfile = (zh as CopyRecord).profile as CopyRecord;
const enProfile = (en as CopyRecord).profile as CopyRecord;

const copyKeys = [
  'settingsAdvanced',
  'settingsAdvancedDesc',
  'plainIntensity.gentle',
  'plainIntensity.balanced',
  'plainIntensity.firm',
  'plainIntensity.locked',
  'plainNightQuiet',
  'plainMonthlyCap',
  'plainPolicyPreview',
  'plainRuleOverride',
  'plainDataExport',
  'plainDataManagement',
];

const forbiddenTerms = ['策略', '管道', '粒度', 'RPA'];

function getValue(source: CopyRecord, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (value, segment) =>
      value && typeof value === 'object'
        ? (value as CopyRecord)[segment]
        : undefined,
    source,
  );
}

function isStringKey(key: string): key is (typeof copyKeys)[number] {
  return copyKeys.includes(key);
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as CopyRecord).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'string' ? [path] : flattenKeys(child, path);
  });
}

describe('settings plain copy', () => {
  it('defines every new key in both dictionaries', () => {
    for (const key of copyKeys) {
      expect(getValue(zhProfile, key), `zh missing profile.${key}`).toBeTruthy();
      expect(getValue(enProfile, key), `en missing profile.${key}`).toBeTruthy();
    }
  });

  it('keeps each Chinese copy within 24 characters', () => {
    for (const key of copyKeys) {
      const value = getValue(zhProfile, key);
      expect(typeof value, `profile.${key} should be a string`).toBe('string');
      expect((value as string).length, `profile.${key} is too long`).toBeLessThanOrEqual(24);
    }
  });

  it('avoids jargon in the new copy', () => {
    for (const key of flattenKeys(zhProfile).filter(isStringKey)) {
      const value = getValue(zhProfile, key);
      expect(typeof value, `profile.${key} should be a string`).toBe('string');
      for (const term of forbiddenTerms) {
        expect((value as string).includes(term), `profile.${key} contains ${term}`).toBe(false);
      }
    }
  });
});

/**
 * batch95-b tone guard — 设置区（默认 5+1 行 + 高级折叠区）文案小白化后锁面:
 * 前缀 + 单键圈定设置区消费的全部 profile.* 键, zh 值零工程黑话;
 * 每行 description ≤ 20 字说清「开了会怎样」。白名单豁免专有名词
 * （RPA 插件名本身）。
 */
const SETTINGS_PREFIXES = [
  'guardControl', 'guardIntensity', 'guardScope', 'nightWindow', 'spendingCap',
  'guardPolicy', 'guardRuleCoverage', 'guardProfile', 'guardData', 'greenPrefs',
  'greenImpact', 'timeValue', 'guardianStyle', 'greenPref', 'push', 'email',
  'inventory', 'displayName',
];

const SETTINGS_SINGLES = [
  'settingsAdvanced', 'settingsAdvancedDesc', 'darkMode', 'darkModeOn', 'lightModeOn',
  'helpFaq', 'helpFaqDesc', 'sendFeedback', 'sendFeedbackDesc', 'setDisplayNameBtn',
  'rpaPlugin', 'rpaPluginDesc', 'languageSetting', 'paymentMethods', 'paymentMethodsDesc',
  'deleteAccount', 'deleteAccountConfirm',
];

const toneBannedTerms = [
  '策略', '规则覆盖', '管道', '粒度', '窗口期', '词库', '样本', '档位', '算法', '诊断',
  '守护强度', '同步频率', 'SSE', 'API',
];

const toneWhitelist: Record<string, string[]> = {
  // RPA 插件是 Android 侧专有名词, 文案若需点名可豁免
  rpaPlugin: ['RPA'],
};

function isSettingsKey(key: string): boolean {
  return (
    SETTINGS_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    SETTINGS_SINGLES.includes(key)
  );
}

/** 设置区每行 description (label 下方一句话说明) — zh ≤ 20 字 */
const SETTINGS_ROW_DESC_KEYS = [
  'greenPrefDesc', 'helpFaqDesc', 'sendFeedbackDesc', 'settingsAdvancedDesc',
  'guardianStyleEntryDesc', 'timeValueDesc', 'guardIntensityDesc', 'guardScopeDesc',
  'nightWindowDesc', 'spendingCapDesc', 'guardPolicyDesc', 'guardRuleCoverageDesc',
  'guardProfileDesc', 'guardDataDesc', 'greenPrefsDesc', 'greenImpactDesc',
  'rpaPluginDesc', 'paymentMethodsDesc',
];

describe('settings area tone guard (batch95-b)', () => {
  const settingsKeys = Object.keys(zhProfile).filter(isSettingsKey);

  it('圈定的设置区键成规模 (防前缀拼错导致守卫空转)', () => {
    expect(settingsKeys.length).toBeGreaterThanOrEqual(200);
  });

  it('设置区 zh 文案零工程黑话 (白名单豁免专有名词)', () => {
    for (const key of settingsKeys) {
      const exempted = toneWhitelist[key] ?? [];
      const collect = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
          for (const term of toneBannedTerms) {
            if (exempted.includes(term)) continue;
            expect(value.includes(term), `profile.${path} contains jargon "${term}": ${value}`).toBe(false);
          }
        } else if (value && typeof value === 'object') {
          for (const [child, grand] of Object.entries(value as CopyRecord)) {
            collect(grand, `${path}.${child}`);
          }
        }
      };
      collect(zhProfile[key], key);
    }
  });

  it('设置区每行 description zh ≤ 20 字 (一句话说清开了会怎样)', () => {
    expect(SETTINGS_ROW_DESC_KEYS.length).toBeGreaterThanOrEqual(18);
    for (const key of SETTINGS_ROW_DESC_KEYS) {
      const value = getValue(zhProfile, key);
      expect(typeof value, `profile.${key} should be a string`).toBe('string');
      expect(value as string, `profile.${key}`).toBeTruthy();
      expect((value as string).length, `profile.${key} is too long`).toBeLessThanOrEqual(20);
    }
  });

  it('设置区行 description 在 en 侧同步存在且非空', () => {
    for (const key of SETTINGS_ROW_DESC_KEYS) {
      expect(getValue(enProfile, key), `en missing profile.${key}`).toBeTruthy();
    }
  });
});
