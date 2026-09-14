/**
 * guard-consistency-matrix 测试 (batch63-b)
 *
 * 覆盖验收:
 * 1. 纯函数七场景: 空数据 / 乱序 / 重复 triggerId / 无效 createdAt /
 *    不足样本 / 单一域满样本 / 混合域
 * 2. 分类回归: 矩阵域 id 与既有 classifier (resolveGuardCategory /
 *    greenAltCategoryOf / REUSE_CATEGORIES) 输出一致, 不复制词表
 * 3. 红线: 分享/公开形状结构上无金额字段; 金额只在 privateEstSavedByCategory
 * 4. 文案非羞辱: profile.guardMatrix.* 不出现 失败/失控/fail 类词
 * 5. label 完整性: 三轨词表并集每个品类 id 在 zh/en 都有 cat.<id> 展示名
 *
 * 锚点: 事件 createdAt 用无时区后缀的 ISO 串 (ES 规范按本地时区解析),
 * 本地日键恒定, 无 UTC 日期炸弹。
 */

import { describe, expect, it } from 'vitest';
import {
  buildGuardConsistencyMatrix,
  buildGuardConsistencyShare,
  MATRIX_MIN_DOMAIN_SAMPLE,
  type GuardMatrixEventInput,
} from '../guard-consistency-matrix';
import { resolveGuardCategory } from '../guard-category-insight';
import { greenAltCategoryOf } from '../green-alt-category';
import { REUSE_CATEGORIES } from '../reuse-categories';
import { GUARD_SCOPE_CATEGORIES } from '../guard-scope';
import { GREEN_ALTERNATIVES } from '../green-alternatives';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';

/** 本地时区 ISO (无 Z 后缀 → 按本地时间解析, 日键稳定) */
function localIso(day: number, hour = 12): string {
  return `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:30:00`;
}

function completed(partial: Partial<GuardMatrixEventInput>): GuardMatrixEventInput {
  return { eventType: 'challenge_completed', metadata: {}, triggerId: `cc:${Math.random()}`, createdAt: localIso(1), ...partial };
}

function failed(partial: Partial<GuardMatrixEventInput>): GuardMatrixEventInput {
  return { eventType: 'challenge_failed', metadata: {}, triggerId: `cf:${Math.random()}`, createdAt: localIso(2), ...partial };
}

function altAdoption(entryId: string, day = 3, estSaved = 0): GuardMatrixEventInput {
  return {
    eventType: 'mindful_recovery',
    metadata: { kind: 'green_alt_adoption', entryId, estSaved },
    triggerId: `green-alt-adoption:${entryId}`,
    createdAt: localIso(day),
  };
}

function reuseAdoption(categoryId: string, day = 4, estSaved = 0): GuardMatrixEventInput {
  return {
    eventType: 'mindful_recovery',
    metadata: { kind: 'reuse_adoption', categoryId, estSaved },
    triggerId: `reuse-adoption:${categoryId}:${day}`,
    createdAt: localIso(day),
  };
}

