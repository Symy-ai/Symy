import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../en.json';
import zh from '../zh.json';

const forbiddenFragmentsByLocale = {
  zh: [
    '再想想',
    '别买',
    '没忍住',
    '控制住',
    '克制点',
    '你怎么又',
    '说到做到',
  ],
  en: [
    'Think again',
    'Don\'t buy',
    'Don’t buy',
    'couldn\'t help it',
    'couldn’t help it',
    'Control yourself',
  ],
} as const;

function collectStrings(value: unknown, key: string[] = []): Array<{ key: string; text: string }> {
  if (typeof value === 'string') return [{ key: key.join('.'), text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectStrings(item, [...key, String(index)]));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, childValue]) => collectStrings(childValue, [...key, childKey]));
  }
  return [];
}

describe('i18n redline: elephant tone has no interception-refrain or shaming fragments', () => {
  it.each(['en', 'zh'] as const)('%s messages contain no forbidden fragments', (locale) => {
    const violations = collectStrings(locale === 'zh' ? zh : en)
      .flatMap(({ key, text }) => forbiddenFragmentsByLocale[locale]
        .filter((fragment) => text.includes(fragment))
        .map((fragment) => `${key}: ${fragment}`));

    expect(violations).toEqual([]);
  });

  it('the guard reads deployed JSON files, not only bundled imports', () => {
    for (const locale of ['en', 'zh'] as const) {
      const source = readFileSync(resolve(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8');
      const violations = forbiddenFragmentsByLocale[locale].filter((fragment) => source.includes(fragment));
      expect(violations).toEqual([]);
    }
  });
});
