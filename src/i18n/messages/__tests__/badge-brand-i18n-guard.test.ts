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

/**
 * b106-b (BP p19 荣誉资产): 四枚荣誉徽章的「判定口径」文案守卫。
 * 徽章名/品牌串由上方 b89-c 守卫锁死; 这里锁判定语义 — 判定改了文案没跟上 (或回潮) 即红:
 * Money Forest = 赢回小时 (永不出现金额口径), Dream Gardener = 基金完成 (非"建了就算"),
 * Evergreen Guardian = 30 天 streak, 四枚 zh/en 双语齐全 + 新晒卡 chip key 双侧在位。
 */
describe('b106-b BP p19 honor badge criteria copy', () => {
  const FOUR_HONOR_IDS = ['green_guardian_10', 'streak_guardian_30', 'money_forest_500', 'dream_gardener_3'] as const;

  it('keeps all four BP honor badges fully present in zh and en (names/descriptions/unlock)', () => {
    for (const id of FOUR_HONOR_IDS) {
      for (const locale of ['zh', 'en'] as const) {
        for (const subtree of SUBTREES) {
          const value = dictionaries[locale][`buddy.${subtree}.${id}`];
          expect(isNonEmptyString(value), `${locale}.${subtree}.${id} must exist and be non-empty`).toBe(true);
        }
      }
    }
  });

  it('states Money Forest in won-back hours and never in currency terms', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (const subtree of ['badgeUnlock', 'badgeDescriptions'] as const) {
        const text = dictionaries[locale][`buddy.${subtree}.money_forest_500`] as string;
        expect(text, `${locale}.${subtree}.money_forest_500 must name the 100h threshold`).toContain('100');
        expect(text, `${locale}.${subtree}.money_forest_500 must speak in hours`).toMatch(/小时|hour/i);
        expect(text, `${locale}.${subtree}.money_forest_500 must not carry currency symbols`).not.toMatch(/[$¥€£]/);
        expect(text, `${locale}.${subtree}.money_forest_500 must not regress to the saved-amount criterion`).not.toMatch(/省下|Save \$|saved \$|kept from/i);
      }
    }
  });

  it('states Dream Gardener as funds brought to completion, not merely created', () => {
    const zhUnlock = dictionaries.zh['buddy.badgeUnlock.dream_gardener_3'] as string;
    const enUnlock = dictionaries.en['buddy.badgeUnlock.dream_gardener_3'] as string;
    expect(zhUnlock).toContain('3');
    expect(zhUnlock).toContain('完成');
    expect(zhUnlock).not.toContain('同时培育');
    expect(enUnlock).toContain('3');
    expect(enUnlock).toMatch(/fund|complet|bloom/i);
    expect(enUnlock).not.toContain('at the same time');
    // 描述侧同语义 — 走到完成/开花结果, 不再是"一起生长"
    expect(dictionaries.zh['buddy.badgeDescriptions.dream_gardener_3'] as string).toMatch(/完成|开花结果/);
    expect(dictionaries.en['buddy.badgeDescriptions.dream_gardener_3'] as string).toMatch(/bloom|complet|finish/i);
  });

  it('pins Evergreen Guardian to the 30-day streak phrasing on both sides', () => {
    for (const locale of ['zh', 'en'] as const) {
      const unlock = dictionaries[locale]['buddy.badgeUnlock.streak_guardian_30'] as string;
      expect(unlock).toContain('30');
      expect(unlock, `${locale} unlock must keep the streak wording`).toMatch(/streak|连续|天/i);
    }
  });

  it('defines the new share stat chips for the honor progress types on both sides', () => {
    for (const locale of ['zh', 'en'] as const) {
      const hours = dictionaries[locale]['share.badgeCard.statHours'];
      const completed = dictionaries[locale]['share.badgeCard.statDreamsCompleted'];
      expect(isNonEmptyString(hours), `${locale} share.badgeCard.statHours must exist`).toBe(true);
      expect(hours as string).toContain('{hours}');
      expect(isNonEmptyString(completed), `${locale} share.badgeCard.statDreamsCompleted must exist`).toBe(true);
      expect(completed as string).toContain('{count}');
    }
  });
});
