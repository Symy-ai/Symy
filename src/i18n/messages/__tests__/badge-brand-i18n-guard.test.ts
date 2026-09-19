/**
 * i18n guard: b89-c BP p13 守护林徽章品牌资产命名固化 (值层锁; key 对称由 defaultValue-guard 覆盖)。
 * BP 对外英文名是荣誉资产: en 侧按徽章系锁品牌精确串 (大小写敏感, 拼写/大小写/翻译走样即红);
 * zh 侧锁语义词不锁句 (措辞自由, 同义词接受)。附带 id ↔ i18n 子树双向映射完整 + 值非空。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_BADGES } from '../../../lib/badge-constants';

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

const dictionaries: Record<'zh' | 'en', Record<string, unknown>> = {
  zh: flatten(JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8')) as Messages),
  en: flatten(JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8')) as Messages),
};

/**
 * BP p13 四徽章系 (按 id 前缀归属, 系内新徽章自动入锁):
 * zh 语义词 money_forest 现值「小树林」——树林/森林同义接受, 只锁森林隐喻不锁措辞。
 */
const BRAND_FAMILIES = [
  { idPrefix: 'green_guardian', brandEn: 'Green Guardian', zhWords: ['守护'] },
  { idPrefix: 'streak_guardian', brandEn: 'Evergreen Guardian', zhWords: ['常青'] },
  { idPrefix: 'money_forest', brandEn: 'Money Forest', zhWords: ['森林', '树林', '林'] },
  { idPrefix: 'dream_gardener', brandEn: 'Dream Gardener', zhWords: ['园丁'] },
] as const;

const SUBTREES = ['badgeUnlock', 'badgeNames', 'badgeDescriptions'] as const;
const PROSE_SUBTREES = ['badgeNames', 'badgeDescriptions'] as const;

function familyMembers(idPrefix: string) {
  return ALL_BADGES.filter((badge) => badge.id.startsWith(idPrefix));
}

function subtreeIds(locale: 'zh' | 'en', subtree: (typeof SUBTREES)[number]): Set<string> {
  const prefix = `buddy.${subtree}.`;
  return new Set(
    Object.keys(dictionaries[locale])
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length)),
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

describe('b89-c guardian-forest badge brand i18n guard', () => {
  it('locks each BP badge family en name to the exact brand string (case-sensitive)', () => {
    for (const family of BRAND_FAMILIES) {
      const members = familyMembers(family.idPrefix);
      expect(members.length, `family ${family.idPrefix} must own at least one badge`).toBeGreaterThanOrEqual(1);
      for (const badge of members) {
        const enName = dictionaries.en[`buddy.badgeNames.${badge.id}`];
        expect(enName, `en badgeNames.${badge.id} must be a string`).toSatisfy(isNonEmptyString);
        expect(enName, `en badgeNames.${badge.id} must carry the BP brand name`).toContain(family.brandEn);
      }
    }
  });

  it('keeps each BP brand string exclusive to its own family across all en badge names', () => {
    for (const family of BRAND_FAMILIES) {
      const memberIds = new Set(familyMembers(family.idPrefix).map((badge) => badge.id));
      for (const badge of ALL_BADGES) {
        if (memberIds.has(badge.id)) continue;
        const enName = dictionaries.en[`buddy.badgeNames.${badge.id}`];
        expect(enName, `brand ${family.brandEn} must not leak into ${badge.id}`).not.toContain(family.brandEn);
      }
    }
  });

  it('keeps zh names semantically anchored to the family metaphor (lock words, not sentences)', () => {
    for (const family of BRAND_FAMILIES) {
      for (const badge of familyMembers(family.idPrefix)) {
        const zhName = dictionaries.zh[`buddy.badgeNames.${badge.id}`];
        expect(isNonEmptyString(zhName), `zh badgeNames.${badge.id} must be a non-empty string`).toBe(true);
        const name = zhName as string;
        expect(
          family.zhWords.some((word) => name.includes(word)),
          `zh badgeNames.${badge.id} (${name}) must keep one of [${family.zhWords.join('/')}]`,
        ).toBe(true);
      }
    }
  });

  it('resolves every badge unlockConditionKey to a non-empty string on both sides', () => {
    for (const badge of ALL_BADGES) {
      for (const locale of ['zh', 'en'] as const) {
        const value = dictionaries[locale][badge.unlockConditionKey];
        expect(value, `${locale}.${badge.unlockConditionKey} must resolve to a non-empty string`).toSatisfy(isNonEmptyString);
      }
    }
  });

  it('keeps badge id ↔ i18n subtree mapping complete in both directions with non-empty values', () => {
    const ids = new Set(ALL_BADGES.map((badge) => badge.id));
    const unlockKeys = ALL_BADGES.map((badge) => badge.unlockConditionKey).sort();
    for (const locale of ['zh', 'en'] as const) {
      for (const subtree of SUBTREES) {
        const dictionaryIds = subtreeIds(locale, subtree);
        expect(
          [...dictionaryIds].filter((id) => !ids.has(id)).sort(),
          `${locale}.${subtree} must not hold orphan badge keys`,
        ).toEqual([]);
        expect(
          [...ids].filter((id) => !dictionaryIds.has(id)).sort(),
          `${locale}.${subtree} must cover every badge id`,
        ).toEqual([]);
      }
      expect([...subtreeIds(locale, 'badgeUnlock')].map((id) => `buddy.badgeUnlock.${id}`).sort()).toEqual(unlockKeys);
      for (const id of ids) {
        for (const subtree of PROSE_SUBTREES) {
          const value = dictionaries[locale][`buddy.${subtree}.${id}`];
          expect(value, `${locale}.${subtree}.${id} must be a non-empty string`).toSatisfy(isNonEmptyString);
        }
      }
    }
  });
});
