/**
 * i18n guard: batch81-b 新增 sample badge 调用不得带 defaultValue 兜底。
 * 词典 zh/en 必须同时提供非空文案; 组件测试的 mock t 也不会替生产兜底。
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

describe('defense.sampleDataBadge i18n guard', () => {
  it('resolves non-empty copy from both production dictionaries without fallback', () => {
    for (const locale of ['zh', 'en'] as const) {
      const messages = flatten(dictionary(locale));
      const copy = messages['defense.sampleDataBadge'];
      expect(copy, `${locale}.defense.sampleDataBadge must be a non-empty string`).toMatch(/^.+$/);
    }
  });

  it('keeps the production call free of a defaultValue argument', () => {
    const source = readFileSync('src/features/defense/components/inducement-strategies.tsx', 'utf-8');
    const call = source.match(/t\('defense\.sampleDataBadge'(?:[^)]*)\)/);
    expect(call).toBeTruthy();
    expect(call![0]).toBe("t('defense.sampleDataBadge')");
  });
});
