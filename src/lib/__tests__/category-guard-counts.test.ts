/**
 * category-guard-counts 测试 (batch58-c)
 *
 * 覆盖: metadata.category 直通 / itemTitle 派生兜底 / 采纳轨道计数 /
 * other 桶排除 / 拦截轮次口径 (completed+failed, 不含 reward)。
 */

import { describe, expect, it } from 'vitest';
import { aggregateCategoryGuardCounts } from '../category-guard-counts';

describe('aggregateCategoryGuardCounts', () => {
  it('metadata.category 直通: food 计数只数 food 事件', () => {
    const counts = aggregateCategoryGuardCounts(
      [
        { eventType: 'challenge_completed', metadata: { category: 'food' } },
        { eventType: 'challenge_failed', metadata: { category: 'food' } },
        { eventType: 'challenge_completed', metadata: { category: 'clothing' } },
      ],
      'food',
    );
    expect(counts).toEqual({ intercepts: 2, altAdoptions: 0, reuseAdoptions: 0 });
  });

  it('itemTitle 派生兜底: "奶茶饮料" 归 food (resolveGuardCategory 同口径)', () => {
    // resolveGuardCategory 的 itemTitle 派生走 normalizeInterceptCategory 的
    // 关键词表 (饮料/零食/…); 品类直通 (metadata.category) 是主路径
    const counts = aggregateCategoryGuardCounts(
      [{ eventType: 'challenge_completed', metadata: { itemTitle: '一杯奶茶饮料' } }],
      'food',
    );
    expect(counts.intercepts).toBe(1);
  });

  it('采纳轨道: green_alt_adoption / reuse_adoption 各自计数', () => {
    const counts = aggregateCategoryGuardCounts(
      [
        { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', category: 'food' } },
        { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', category: 'food' } },
        { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', category: 'food' } },
        { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', category: 'clothing' } },
      ],
      'food',
    );
    expect(counts).toEqual({ intercepts: 0, altAdoptions: 2, reuseAdoptions: 1 });
  });

  it('challenge_reward 不是拦截轮次 (转存流水不计数)', () => {
    const counts = aggregateCategoryGuardCounts(
      [{ eventType: 'challenge_reward', metadata: { category: 'food', amount: 100 } }],
      'food',
    );
    expect(counts.intercepts).toBe(0);
  });

  it('other 桶 / 空输入 → 全零, 不抛错', () => {
    expect(aggregateCategoryGuardCounts(null, 'food')).toEqual({ intercepts: 0, altAdoptions: 0, reuseAdoptions: 0 });
    expect(aggregateCategoryGuardCounts([], 'food')).toEqual({ intercepts: 0, altAdoptions: 0, reuseAdoptions: 0 });
    expect(aggregateCategoryGuardCounts([{ eventType: 'challenge_completed', metadata: null }], 'food').intercepts).toBe(0);
  });
});
