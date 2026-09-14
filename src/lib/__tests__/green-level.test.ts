import { describe, expect, it } from 'vitest';

import { classifyGreenLevel, GREEN_LEVEL_RANK } from '@/lib/green-level';
import { evaluateGreenSignal, GREEN_SCORE_BADGE_THRESHOLD } from '@/lib/green-rules';

const levelOfTitle = (title: string): ReturnType<typeof classifyGreenLevel> =>
  classifyGreenLevel(evaluateGreenSignal('', [{ title }])[0]);

describe('classifyGreenLevel 词表命中 → high', () => {
  it('zh 绿色信号：有机/竹/再生/环保/低碳/二手', () => {
    for (const title of [
      '有机棉毛巾',
      '竹制牙刷（软毛）',
      '再生塑料收纳盒',
      '环保洗衣液',
      '低碳节能空调',
      '九成新二手背包',
    ]) {
      expect(levelOfTitle(title), title).toBe('high');
    }
  });

  it('en 绿色信号：organic/bamboo/recycled/certified sustainable', () => {
    for (const title of [
      'Organic cotton tote bag',
      'Bamboo cutting board',
      'Recycled paper notebook',
      'Certified sustainable coffee beans',
    ]) {
      expect(levelOfTitle(title), title).toBe('high');
    }
  });

  it('再生塑料同时命中非绿词表（plastic）也不影响档位 — 非绿信号不参与分档', () => {
    const [signal] = evaluateGreenSignal('', [{ title: '再生塑料收纳盒' }]);
    expect(signal.green_flags).toContain('recycled_material');
    expect(signal.non_green_flag).toBe(true);
    expect(classifyGreenLevel(signal)).toBe('high');
  });

  it('high 边界：green_score 恰好等于徽章线', () => {
    const [signal] = evaluateGreenSignal('', [{ title: '竹制牙刷' }]);
    expect(signal.green_score).toBe(GREEN_SCORE_BADGE_THRESHOLD);
    expect(classifyGreenLevel(signal)).toBe('high');
  });
});

describe('classifyGreenLevel 弱信号 → medium', () => {
  it('zh 弱信号：耐用/替换装（单独命中不过徽章线）', () => {
    for (const title of ['耐用雨伞', '替换装洗手液']) {
      expect(levelOfTitle(title), title).toBe('medium');
    }
  });

  it('en 弱信号：durable/refillable', () => {
    for (const title of ['Durable steel water bottle', 'Refillable ink pen']) {
      expect(levelOfTitle(title), title).toBe('medium');
    }
  });
});

describe('classifyGreenLevel 词表不命中 → unknown', () => {
  it('普通商品 zh+en 不命中', () => {
    for (const title of ['不锈钢扳手套装', 'Steel wrench set', 'Guizhou sauce liquor 500ml']) {
      expect(levelOfTitle(title), title).toBe('unknown');
    }
  });

  it('非绿信号（一次性/塑料）不是绿色信号 — 不打负向标，档位仍是 unknown', () => {
    const [signal] = evaluateGreenSignal('', [{ title: '一次性塑料杯 50 只装' }]);
    expect(signal.non_green_flag).toBe(true);
    expect(signal.green_flags).toEqual([]);
    expect(classifyGreenLevel(signal)).toBe('unknown');
  });

  it('否定短语剔除后不误判：plastic-free 湿巾无绿色信号 → unknown', () => {
    expect(levelOfTitle('plastic-free wet wipes, bpa-free')).toBe('unknown');
  });

  it('signal 缺省（绿色守护关闭时）→ unknown', () => {
    expect(classifyGreenLevel(undefined)).toBe('unknown');
  });

  it('查询意图加成不制造 medium — 绿色 query 不让无信号卡变成"有绿色信号"', () => {
    const [signal] = evaluateGreenSignal('环保水杯', [{ title: 'Steel wrench set' }]);
    expect(signal.green_score).toBeGreaterThan(0);
    expect(signal.green_flags).toEqual([]);
    expect(classifyGreenLevel(signal)).toBe('unknown');
  });
});

describe('GREEN_LEVEL_RANK 档位权重', () => {
  it('high < medium < unknown（值小者靠前）', () => {
    expect(GREEN_LEVEL_RANK.high).toBeLessThan(GREEN_LEVEL_RANK.medium);
    expect(GREEN_LEVEL_RANK.medium).toBeLessThan(GREEN_LEVEL_RANK.unknown);
  });
});
