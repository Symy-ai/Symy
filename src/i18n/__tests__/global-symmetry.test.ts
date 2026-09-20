import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Messages = Record<string, unknown>;
type FlatMessages = Record<string, unknown>;

function flatten(messages: Messages, prefix = ''): FlatMessages {
  const result: FlatMessages = {};

  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Messages, path));
    } else {
      result[path] = value;
    }
  }

  return result;
}

function dictionary(locale: 'zh' | 'en'): FlatMessages {
  const messages = JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, 'utf8')) as Messages;
  return flatten(messages);
}

describe('global i18n symmetry', () => {
  it('keeps zh/en key sets exactly symmetric', () => {
    const zhKeys = new Set(Object.keys(dictionary('zh')));
    const enKeys = new Set(Object.keys(dictionary('en')));

    expect([...zhKeys].filter((key) => !enKeys.has(key)).sort()).toEqual([]);
    expect([...enKeys].filter((key) => !zhKeys.has(key)).sort()).toEqual([]);
    expect(zhKeys.size).toBeGreaterThan(0);
    expect(enKeys.size).toBe(zhKeys.size);
  });

  it('keeps every value non-empty on both sides', () => {
    for (const locale of ['zh', 'en'] as const) {
      const messages = dictionary(locale);

      for (const [key, value] of Object.entries(messages)) {
        const isNonEmptyString = typeof value === 'string' && value.trim().length > 0;
        const isNonEmptyObjectArray = Array.isArray(value) && value.length > 0 &&
          value.every((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
            return Object.values(item).every((entry) => typeof entry === 'string' && entry.trim().length > 0);
          });
        expect(isNonEmptyString || isNonEmptyObjectArray, `${locale}.${key} must be non-empty`).toBe(true);
      }
    }
  });
});
