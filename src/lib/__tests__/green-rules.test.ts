import { describe, expect, it } from 'vitest';

import {
  evaluateGreenSignal,
  GREEN_FLAG_RULES,
  GREEN_QUERY_INTENT_BONUS,
  GREEN_SCORE_BADGE_THRESHOLD,
  NON_GREEN_NEGATION_PHRASES,
  NON_GREEN_RULES,
} from '@/lib/green-rules';
import type { GreenSignalCardInput } from '@/lib/green-rules';

const card = (overrides: Partial<GreenSignalCardInput> = {}): GreenSignalCardInput => ({
  title: 'Plain product',
  ...overrides,
});

describe('evaluateGreenSignal 词表命中', () => {
  it('en 关键词命中：organic cotton 单卡可过徽章线', () => {
    const [signal] = evaluateGreenSignal('towel', [
      card({ title: 'Organic Cotton Bath Towel' }),
    ]);
    expect(signal.green_flags).toEqual(
      expect.arrayContaining(['organic_material', 'natural_material']),
    );
    expect(signal.green_score).toBeGreaterThanOrEqual(GREEN_SCORE_BADGE_THRESHOLD);
    expect(signal.non_green_flag).toBe(false);
  });

  it('zh 关键词命中：竹制/有机/二手 均可识别', () => {
    const [bamboo, secondhand] = evaluateGreenSignal('', [
      card({ title: '竹制牙刷（软毛）' }),
      card({ title: '九成新二手背包', category: '箱包' }),
    ]);
    expect(bamboo.green_flags).toContain('natural_material');
    expect(secondhand.green_flags).toContain('secondhand');
    expect(secondhand.green_score).toBeGreaterThanOrEqual(GREEN_SCORE_BADGE_THRESHOLD);
  });

  it('多 flag 累加封顶 100，且结果与入参顺序一一对应', () => {
    const signals = evaluateGreenSignal('', [
      card({ title: 'FSC certified recycled bamboo shelf, durable' }),
      card({ title: '可持续再生棉 T 恤，可生物降解' }),
    ]);
    for (const signal of signals) {
      expect(signal.green_score).toBeLessThanOrEqual(100);
      expect(signal.green_score).toBeGreaterThan(0);
    }
    expect(signals[0].green_flags).toEqual(
      expect.arrayContaining(['certified', 'recycled_material', 'natural_material']),
    );
  });

  it('category/subcategory 也参与匹配', () => {
    const [signal] = evaluateGreenSignal('', [
      card({ title: '便携水杯', category: 'kitchen', subcategory: 'reusable bottles' }),
    ]);
    expect(signal.green_flags).toContain('reusable');
  });
});

describe('evaluateGreenSignal 非绿品类', () => {
  it('一次性/塑料/象牙/皮草 命中 non_green_flag', () => {
    const signals = evaluateGreenSignal('', [
      card({ title: '一次性塑料杯 50 只装' }),
      card({ title: 'Ivory carving ornament' }),
      card({ title: '仿皮草时尚围巾' }),
    ]);
    expect(signals[0].non_green_flag).toBe(true);
    expect(signals[1].non_green_flag).toBe(true);
    // 仿皮草是否定短语，不得误标
    expect(signals[2].non_green_flag).toBe(false);
  });

  it('ASCII 整词边界：furniture 不触发 fur，different 不触发 rent/rental', () => {
    const signals = evaluateGreenSignal('', [
      card({ title: 'Oak furniture dining table' }),
      card({ title: 'A different kind of lamp' }),
    ]);
    expect(signals[0].non_green_flag).toBe(false);
    expect(signals[0].green_flags).toEqual([]);
    expect(signals[1].green_flags).toEqual([]);
  });

  it('plastic-free 等否定短语不触发 non_green_flag', () => {
    expect(NON_GREEN_NEGATION_PHRASES).toContain('plastic-free');
    const [signal] = evaluateGreenSignal('', [
      card({ title: 'Plastic-free lunch box, biodegradable' }),
    ]);
    expect(signal.non_green_flag).toBe(false);
    expect(signal.green_flags).toContain('biodegradable');
  });
});

describe('evaluateGreenSignal 边界', () => {
  it('空卡列表返回空数组', () => {
    expect(evaluateGreenSignal('organic', [])).toEqual([]);
  });

  it('无关键词卡得 0 分、空标签、非绿为 false', () => {
    const [signal] = evaluateGreenSignal('', [card({ title: 'GT-2000 跑鞋 42 码' })]);
    expect(signal).toEqual({ green_score: 0, green_flags: [], non_green_flag: false });
  });

  it('空查询不给意图加成；绿色查询给每卡加成', () => {
    const plain = card({ title: '竹制收纳盒' }); // 仅 natural_material(60)
    const withoutQuery = evaluateGreenSignal('', [plain]);
    const withQuery = evaluateGreenSignal('环保 sustainable bag', [plain]);
    expect(withoutQuery[0].green_score).toBe(60);
    expect(withQuery[0].green_score).toBe(60 + GREEN_QUERY_INTENT_BONUS);

    // 非绿查询不加成
    const neutralQuery = evaluateGreenSignal('cheap laptop', [plain]);
    expect(neutralQuery[0].green_score).toBe(60);
  });

  it('查询命中非绿词不给卡打非绿标（卡只看自己）', () => {
    const [signal] = evaluateGreenSignal('一次性杯子替代', [
      card({ title: '玻璃水杯' }),
    ]);
    expect(signal.non_green_flag).toBe(false);
  });

  it('词表导出可测：en+zh 双语均有覆盖，权重单调', () => {
    for (const rule of GREEN_FLAG_RULES) {
      expect(rule.weight).toBeGreaterThan(0);
      expect(rule.weight).toBeLessThanOrEqual(100);
      expect(rule.keywords.length).toBeGreaterThan(0);
      expect(rule.keywords.some((k) => /[a-z]/i.test(k))).toBe(true);
      expect(rule.keywords.some((k) => /[\u4e00-\u9fff]/.test(k))).toBe(true);
    }
    for (const rule of NON_GREEN_RULES) {
      expect(rule.keywords.length).toBeGreaterThan(0);
    }
  });
});
