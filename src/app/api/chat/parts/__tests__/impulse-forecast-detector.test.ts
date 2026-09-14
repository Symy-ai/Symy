/**
 * impulse-forecast-detector 测试 (batch62-c)
 *
 * 覆盖验收:
 * 1. 正例: "下周容易冲动吗 / 这几天什么时候危险 / next week risk" 命中
 * 2. 负例: 天气/日程/健康/心理压力讨论不误触发; 回顾型统计问句让回 57-c/58-c;
 *    帮别人问让路; 购物意图让路; 无前瞻词/无风险词不命中
 * 3. 单日追问: "那周六呢 / what about Sunday" 命中聚焦日; 品类/时段/时间窗
 *    追问让回 59-c; 完整问句不命中
 * 4. 星期归一 Monday=0 (zh 周/星期/礼拜 + en 缩写/全称)
 * 5. source-order 锁: 预报块在 58-c 时段问句之后、57-c 问账之前 (不抢路由)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  detectForecastQuery,
  detectForecastDayFollowUp,
  resolveForecastDayFromText,
} from '../impulse-forecast-detector';

describe('detectForecastQuery — 正例', () => {
  const positives: ReadonlyArray<[string, string]> = [
    ['zh 下周+容易+冲动', '下周容易冲动吗'],
    ['zh 这几天+危险', '这几天什么时候危险'],
    ['zh 下周+乱买', '我下周会不会乱买东西'],
    ['zh 未来七天+风险', '未来七天我的消费风险怎么样'],
    ['zh 接下来一周+管不住', '接下来一周我怕管不住自己买东西'],
    ['en next week risk', 'next week risk'],
    ['en tempted', 'will I be tempted next week?'],
    ['en coming days impulse', 'are the coming days risky for impulse spending'],
  ];
  it.each(positives)('%s', (_name, text) => {
    expect(detectForecastQuery(text)).toBe(true);
  });
});

describe('detectForecastQuery — 负例 (不误触发/让路)', () => {
  const negatives: ReadonlyArray<[string, string]> = [
    ['天气', '下周容易下雨吗'],
    ['天气 en', 'is next week going to be rainy'],
    ['日程', '下周日程满吗'],
    ['日程 en', 'next week schedule looks crazy'],
    ['健康', '下周容易感冒吗'],
    ['心理压力讨论 (无消费触发)', '我压力很大，下周会不会更糟'],
    ['压力+冲动但无前瞻词 (58-c/普通聊天地盘)', '压力大就容易冲动消费吗'],
    ['回顾统计 → 57-c/58-c', '这几天冲动买了几次'],
    ['回顾统计 en', 'how many times did I impulse buy this week'],
    ['问账 → 57-c', '这个月省了多少'],
    ['购物意图 → 让路', '下周想买个包，你说要不要买'],
    ['帮别人问', '我朋友下周容易冲动买吗'],
    ['只有前瞻词无风险词', '下周有什么安排'],
    ['只有风险词无前瞻词', '我最近容易冲动'],
  ];
  it.each(negatives)('%s 不触发', (_name, text) => {
    expect(detectForecastQuery(text)).toBe(false);
  });
});

describe('detectForecastDayFollowUp — 单轮追问', () => {
  const positives: ReadonlyArray<[string, number]> = [
    ['那周六呢', 5],
    ['那周日呢', 6],
    ['周六呢', 5],
    ['what about Sunday', 6],
    ['what about saturday?', 5],
    ['how about monday', 0],
    ['那礼拜五呢', 4],
    ['那星期三呢', 2],
    ['saturday', 5],
  ];
  it.each(positives)('%s → day %i', (text, day) => {
    expect(detectForecastDayFollowUp(text)).toBe(day);
  });

  const negatives: ReadonlyArray<[string, string]> = [
    ['品类追问 → 59-c', '那奶茶呢'],
    ['时段追问 → 59-c', '那晚上呢'],
    ['时间窗追问 → 59-c', '那上个月呢'],
    ['完整购物意图', '周六想买个包'],
    ['回顾统计', '周六买了几次'],
    ['帮别人问', '我朋友周六呢'],
    ['超长携带别的语义 (>30 让路)', '那周六呢，我们不是说好了要一起去爬山再吃饭再逛街再看看电影什么的'],
  ];
  it.each(negatives)('%s 不命中', (_name, text) => {
    expect(detectForecastDayFollowUp(text)).toBeNull();
  });
});

describe('resolveForecastDayFromText — Monday=0 归一', () => {
  it('zh 周/星期/礼拜 全覆盖且序号正确', () => {
    expect(resolveForecastDayFromText('周一')).toBe(0);
    expect(resolveForecastDayFromText('星期二')).toBe(1);
    expect(resolveForecastDayFromText('礼拜三')).toBe(2);
    expect(resolveForecastDayFromText('周四')).toBe(3);
    expect(resolveForecastDayFromText('星期五')).toBe(4);
    expect(resolveForecastDayFromText('周六')).toBe(5);
    expect(resolveForecastDayFromText('周日')).toBe(6);
    expect(resolveForecastDayFromText('周天')).toBe(6);
  });

  it('en 缩写与全称; 无星期词返回 null', () => {
    expect(resolveForecastDayFromText('monday')).toBe(0);
    expect(resolveForecastDayFromText('tues')).toBe(1);
    expect(resolveForecastDayFromText('wed')).toBe(2);
    expect(resolveForecastDayFromText('thursday')).toBe(3);
    expect(resolveForecastDayFromText('fri')).toBe(4);
    expect(resolveForecastDayFromText('sat')).toBe(5);
    expect(resolveForecastDayFromText('sunday')).toBe(6);
    expect(resolveForecastDayFromText('someday')).toBeNull();
    expect(resolveForecastDayFromText('next week')).toBeNull();
  });
});

describe('source-order 锁 — 预报块不抢既有路由', () => {
  const routeSource = readFileSync(new URL('../../route.ts', import.meta.url), 'utf8');

  it('预报块在 58-c 时段问句之后、57-c 问账之前、60-c 情绪守护之前', () => {
    const impulseTime = routeSource.indexOf("import('./parts/impulse-time-query-detector')");
    const forecast = routeSource.indexOf("import('./parts/impulse-forecast-detector')");
    const savings = routeSource.indexOf("import('./parts/savings-query-detector')");
    const emotion = routeSource.indexOf("import('./parts/emotion-guard-turn')");
    expect(impulseTime).toBeGreaterThan(-1);
    expect(forecast).toBeGreaterThan(impulseTime);
    expect(savings).toBeGreaterThan(forecast);
    expect(emotion).toBeGreaterThan(savings);
  });

  it('单日追问只在预报卡上文 (kind=forecast) 时启用', () => {
    expect(routeSource).toContain("dataQueryContext?.kind === 'forecast'");
  });
});
