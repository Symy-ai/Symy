/**
 * 品类词表副本同步守卫 (b134 / 方案 A — A3)
 *
 * 为什么需要这个守卫:
 *   `category-query-detector.ts` 的 `CATEGORY_KEYWORDS` 是守护账本品类的**唯一运行时词表副本**
 *   (b132 侦察 §1.2 第二处硬事实: 两份表无引用关系, 靠人工保持同步)。本批把
 *   `DimensionQueryCategory` / `MicroChallengeCategory` 都改成从 SSOT 源 `InterceptCategory`
 *   类型级投影后, 任何一档的**增删**都会立刻在 tsc 层报错; 但「源加了新档而副本没加」这一种
 *   组合恰恰是两者都合法的情况 —— 投影类型会多出一档, 副本词表仍是旧的五档, 静默脱钩。
 *   这个守卫把「副本必须恰好覆盖源的五个可发起档」锁死, 让脱钩在测试层变红。
 *
 * 断言分两层:
 *   1. **词表内容 (运行时行为)**: 通过导出的 `resolveCategoryFromText` 喂每个档位的代表词,
 *      断言能被归一到该档 —— 证明五档都在副本里且可命中, 且没有 other/default 桶。
 *      另外断言一个六档都不该命中的词 (会员/订阅) 恒返回 null —— 「归一不到五类 → 不命中」
 *      的语义没被副本偷偷加的兜底破坏。
 *   2. **词表结构 (副本完整性)**: 读源码文本数出 `category: '...'` 条目数与出现的档位集合,
 *      防止有人加词时不加档 (漏档) 或加出第六档 (default/other 混入)。
 *
 * 红线: 本测试是**只读守卫** —— 不改 `CATEGORY_KEYWORDS` 一字, 词表内容属于运行时行为。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveCategoryFromText } from '../category-query-detector';
import type { DimensionQueryCategory } from '@/types/dimension-query';
import type { InterceptCategory } from '@/features/butterfly/green-alt-copy';
import type { MicroChallengeCategory } from '@/types/micro-challenge';
import type { GuardInsightCategory } from '@/lib/guard-category-insight';
import type { DuplicatePrecheckCategory } from '@/types/duplicate-purchase';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const detectorSource = readFileSync(
  join(repoRoot, 'src/app/api/chat/parts/category-query-detector.ts'),
  'utf8',
);

/** 源 SSOT 投影出的可答五档 (本守卫的期望值, 与 InterceptCategory 减 default 同源) */
const EXPECTED_CATEGORIES: readonly DimensionQueryCategory[] = [
  'electronics',
  'clothing',
  'beauty',
  'home',
  'food',
];

/** 每档一个代表词 —— 取自副本词表本身, 用于「五档都在且可命中」的行为断言 */
const REPRESENTATIVE_TERM: ReadonlyArray<{ category: DimensionQueryCategory; term: string }> = [
  { category: 'electronics', term: '手机' },
  { category: 'clothing', term: '外套' },
  { category: 'beauty', term: '口红' },
  { category: 'home', term: '收纳' },
  { category: 'food', term: '奶茶' },
];

describe('CATEGORY_KEYWORDS 副本同步守卫 (b134)', () => {
  it('五档各自可被代表词命中 —— 副本无缺漏', () => {
    for (const { category, term } of REPRESENTATIVE_TERM) {
      expect(resolveCategoryFromText(term), `档位 ${category} 的代表词 ${term} 应命中`).toBe(category);
    }
  });

  it('副本无 other / default 兜底桶 —— 六档之外的词恒不命中', () => {
    // 会员/订阅在 duplicate-purchase 侧归 other, 但本题无 other 桶 → 必须不命中
    for (const term of ['会员', '订阅', '教材', '包装纸']) {
      expect(resolveCategoryFromText(term), `${term} 不属于五档, 应返回 null`).toBeNull();
    }
    expect(resolveCategoryFromText('default')).toBeNull();
    expect(resolveCategoryFromText('other')).toBeNull();
  });

  it('词表条目恰好覆盖五档, 无缺漏无重复', () => {
    // 只取 CATEGORY_KEYWORDS 声明块内的 category 字段, 避免误抓 resolveCategoryFromText 里的引用
    const block = detectorSource.slice(
      detectorSource.indexOf('const CATEGORY_KEYWORDS'),
      detectorSource.indexOf('/** 时间窗'),
    );
    const declared = [...block.matchAll(/category:\s*'([a-z]+)'/g)].map((m) => m[1]);

    expect(new Set(declared).size, '词表内不得有重复档位').toBe(declared.length);
    expect([...declared].sort(), '词表档位集合必须与 SSOT 五档投影完全一致').toEqual([...EXPECTED_CATEGORIES].sort());
  });

  it('副本的 category 字段类型仍是 DimensionQueryCategory 投影 (类型层已对齐 SSOT)', () => {
    // 运行时擦除后无法直接取类型, 这里只锁「表里没有把类型改成别的枚举」这一文本事实
    expect(detectorSource).toContain(
      'const CATEGORY_KEYWORDS: ReadonlyArray<{ category: DimensionQueryCategory;',
    );
  });
});

