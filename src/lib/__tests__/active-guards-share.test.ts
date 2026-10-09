import { describe, expect, it } from 'vitest';

import { buildActiveGuardsShareData, type ActiveGuardsShareData } from '../active-guards-share';

const summary = (challenges: Array<{ category: string }>, commitments: Array<{ category: string }>, extra: Record<string, unknown> = {}) =>
  ({
    totalCount: challenges.length + commitments.length,
    persistDays: 9,
    challenges,
    commitments,
    guardedAmount: 1234.56, // 里子字段 — 应被丢弃
    assistSaved: 789,
    ...extra,
  }) as never;

/**
 * active-guards-share.ts (27行) — 分享面数据投影 (batch59-a)。
 *
 * 面子/里子铁律锚 (owner 09-06):
 * - 分享面只收件数/天数/类别名 — 类型级无金额字段
 * - guardedAmount/assistSaved 入口即丢弃 (红线)
 * - 类别去重 (Set)
 */
describe('buildActiveGuardsShareData', () => {
  it('三面子字段投影; 金额字段被丢 (红线)', () => {
    const out = buildActiveGuardsShareData(
      summary(
        [{ category: 'electronics' }, { category: 'home' }],
        [{ category: 'electronics' }], // 重复类别
      ),
    );
    expect(out.totalCount).toBe(3);
    expect(out.persistDays).toBe(9);
    expect(out.categoryNames.sort()).toEqual(['electronics', 'home']); // Set 去重
    // 红线: 输出无任何金额痕迹
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('1234');
    expect(flat).not.toContain('789');
  });

  it('空 summary → 零件数+空类别', () => {
    const out = buildActiveGuardsShareData(summary([], []));
    expect(out.totalCount).toBe(0);
    expect(out.categoryNames).toEqual([]);
  });

  it('类型级锚: ActiveGuardsShareData 三键无金额 (编译期保证)', () => {
    const probe: ActiveGuardsShareData = { totalCount: 1, persistDays: 2, categoryNames: ['food'] };
    expect(Object.keys(probe).sort()).toEqual(['categoryNames', 'persistDays', 'totalCount']);
  });
});