describe('buildGuardConsistencyMatrix — 纯函数七场景', () => {
  it('空数据 (null / undefined / [] / 全无效) → status empty, 无行无结论', () => {
    for (const input of [null, undefined, []]) {
      const m = buildGuardConsistencyMatrix(input);
      expect(m.status).toBe('empty');
      expect(m.rows).toEqual([]);
      expect(m.steadiestCategory).toBeNull();
      expect(m.needsCareCategory).toBeNull();
      expect(m.unclassified).toBe(0);
      expect(m.activeDays).toBe(0);
      expect(m.privateEstSavedByCategory).toEqual({});
    }
    // 全是无效条目 (非三轨 / 无效 createdAt) 也归 empty
    const junk = buildGuardConsistencyMatrix([
      { eventType: 'manual_adjustment', metadata: { category: 'food' }, createdAt: localIso(1) },
      { eventType: 'challenge_completed', metadata: { category: 'food' }, createdAt: 'not-a-date' },
    ]);
    expect(junk.status).toBe('empty');
  });

  it('乱序输入与有序输入结果一致 (稳定度排序不受输入顺序影响)', () => {
    const food = (triggerId: string, day: number) => completed({ metadata: { category: 'food', savedAmount: 10 }, triggerId, createdAt: localIso(day) });
    const ordered = [
      food('a', 1), food('b', 2), failed({ metadata: { category: 'food' }, triggerId: 'c', createdAt: localIso(3) }),
      completed({ metadata: { category: 'electronics' }, triggerId: 'd', createdAt: localIso(4) }),
      completed({ metadata: { category: 'electronics' }, triggerId: 'e', createdAt: localIso(5) }),
      completed({ metadata: { category: 'electronics' }, triggerId: 'f', createdAt: localIso(6) }),
    ];
    const shuffled = [ordered[3], ordered[0], ordered[5], ordered[2], ordered[1], ordered[4]];
    const a = buildGuardConsistencyMatrix(ordered);
    const b = buildGuardConsistencyMatrix(shuffled);
    expect(b.rows.map((r) => [r.category, r.guarded, r.released, r.stability]))
      .toEqual(a.rows.map((r) => [r.category, r.guarded, r.released, r.stability]));
    expect(b.steadiestCategory).toBe(a.steadiestCategory);
    expect(b.needsCareCategory).toBe(a.needsCareCategory);
    expect(b.activeDays).toBe(6);
  });

  it('重复 triggerId 按轨去重: 同轨同 id 只计一次, 异轨同 id 各计一次', () => {
    const dup = buildGuardConsistencyMatrix([
      completed({ metadata: { category: 'food' }, triggerId: 'same', createdAt: localIso(1) }),
      completed({ metadata: { category: 'food' }, triggerId: 'same', createdAt: localIso(1) }),
      failed({ metadata: { category: 'food' }, triggerId: 'same', createdAt: localIso(2) }),
      altAdoption('milk_tea', 3),
      altAdoption('milk_tea', 3),
    ]);
    const food = dup.rows.find((r) => r.category === 'food')!;
    expect(food.guarded).toBe(1);
    expect(food.released).toBe(1);
    expect(food.adoptedAlt).toBe(1);
  });

  it('无效 createdAt 的条目整条跳过 (不计数不占天数)', () => {
    const m = buildGuardConsistencyMatrix([
      completed({ metadata: { category: 'food' }, triggerId: 'ok', createdAt: localIso(1) }),
      completed({ metadata: { category: 'food' }, triggerId: 'bad', createdAt: '2026-13-99T99:99:99' }),
      completed({ metadata: { category: 'food' }, triggerId: 'missing' , createdAt: null }),
    ]);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].guarded).toBe(1);
    expect(m.activeDays).toBe(1);
    expect(m.status).toBe('insufficient');
  });

  it(`不足样本 (域相关事件 < ${MATRIX_MIN_DOMAIN_SAMPLE}) → 行与矩阵都 insufficient, 稳定度不出数`, () => {
    const m = buildGuardConsistencyMatrix([
      completed({ metadata: { category: 'food' }, triggerId: 'a', createdAt: localIso(1) }),
      failed({ metadata: { category: 'food' }, triggerId: 'b', createdAt: localIso(2) }),
    ]);
    expect(m.status).toBe('insufficient');
    expect(m.rows[0].status).toBe('insufficient');
    expect(m.rows[0].stability).toBe(0);
    expect(m.steadiestCategory).toBeNull();
    expect(m.needsCareCategory).toBeNull();
  });

  it('单一域满样本: 稳定度 = 行动/相关, 最稳域 = 该域, needsCare 为空', () => {
    const m = buildGuardConsistencyMatrix([
      completed({ metadata: { category: 'food', savedAmount: 12.5 }, triggerId: 'a', createdAt: localIso(1) }),
      completed({ metadata: { category: 'food', savedAmount: 8 }, triggerId: 'b', createdAt: localIso(1) }),
      altAdoption('milk_tea', 2, 3),
    ]);
    expect(m.status).toBe('ok');
    expect(m.rows).toHaveLength(1);
    const food = m.rows[0];
    expect(food).toMatchObject({ category: 'food', guarded: 2, adoptedAlt: 1, released: 0, activeDays: 2, stability: 1, status: 'ok' });
    expect(m.steadiestCategory).toBe('food');
    expect(m.needsCareCategory).toBeNull();
    expect(m.privateEstSavedByCategory).toEqual({ food: 12.5 + 8 + 3 });
  });

  it('混合域: 排序/称号/未归类/并集天数/私享金额各自成立', () => {
    const m = buildGuardConsistencyMatrix([
      // electronics: 3 守 0 放 → 稳定度 1.0, 最稳域
      completed({ metadata: { category: 'electronics', savedAmount: 40 }, triggerId: 'e1', createdAt: localIso(1) }),
      completed({ metadata: { category: 'electronics', savedAmount: 20 }, triggerId: 'e2', createdAt: localIso(2) }),
      completed({ metadata: { category: 'electronics' }, triggerId: 'e3', createdAt: localIso(3) }),
      // food: 2 守 1 放 1 替代 → 稳定度 0.75, 唯一有放行的 ok 域 → 值得陪一下
      completed({ metadata: { category: 'food', savedAmount: 10 }, triggerId: 'f1', createdAt: localIso(1) }),
      completed({ metadata: { category: 'food' }, triggerId: 'f2', createdAt: localIso(4) }),
      failed({ metadata: { category: 'food' }, triggerId: 'f3', createdAt: localIso(5) }),
      altAdoption('milk_tea', 5, 2.5),
      // apparel: 2 替代 → 样本不足, 不出结论
      altAdoption('new_clothes', 6),
      altAdoption('limited_sneakers', 7),
      // 归不到域: 拦截事件无品类可派生 + 未知 reuse 类目
      completed({ metadata: null, triggerId: 'x1', createdAt: localIso(8) }),
      { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', categoryId: 'no_such' }, triggerId: 'x2', createdAt: localIso(8) },
      // 非三轨事件完全不参与
      { eventType: 'impulse_damage', metadata: { category: 'food' }, triggerId: 'x3', createdAt: localIso(8) },
    ]);

    expect(m.status).toBe('ok');
    expect(m.unclassified).toBe(2);
    expect(m.activeDays).toBe(8);
    expect(m.rows.map((r) => r.category)).toEqual(['electronics', 'food', 'apparel']);
    expect(m.steadiestCategory).toBe('electronics');
    expect(m.needsCareCategory).toBe('food');
    const food = m.rows[1];
    expect(food).toMatchObject({ guarded: 2, adoptedAlt: 1, released: 1, activeDays: 3, stability: 0.75, status: 'ok' });
    expect(m.rows[2]).toMatchObject({ status: 'insufficient', stability: 0 });
    expect(m.privateEstSavedByCategory).toEqual({ electronics: 60, food: 12.5 });
    // 放行轨不计金额: food 只含 completed 的 savedAmount + alt 的 estSaved
  });

  it('全放行满样本域: 稳定度 0 仍 ok, 只参选 needsCare 永不当最稳域', () => {
    const m = buildGuardConsistencyMatrix([
      failed({ metadata: { itemName: '秋季外套' }, triggerId: 'c1', createdAt: localIso(1) }),
      failed({ metadata: { itemName: '秋季外套' }, triggerId: 'c2', createdAt: localIso(2) }),
      failed({ metadata: { itemName: '秋季外套' }, triggerId: 'c3', createdAt: localIso(3) }),
      completed({ metadata: { category: 'food' }, triggerId: 'f1', createdAt: localIso(1) }),
      completed({ metadata: { category: 'food' }, triggerId: 'f2', createdAt: localIso(2) }),
      completed({ metadata: { category: 'food' }, triggerId: 'f3', createdAt: localIso(3) }),
    ]);
    const clothing = m.rows.find((r) => r.category === 'clothing')!;
    expect(clothing.status).toBe('ok');
    expect(clothing.stability).toBe(0);
    expect(m.steadiestCategory).toBe('food');
    expect(m.needsCareCategory).toBe('clothing');
  });
});

