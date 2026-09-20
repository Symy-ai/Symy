/**
 * i18n guard: hero stats copy must resolve from both dictionaries.
 * Production calls must not hide missing keys behind defaultValue.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Messages = Record<string, unknown>;

function dictionary(locale: 'zh' | 'en'): Messages {
  return JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, 'utf-8')) as Messages;
}

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object') Object.assign(result, flatten(item as Messages, path));
    else result[path] = String(item);
  }
  return result;
}

describe('defense hero stats i18n guard', () => {
  it('resolves non-empty hero stats copy from both production dictionaries', () => {
    const keys = [
      'defense.heroStats',
      'defense.hoursTogether',
      'defense.collectiveWonBack',
      'defense.founderLine',
    ];

    for (const locale of ['zh', 'en'] as const) {
      const messages = flatten(dictionary(locale));
      for (const key of keys) {
        expect(messages[key], `${locale}.${key} must be a non-empty string`).toMatch(/^.+$/);
      }
    }
  });

  it('keeps the production component free of defaultValue calls', () => {
    const source = readFileSync('src/features/defense/components/defense-hero-stats.tsx', 'utf-8');
    expect(source.includes('defaultValue')).toBe(false);
  });
});
