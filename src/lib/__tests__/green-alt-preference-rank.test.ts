/**
 * Tests for green-alt-preference-rank (batch62-b)
 *
 * 排序测试锁定 (验收口径):
 * - 无反馈时行为与 suggestAlternative 完全一致 (逐字段)
 * - 同 entry 冷却: 冷却词条在多命中时后置让位
 * - 同 category 降频: 品类冷却压全品类, 但面小于词条级
 * - 不同 entry 不受误伤: 冷却词条不改变其他词条的文案与命中
 * - 用户显式提问仍返回: 唯一命中且在冷却 → 照常返回 (不永久屏蔽)
 * - already_have → 复用建议先行 (不触发羞辱文案); wrong_channel → 渠道行换表达
 */

import { describe, it, expect } from 'vitest';
import { suggestAlternative } from '../green-alternatives';
import { suggestAlternativeWithPreference } from '../green-alt-preference-rank';
import { resolveGreenAltPreference, GREEN_ALT_REJECTION_SOURCE } from '../green-alt-preference';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const DAY_MS = 86400000;
const MULTI = '买皮草还是真皮包'; // fur (wear) + animal_leather (wear)
const CROSS = '皮草和塑料袋'; // fur (wear) + single_use_plastic (home)

function rejection(entryId: string, reason: string, daysAgo: number) {
  return {
    metadata: { source: GREEN_ALT_REJECTION_SOURCE, entryId, reason },
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  };
}

describe('suggestAlternativeWithPreference', () => {
  it('无任何偏好时与 suggestAlternative 输出完全一致', () => {
    for (const q of [MULTI, CROSS, '皮草', '想买个貂皮围巾']) {
      expect(suggestAlternativeWithPreference(q, 'zh', null)).toEqual(suggestAlternative(q, 'zh'));
      expect(suggestAlternativeWithPreference(q, 'zh', resolveGreenAltPreference([], NOW))).toEqual(
        suggestAlternative(q, 'zh'),
      );
    }
  });

  it('同 entry 冷却: fur 在冷却中 → 多命中时让位 animal_leather', () => {
    const state = resolveGreenAltPreference([rejection('fur', 'not_now', 2)], NOW);
    const hit = suggestAlternativeWithPreference(MULTI, 'zh', state);
    expect(hit?.id).toBe('animal_leather');
  });

  it('同 category 降频: wear 品类冷却 → fur 让位非同类 fresh 词条', () => {
    // ivory_bone_carving 拒绝 (not_now 1 天前): ivory 词条冷却 + wear 品类降频 3 天
    const state = resolveGreenAltPreference([rejection('ivory_bone_carving', 'not_now', 1)], NOW);
    const hit = suggestAlternativeWithPreference(CROSS, 'zh', state);
    expect(hit?.id).toBe('single_use_plastic');
  });

  it('不同 entry 不受误伤: fur 冷却不影响 animal_leather 单独命中的文案', () => {
    const state = resolveGreenAltPreference([rejection('fur', 'not_now', 2)], NOW);
    const hit = suggestAlternativeWithPreference('真皮钱包', 'zh', state);
    expect(hit?.id).toBe('animal_leather');
    expect(hit).toEqual(suggestAlternative('真皮钱包', 'zh'));
  });

  it('用户显式提问仍返回: 唯一命中且词条在冷却 → 照常返回不屏蔽', () => {
    const state = resolveGreenAltPreference([rejection('fur', 'not_now', 0)], NOW);
    const hit = suggestAlternativeWithPreference('皮草', 'zh', state);
    expect(hit?.id).toBe('fur');
    // prefer_buy 短冷却同样只降不删
    const buy = resolveGreenAltPreference([rejection('fur', 'prefer_buy', 0)], NOW);
    expect(suggestAlternativeWithPreference('皮草', 'zh', buy)?.id).toBe('fur');
  });

  it('already_have: 复用建议先行 (message 以 reuse 文案开头), 全句无羞辱词', () => {
    const state = resolveGreenAltPreference([rejection('fur', 'already_have', 0)], NOW);
    const hit = suggestAlternativeWithPreference('皮草', 'zh', state);
    expect(hit?.message.startsWith(hit!.reuse)).toBe(true);
    expect(hit?.message).toContain(hit!.alternative);
    // en 对称
    const en = suggestAlternativeWithPreference('fur coat', 'en', state);
    expect(en?.message.startsWith(en!.reuse)).toBe(true);
    // 不产生负面标签式文案
    expect(hit?.message).not.toMatch(/不该|不应该|羞愧|should be ashamed/i);
  });

  it('wrong_channel: 渠道行换租借/借用先行表达 (词条原文保留)', () => {
    const state = resolveGreenAltPreference([rejection('fur', 'wrong_channel', 0)], NOW);
    const hit = suggestAlternativeWithPreference('皮草', 'zh', state);
    expect(hit?.reuseChannel.startsWith('租借、借用也可以')).toBe(true);
    expect(hit?.reuseChannel).toContain(suggestAlternative('皮草', 'zh')!.reuseChannel);
    const en = suggestAlternativeWithPreference('fur coat', 'en', state);
    expect(en?.reuseChannel.startsWith('Renting or borrowing works too')).toBe(true);
  });

  it('未冷却词条的 already_have/wrong_channel 不影响其他命中表达', () => {
    // ivory_bone_carving already_have → wear 品类降频, fur 让位; 胜者 single_use_plastic
    // 自身无词条级偏好 → 文案表达保持原样 (与它单独命中时完全一致)
    const state = resolveGreenAltPreference([rejection('ivory_bone_carving', 'already_have', 0)], NOW);
    const hit = suggestAlternativeWithPreference(CROSS, 'zh', state);
    const baseline = suggestAlternative('塑料袋', 'zh');
    expect(hit?.id).toBe('single_use_plastic');
    expect(hit?.message).toBe(baseline?.message);
    expect(hit?.reuseChannel).toBe(baseline?.reuseChannel);
  });
});