describe('分类回归 — 矩阵域 id 与既有 classifier 输出一致', () => {
  it('拦截轨: metadata.category 直通 + itemName 派生, 与 resolveGuardCategory 对齐', () => {
    const direct = completed({ metadata: { category: 'electronics' }, triggerId: 'd', createdAt: localIso(1) });
    const derived = failed({ metadata: { itemName: '秋季外套' }, triggerId: 'v', createdAt: localIso(2) });
    const m = buildGuardConsistencyMatrix([direct, derived]);
    const cats = m.rows.map((r) => r.category).sort();
    expect(cats).toEqual(
      [resolveGuardCategory({ category: 'electronics' }), resolveGuardCategory({ itemTitle: '秋季外套' })].sort(),
    );
    expect(cats).toEqual(['clothing', 'electronics']);
  });

  it('三轨八域回归: guard×3 + green-alt×3 + reuse×2 与各自既有 classifier 一致', () => {
    const events = [
      completed({ metadata: { category: 'beauty' }, triggerId: 'b1', createdAt: localIso(1) }),
      altAdoption('milk_tea', 2),          // green-alt food
      altAdoption('new_clothes', 3),       // green-alt apparel
      altAdoption('subscription_audit', 4),// green-alt subscription
      reuseAdoption('tool_rental', 5),
      reuseAdoption('books_media', 6),
      completed({ metadata: { itemName: '零食大礼包' }, triggerId: 's1', createdAt: localIso(7) }), // 派生 food
      completed({ metadata: { category: 'home' }, triggerId: 'h1', createdAt: localIso(8) }),
    ];
    const m = buildGuardConsistencyMatrix(events);
    const rowOf = (category: string) => m.rows.find((r) => r.category === category);

    // food 同行聚合守 1 + 代 1; 8 条事件落 7 个域 (milk_tea 与零食大礼包同归 food)
    expect(rowOf('food')?.adoptedAlt).toBe(1);
    expect(rowOf('food')?.guarded).toBe(1);
    expect(rowOf('apparel')?.adoptedAlt).toBe(1);
    expect(rowOf('subscription')?.adoptedAlt).toBe(1);
    expect(rowOf('tool_rental')?.reused).toBe(1);
    expect(rowOf('books_media')?.reused).toBe(1);
    expect(rowOf('beauty')?.guarded).toBe(1);
    expect(rowOf('home')?.guarded).toBe(1);
    expect(m.rows).toHaveLength(7);

    expect(greenAltCategoryOf('milk_tea')).toBe('food');
    expect(greenAltCategoryOf('new_clothes')).toBe('apparel');
    expect(greenAltCategoryOf('subscription_audit')).toBe('subscription');
    expect(REUSE_CATEGORIES.map((c) => c.id)).toContain('tool_rental');
  });
});