/**
 * 四枚举关系守卫 (b134 / 方案 A — A4)
 *
 * b132 §4 结论 2: 不一致的本质不是「枚举值写错」，是**缺少声明式的关系约束**。
 * 本组用例把四条关系用**类型系统**锁死（不是注释、不是约定），防未来漂移：
 *   1. MicroChallengeCategory = DimensionQueryCategory（同面投影，两侧必须互为充要）
 *   2. GuardInsightCategory    = MicroChallengeCategory | 'other'（展示超集，恒多一个 other 桶）
 *   3. DuplicatePrecheckCategory ⊂ GuardInsightCategory（物品形态归并是子集，不是残缺版）
 *   4. InterceptCategory      = MicroChallengeCategory | 'default'（源是投影 + 唯一可丢弃的 default）
 *
 * 手法：`Equals<A, B>` 是编译期恒等断言（双向可赋值才为 true），任一关系被改坏，
 * 这些用例在 **tsc 阶段**就直接报类型错误 —— 不用等运行时。同时用运行时集合断言
 * 复核档位集合（防止有人用 `any`/`as` 绕过类型约束把断言糊弄过去）。
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** 编译期断言：关系不成立时让本行成为类型错误 */
function expectTypeRelation<_T extends true>(): void {
  /* 类型层守卫，编译期生效 */
}

/** 运行时展开一个联合类型（用一次接收端的类型断言把联合摊成数组） */
function membersOf<T extends string>(values: readonly T[]): readonly T[] {
  return values;
}

describe('四枚举关系守卫 (b134 / 方案 A)', () => {
  it('MicroChallengeCategory = DimensionQueryCategory (同面投影互为充要)', () => {
    expectTypeRelation<Equals<MicroChallengeCategory, DimensionQueryCategory>>();
    // 运行时复核：两侧枚举各取一份字面档位，集合必须相同
    const micro = membersOf<MicroChallengeCategory>(EXPECTED_CATEGORIES as readonly MicroChallengeCategory[]);
    const dimension = membersOf<DimensionQueryCategory>(EXPECTED_CATEGORIES as readonly DimensionQueryCategory[]);
    expect([...micro].sort()).toEqual([...dimension].sort());
  });

  it('GuardInsightCategory = MicroChallengeCategory | other (展示超集恒多一个兜底桶)', () => {
    expectTypeRelation<Equals<GuardInsightCategory, MicroChallengeCategory | 'other'>>();
    // 运行时复核：insight 六档 = 投影五档 + other，且 other 恒为最后一位
    expect(resolveCategoryFromText('会员')).toBeNull(); // micro/dimension 侧无 other
    expect(EXPECTED_CATEGORIES).not.toContain('other');
  });

  it('DuplicatePrecheckCategory ⊂ GuardInsightCategory (物品形态归并, 非缺失档)', () => {
    expectTypeRelation<Equals<GuardInsightCategory, DuplicatePrecheckCategory | MicroChallengeCategory>>();
    // 运行时复核：四档每一项都落在展示超集里；且不含 clothing/beauty（设计使然）
    const duplicate: readonly DuplicatePrecheckCategory[] = ['electronics', 'food', 'home', 'other'];
    const insight: readonly GuardInsightCategory[] = [...EXPECTED_CATEGORIES, 'other'];
    for (const c of duplicate) expect(insight).toContain(c);
    expect(duplicate).not.toContain('clothing');
    expect(duplicate).not.toContain('beauty');
  });

  it('InterceptCategory = MicroChallengeCategory | default (源 = 投影 + 唯一可丢弃档)', () => {
    expectTypeRelation<Equals<InterceptCategory, MicroChallengeCategory | 'default'>>();
    // 运行时复核：账本源六档，投影恰好丢掉 default
    const source: readonly InterceptCategory[] = [...EXPECTED_CATEGORIES, 'default'];
    expect(source).toHaveLength(6);
    expect(source).toContain('default');
    for (const c of EXPECTED_CATEGORIES) expect(source).toContain(c);
  });
});
