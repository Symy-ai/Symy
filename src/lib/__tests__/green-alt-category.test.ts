// green-alt-category — 词条分类映射（此前 0 测试）
// 红线: 全集来自 GREEN_ALTERNATIVES; 未知 id 归 'other' (GET 容错),
// isKnownGreenAltEntry 供 POST 校验拒绝。
import { describe, expect, it } from 'vitest';
import { isKnownGreenAltEntry, greenAltCategoryOf } from '@/lib/green-alt-category';
import { GREEN_ALTERNATIVES } from '@/lib/green-alternatives';

describe('green-alt-category — 词条分类', () => {
  it('全词条 id 均已知 (分类器与词库同步)', () => {
    const unknown = GREEN_ALTERNATIVES.filter((e) => !isKnownGreenAltEntry(e.id));
    expect(unknown).toEqual([]);
  });

  it('每个已知词条分类非 other (除非词库真是 other 域)', () => {
    const otherClassified = GREEN_ALTERNATIVES.filter((e) => greenAltCategoryOf(e.id) === 'other');
    // 分类器不该把已知词条丢进 other — other 只属于未知 id
    expect(otherClassified).toEqual([]);
  });

  it('抽查映射: small_appliance→household, coffee_shop→food, repair_first→electronics', () => {
    expect(greenAltCategoryOf('small_appliance')).toBe('household');
    expect(greenAltCategoryOf('coffee_shop')).toBe('food');
    expect(greenAltCategoryOf('repair_first')).toBe('electronics');
  });

  it('未知 id → other (GET 聚合容错)', () => {
    expect(greenAltCategoryOf('nonexistent_entry_xyz')).toBe('other');
  });

  it('isKnownGreenAltEntry: 已知 true / 未知 false', () => {
    expect(isKnownGreenAltEntry(GREEN_ALTERNATIVES[0].id)).toBe(true);
    expect(isKnownGreenAltEntry('made_up_id')).toBe(false);
  });
});