describe('红线 — 分享/公开形状零金额', () => {
  it('share 形状字段只有 category/actions/activeDays/title, 序列化不含金额语义', () => {
    const m = buildGuardConsistencyMatrix([
      completed({ metadata: { category: 'food', savedAmount: 99 }, triggerId: 'f1', createdAt: localIso(1) }),
      completed({ metadata: { category: 'food', savedAmount: 1 }, triggerId: 'f2', createdAt: localIso(2) }),
      altAdoption('milk_tea', 3, 50),
      failed({ metadata: { category: 'food' }, triggerId: 'f3', createdAt: localIso(4) }),
    ]);
    const share = buildGuardConsistencyShare(m);

    for (const row of share.rows) {
      expect(Object.keys(row).sort()).toEqual(['actions', 'activeDays', 'category', 'title']);
    }
    expect(Object.keys(share).sort()).toEqual(['activeDays', 'needsCareCategory', 'rows', 'steadiestCategory', 'totalActions']);
    const serialized = JSON.stringify(share);
    expect(serialized).not.toMatch(/estSaved|savedAmount|amount/i);
    // 放行计数也不上分享面 (荣誉框架)
    expect(serialized).not.toContain('released');
    expect(share.rows[0]).toMatchObject({ category: 'food', actions: 3, title: 'steadiest' });
    expect(share.totalActions).toBe(3);
    expect(share.activeDays).toBe(4);
  });

  it('矩阵行结构无金额字段; 金额只存在于 privateEstSavedByCategory 私享字段', () => {
    const m = buildGuardConsistencyMatrix([
      completed({ metadata: { category: 'food', savedAmount: 12.5 }, triggerId: 'f1', createdAt: localIso(1) }),
      failed({ metadata: { category: 'food', savedAmount: 88 }, triggerId: 'f2', createdAt: localIso(2) }),
      completed({ metadata: { category: 'food', savedAmount: 6 }, triggerId: 'f3', createdAt: localIso(3) }),
    ]);
    for (const row of m.rows) {
      expect(Object.keys(row).sort()).toEqual(['activeDays', 'adoptedAlt', 'category', 'guarded', 'released', 'reused', 'stability', 'status']);
    }
    // 放行不计金额: 只有 completed 的 savedAmount 进私享汇总
    expect(m.privateEstSavedByCategory).toEqual({ food: 18.5 });
  });
});

