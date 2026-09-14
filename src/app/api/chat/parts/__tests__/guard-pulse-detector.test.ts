/**
 * guard-pulse-detector 测试 (batch68-c)
 *
 * 覆盖验收:
 * 1. 正例: "我什么时候最容易冲动 / my weakest shopping hour" 等 zh/en 问句命中
 * 2. 负例: 普通/求建议/帮别人问/生活话题不误触发; 前瞻词让回 62-c 预报;
 *    四桶时段词让回 58-c 时段问句; 品类词让回 58-c 分类问句; 回顾统计让回 57-c
 * 3. source-order 锁: 脉搏块在 62-c 预报之后、57-c 问账之前 (不抢路由)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectGuardPulseQuery } from '../guard-pulse-detector';

describe('detectGuardPulseQuery — 正例', () => {
  const positives: ReadonlyArray<[string, string]> = [
    ['zh 什么时候+冲动', '我什么时候最容易冲动'],
    ['zh 几点+破防', '我几点最容易破防'],
    ['zh 哪个时段+剁手', '哪个时段我最容易剁手'],
    ['zh 哪个钟点+管不住', '我哪个钟点最管不住自己乱买'],
    ['zh 购物高峰', '我的购物高峰时段是什么时候'],
    ['zh 下单高峰', '我一天里什么时候下单最多'],
    ['en weakest shopping hour', 'my weakest shopping hour'],
    ['en what time + impulse', 'what time of day am i most impulsive'],
    ['en when am i + tempted', 'when am i most tempted to overspend'],
    ['en peak shopping hour', "what's my peak shopping hour"],
  ];
  it.each(positives)('%s', (_name, text) => {
    expect(detectGuardPulseQuery(text)).toBe(true);
  });
});

describe('detectGuardPulseQuery — 负例 (不误触发/让路)', () => {
  const negatives: ReadonlyArray<[string, string]> = [
    ['求建议 "什么时候买" → 购物意图让路', '这个东西什么时候买最划算'],
    ['求建议 en', 'when should i buy this'],
    ['该不该买让路', '我什么时候该不该买这个呢'],
    ['对比让路', 'a 还是 b 什么时候下手好'],
    ['回顾统计 → 57-c/58-c', '我什么时候冲动买了几次'],
    ['回顾统计 en', 'how many times did i impulse buy and when'],
    ['前瞻词 → 62-c 预报', '下周我什么时候最容易冲动'],
    ['前瞻词 (这几天) → 62-c 预报', '这几天什么时候最容易冲动'],
    ['四桶时段词 → 58-c 时段问句', '我晚上冲动买的多吗'],
    ['四桶时段词 (凌晨) → 58-c', '我是不是凌晨最容易冲动'],
    ['品类词 → 58-c 分类问句', '奶茶我一般什么时候最容易破防'],
    ['帮别人问', '我朋友什么时候最容易冲动'],
    ['生活话题 (通勤高峰)', '打车高峰期是什么时候'],
    ['生活话题 (账单)', '电费什么时候是高峰'],
    ['天气', '什么时候会下雨'],
    ['无消费语境', '会议什么时候开比较合适'],
    ['只有风险词无小时词', '我最近容易冲动'],
  ];
  it.each(negatives)('%s 不触发', (_name, text) => {
    expect(detectGuardPulseQuery(text)).toBe(false);
  });
});

describe('source-order 锁 — 脉搏块不抢既有路由', () => {
  const routeSource = readFileSync(new URL('../../route.ts', import.meta.url), 'utf8');

  it('脉搏块在 62-c 预报之后、57-c 问账之前、60-c 情绪守护之前', () => {
    const forecast = routeSource.indexOf("import('./parts/impulse-forecast-detector')");
    const guardPulse = routeSource.indexOf("import('./parts/guard-pulse-detector')");
    const savings = routeSource.indexOf("import('./parts/savings-query-detector')");
    const emotion = routeSource.indexOf("import('./parts/emotion-guard-turn')");
    expect(forecast).toBeGreaterThan(-1);
    expect(guardPulse).toBeGreaterThan(forecast);
    expect(savings).toBeGreaterThan(guardPulse);
    expect(emotion).toBeGreaterThan(savings);
  });
});
