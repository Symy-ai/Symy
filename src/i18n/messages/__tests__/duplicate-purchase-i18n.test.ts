import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

describe('duplicate-purchase precheck i18n', () => {
  const locales = { en, zh } as const;
  it.each(['en', 'zh'] as const)('%s has complete bilingual copy', (locale) => {
    const copy = locales[locale].chat.duplicatePrecheck;
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.pause).toContain('{item}');
    expect(copy.followupQuestion).toContain('{item}');
    expect(Object.keys(copy.places).sort()).toEqual(['electronics', 'food', 'home', 'other']);
    expect(Object.values(copy).flat().join(' ')).not.toMatch(/\{(?:amount|price|saved)\}/);
    expect(JSON.stringify(copy)).not.toMatch(/浪费|乱买|waste|reckless/i);
  });
});