describe('文案与展示名 (AC4/AC5 数据面)', () => {
  const matrixBlock = (locale: Record<string, unknown>) =>
    ((locale.profile as Record<string, unknown>).guardMatrix ?? null) as Record<string, unknown> | null;

  it('非羞辱: profile.guardMatrix.* 不出现 失败/失控/差/fail 类词', () => {
    for (const [name, locale] of [['zh', zh], ['en', en]] as const) {
      const block = matrixBlock(locale);
      expect(block, `${name} guardMatrix block`).toBeTruthy();
      const text = JSON.stringify(block);
      for (const shaming of ['失败', '失控', '很差', '太差', '破防', '"fail']) {
        expect(text.includes(shaming), `${name} contains "${shaming}"`).toBe(false);
      }
    }
  });

  it('label 完整性: 三轨品类并集每个 id 在 zh/en 都有 profile.guardMatrix.cat.<id>', () => {
    const greenAltIds = [...new Set(GREEN_ALTERNATIVES.map((e) => greenAltCategoryOf(e.id)))].filter((c) => c !== 'other');
    const allIds = [...new Set([...GUARD_SCOPE_CATEGORIES, ...greenAltIds, ...REUSE_CATEGORIES.map((c) => c.id)])];

    // 品类名双来源: reuse 类目走 REUSE_CATEGORIES 既有 label (SSOT);
    // guard/green-alt 域走 profile.guardMatrix.cat.<id> (zh/en 双语)
    const reuseIds = new Set<string>(REUSE_CATEGORIES.map((c) => c.id));
    for (const id of allIds) {
      if (reuseIds.has(id)) {
        const rule = REUSE_CATEGORIES.find((c) => (c.id as string) === id)!;
        expect(rule.label.zh, `reuse label zh ${id}`).toBeTruthy();
        expect(rule.label.en, `reuse label en ${id}`).toBeTruthy();
        continue;
      }
      for (const [name, locale] of [['zh', zh], ['en', en]] as const) {
        const block = matrixBlock(locale)!;
        const cats = block.cat as Record<string, string> | undefined;
        expect(cats?.[id], `${name} profile.guardMatrix.cat.${id}`).toBeTruthy();
      }
    }
    // 派生出的 green-alt 域至少覆盖 6 个 (词表规模回归保护)
    expect(greenAltIds.length).toBeGreaterThanOrEqual(6);
  });
});
