import { describe, expect, it } from 'vitest';

import { rankCardsByGreenLevel } from '@/lib/green-first-rank';

// 词表命中（权重见 green-rules.ts GREEN_FLAG_RULES，徽章线 60）：
// - reusable 卡: 'reusable' 单独命中 → 55 分（空 query 时 medium，线下一档）
// - organic 卡:  'organic' 单独命中 → 65 分（空 query 时已上线 → high）
// - plain 卡:    零命中 → 意图加成不给 flags，恒 unknown（query 不让普通卡凭空变绿）
const reusable = { title: 'Reusable stainless cup' };
const organic = { title: 'Organic tote bag' };
const plain = { title: 'Steel wrench set' };
const cards = [reusable, organic, plain];

// '环保' 命中 sustainable 词表（zh 子串匹配）→ GREEN_QUERY_INTENT_BONUS +10
const GREEN_QUERY = '环保材质水杯';

describe('rankCardsByGreenLevel query 意图接线', () => {
  it('guard-on + 无 query（默认参）：分档只看卡片自身文本，与既有两参调用一致', () => {
    const { ranked, hasHigh } = rankCardsByGreenLevel(cards, true);
    expect(ranked.map(({ card }) => card.title)).toEqual([
      'Organic tote bag',
      'Reusable stainless cup',
      'Steel wrench set',
    ]);
    expect(ranked[1].level).toBe('medium');
    expect(ranked[1].signal?.green_score).toBe(55);
    expect(hasHigh).toBe(true);
  });

  it('guard-on + 绿色 query：意图加成把弱信号卡推过徽章线 → 升档前移', () => {
    const { ranked, hasHigh } = rankCardsByGreenLevel(cards, true, GREEN_QUERY);
    // reusable 55 + 10 = 65 过线 → 与 organic 同为 high，同档稳定排序回到原序
    expect(ranked.map(({ card }) => card.title)).toEqual([
      'Reusable stainless cup',
      'Organic tote bag',
      'Steel wrench set',
    ]);
    expect(ranked[0].level).toBe('high');
    expect(ranked[0].signal?.green_score).toBe(65);
    expect(ranked[0].signal?.green_flags).toContain('reusable');
    expect(hasHigh).toBe(true);
  });

  it('同一卡组：绿色 query 与空 query 排序不同（接线断点的回归锚）', () => {
    const withoutQuery = rankCardsByGreenLevel(cards, true, '');
    const withQuery = rankCardsByGreenLevel(cards, true, GREEN_QUERY);
    expect(withQuery.ranked.map(({ card }) => card.title)).not.toEqual(
      withoutQuery.ranked.map(({ card }) => card.title),
    );
    // 加成只抬已有绿色信号的卡：plain 无 flags → 分数加成也不改 unknown 档
    const plainEntry = withQuery.ranked.find(({ card }) => card.title === 'Steel wrench set');
    expect(plainEntry?.level).toBe('unknown');
    expect(plainEntry?.signal?.green_flags).toEqual([]);
  });

  it('guard-off + 绿色 query：整体静默 — 不重排、signal 全 undefined、全 unknown、hasHigh=false', () => {
    const { ranked, hasHigh } = rankCardsByGreenLevel(cards, false, GREEN_QUERY);
    expect(ranked.map(({ card }) => card.title)).toEqual(cards.map(({ title }) => title));
    expect(
      ranked.every(({ signal, level }) => signal === undefined && level === 'unknown'),
    ).toBe(true);
    expect(hasHigh).toBe(false);
  });
});
