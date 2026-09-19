/**
 * i18n guard: b81-84 透明度域 (transparency.*) + 物品清单 (profile.inventory*) 终检固化。
 * batch46/47 教训: 新 key 常带 defaultValue 兜底或动态拼键漏枚举, 缺一侧即裸键/英文兜底上屏。
 * 三查: 双侧 key 集合相等 / 值非空 / 生产调用零兜底 (含动态键枚举与字典子树互覆盖)。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Messages = Record<string, unknown>;

function flatten(messages: Messages, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object') Object.assign(result, flatten(item as Messages, path));
    else result[path] = item;
  }
  return result;
}

function dictionary(locale: 'zh' | 'en'): Record<string, unknown> {
  return flatten(JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, 'utf-8')) as Messages);
}

const GUARDED_DOMAINS = ['transparency.', 'profile.inventory.'];

function domainKeys(locale: 'zh' | 'en'): string[] {
  return Object.keys(dictionary(locale)).filter((key) => GUARDED_DOMAINS.some((d) => key.startsWith(d)));
}

/** 受护 key 的全部生产调用面 (getTranslations()/useI18n() 全键直调, 无 namespace 短键风格) */
const PRODUCTION_SOURCES = [
  'src/app/[locale]/transparency/page.tsx',
  'src/app/[locale]/transparency/finance/page.tsx',
  'src/app/[locale]/transparency/share-button.tsx',
  'src/app/[locale]/transparency/subscribe-form.tsx',
  'src/components/profile-parts/inventory-list-card.tsx',
  'src/components/profile-parts/inventory-delete-confirm-dialog.tsx',
];

describe('b81-84 transparency domain i18n guard', () => {
  it('keeps zh/en key sets exactly symmetric across guarded domains', () => {
    const zh = new Set(domainKeys('zh'));
    const en = new Set(domainKeys('en'));
    expect([...zh].sort()).toEqual([...en].sort());
    expect(zh.size).toBeGreaterThanOrEqual(60); // b81-84 受护双域 72 键; 只防整枝误删, 增键不设上限
  });

  it('keeps every guarded value a non-empty string on both sides', () => {
    for (const locale of ['zh', 'en'] as const) {
      const dict = dictionary(locale);
      for (const key of domainKeys(locale)) {
        const value = dict[key];
        expect(typeof value === 'string' && (value as string).trim().length > 0, `${locale}.${key} must be a non-empty string`).toBe(true);
      }
    }
  });

  it('covers dynamic-key enums and dictionary sub-trees mutually', () => {
    // cat.*: chat 建库品类 (未知名显示原文, 但命中集内缺键即裸键上屏)
    const card = readFileSync('src/components/profile-parts/inventory-list-card.tsx', 'utf-8');
    const categories = card
      .match(/CHAT_CATEGORIES = new Set\(\[([^\]]+)\]/)?.[1]
      ?.split(',')
      .map((s) => s.trim().replaceAll("'", ''));
    expect(categories).toBeDefined();
    // group.*: 相对时间分桶类型
    const client = readFileSync('src/lib/inventory-client.ts', 'utf-8');
    const groups = client
      .match(/export type InventoryGroup = ([^;]+);/)?.[1]
      ?.split('|')
      .map((s) => s.trim().replaceAll("'", ''));
    expect(groups).toBeDefined();

    for (const locale of ['zh', 'en'] as const) {
      const keys = Object.keys(dictionary(locale));
      expect(
        keys.filter((k) => k.startsWith('profile.inventory.cat.')).sort(),
      ).toEqual(categories!.map((c) => `profile.inventory.cat.${c}`).sort());
      expect(
        keys.filter((k) => k.startsWith('profile.inventory.group.')).sort(),
      ).toEqual(groups!.map((g) => `profile.inventory.group.${g}`).sort());
    }
  });

  it('keeps production calls free of defaultValue fallbacks', () => {
    for (const file of PRODUCTION_SOURCES) {
      const source = readFileSync(file, 'utf-8');
      expect(source, `${file} must not fall back via defaultValue`).not.toMatch(/defaultValue/);
      expect(source, `${file} must not pass a bare-string second t() argument`).not.toMatch(/t\('[^']+',\s*['"`]/);
    }
  });
});
