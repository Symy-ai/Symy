import { describe, expect, it } from 'vitest';

import {
  GREEN_ANNOTATION_SEED_OVERSHOOT,
  GREEN_ANNOTATION_TARGET_PER_LOCALE,
  GREEN_ANNOTATION_TARGET_TOTAL,
  SYNTHETIC_NOTE,
  type GreenAnnotationEntry,
  type GreenAnnotationLabel,
  type GreenAnnotationLocale,
  type GreenAnnotationSource,
} from '../annotation-schema';

/**
 * annotation-schema.ts (57行) — Jev Wave 0 标注集数据结构 (纯类型+常量)。
 *
 * 两条纪律锚:
 *   1. ruleLabel 机械算出禁手改 (冻结基准)
 *   2. humanLabel 只允许人工填 — 字段缺席=未标注, 'unknown'=已标注存疑, 语义不同
 *
 * 锁定:
 * - 四值档位; 中英配额 (200 总/100 每侧/1.1 超额)
 * - Entry 形状 satisfies 锚定 (缺一即红)
 * - SYNTHETIC_NOTE 约定串
 */
describe('GreenAnnotation 档位与配额', () => {
  it('四值档位', () => {
    const all: GreenAnnotationLabel[] = ['high', 'medium', 'low', 'unknown'];
    expect(all).toHaveLength(4);
  });

  it('Wave 0 验收线配额: 200 总/每侧 100/超额 1.1', () => {
    expect(GREEN_ANNOTATION_TARGET_TOTAL).toBe(200);
    expect(GREEN_ANNOTATION_TARGET_PER_LOCALE).toBe(100);
    expect(GREEN_ANNOTATION_TARGET_TOTAL).toBe(GREEN_ANNOTATION_TARGET_PER_LOCALE * 2); // 中英各半
    expect(GREEN_ANNOTATION_SEED_OVERSHOOT).toBeCloseTo(1.1);
    expect(Math.round(GREEN_ANNOTATION_TARGET_TOTAL * GREEN_ANNOTATION_SEED_OVERSHOOT)).toBe(220); // 220 条铺样
  });

  it('SYNTHETIC_NOTE 约定串', () => {
    expect(SYNTHETIC_NOTE).toBe('synthetic-from-lexicon');
  });
});

describe('GreenAnnotationEntry 形状锚定', () => {
  it('完整条目 satisfies (缺字段即编译红)', () => {
    const entry = {
      id: 'ann-0001',
      locale: 'zh',
      title: '二手咖啡机 九成新',
      category: 'electronics',
      queryContext: '咖啡机',
      ruleLabel: 'high',
      humanLabel: 'high',
      source: 'seed-fixture',
      notes: 'seed-fixture:src/__fixtures__/x.json',
    } satisfies GreenAnnotationEntry;
    expect(entry.id).toBe('ann-0001');
    expect(entry.ruleLabel).toBe('high'); // 机械基准
    expect(entry.humanLabel).toBe('high'); // 人工回填
  });

  it('humanLabel 缺席 = 未标注 (与 unknown 语义区分)', () => {
    const unannotated = {
      id: 'ann-0002',
      locale: 'en',
      title: 'Refurbished laptop',
      ruleLabel: 'medium',
      source: 'manual',
    } satisfies GreenAnnotationEntry;
    const wide = unannotated as GreenAnnotationEntry;
    expect(wide.humanLabel).toBeUndefined();
  });

  it('locale/source 联合类型编译锚', () => {
    const locales: GreenAnnotationLocale[] = ['zh', 'en'];
    const sources: GreenAnnotationSource[] = ['seed-fixture', 'manual'];
    expect(locales).toHaveLength(2);
    expect(sources).toHaveLength(2);
  });
});
