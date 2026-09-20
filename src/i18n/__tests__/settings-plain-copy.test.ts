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
