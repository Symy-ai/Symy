/**
 * BP p19 防漂绿三原则守卫 ①分数确定性 — green 评分链路纯度契约
 *
 * 承诺：绿色评分走规则化打分，可复算可审计；LLM 只做离线属性预富集，
 * 永不参与评分。实现 = green-rules(词表评估) → green-level(三档) →
 * green-sort(稳定排序) → green-first-rank(组合管道)，全链纯函数。
 *
 * 两道闸：
 *   1. 行为闸：同一输入重复调用结果逐字节相等（无随机/无时间/无外部态）；
 *      深冻结入参照常工作（评分不改入参）；分数域恒为 0-100 整数（无 NaN）。
 *   2. 源码闸（静态固化）：评分链四文件的 import 只许指向域内 './green-*' —
 *      LLM/网络/存储/时钟模块进不了评分链；剥注释后 grep 禁用
 *      随机/时间/IO/异步 token（剥注释防"不依赖 Date.now"类说明误报）。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  evaluateGreenSignal,
  queryHasGreenIntent,
  type GreenSignalCardInput,
} from '@/lib/green-rules';
import { rankCardsByGreenLevel } from '@/lib/green-first-rank';

/** 混合语料：绿色 zh/en / 非绿品类 / 否定短语 / 整词边界陷阱 / 未认证中性卡 */
const CORPUS: GreenSignalCardInput[] = [
  { title: 'Organic Cotton Bath Towel', category: 'home' },
  { title: '竹制牙刷（软毛）', subcategory: '个护' },
  { title: '九成新二手背包', category: '箱包' },
  { title: '一次性塑料杯 50 只装' },
  { title: 'Plastic-free lunch box, biodegradable' },
  { title: '仿皮草时尚围巾' },
  { title: 'Oak furniture dining table' },
  { title: 'GT-2000 跑鞋 42 码' },
  { title: 'FSC certified recycled bamboo shelf, durable' },
];
const QUERY = '环保 sustainable bag';

const SCORING_CHAIN_FILES = [
  'src/lib/green-rules.ts',
  'src/lib/green-level.ts',
  'src/lib/green-sort.ts',
  'src/lib/green-first-rank.ts',
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** 剥掉块注释与行注释，源码 token 断言只看代码体（说明性注释不得误报） */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('BP p19 原则① 行为闸：重复调用逐字节相等', () => {
  it('evaluateGreenSignal 同一输入两次调用结果逐字节相等', () => {
    const first = evaluateGreenSignal(QUERY, CORPUS);
    const second = evaluateGreenSignal(QUERY, [...CORPUS]);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('全链路 rankCardsByGreenLevel 两次调用逐字节相等', () => {
    const first = rankCardsByGreenLevel(CORPUS, true, QUERY);
    const second = rankCardsByGreenLevel([...CORPUS], true, QUERY);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('深冻结入参照常评估且结果一致 — 评分不修改入参（纯函数）', () => {
    const baseline = evaluateGreenSignal(QUERY, CORPUS);
    const frozen = evaluateGreenSignal(QUERY, deepFreeze(CORPUS));
    expect(JSON.stringify(frozen)).toBe(JSON.stringify(baseline));
  });

  it('分数域恒为 0-100 整数（可复算的规则分，无 NaN/小数漂移）', () => {
    for (const signal of evaluateGreenSignal(QUERY, CORPUS)) {
      expect(Number.isInteger(signal.green_score)).toBe(true);
      expect(signal.green_score).toBeGreaterThanOrEqual(0);
      expect(signal.green_score).toBeLessThanOrEqual(100);
    }
  });

  it('queryHasGreenIntent 同查询两次调用一致', () => {
    expect(queryHasGreenIntent(QUERY)).toBe(true);
    expect(queryHasGreenIntent(QUERY)).toBe(queryHasGreenIntent(QUERY));
  });
});

describe('BP p19 原则① 源码闸：评分链静态纯度固化', () => {
  const sources = new Map(
    SCORING_CHAIN_FILES.map((file) => [file, stripComments(readFileSync(join(process.cwd(), file), 'utf8'))]),
  );

  it('评分链 import 闭包：只许指向域内 ./green-*（LLM/网络/存储进不了评分链）', () => {
    const specifiers: string[] = [];
    const patterns = [
      /from\s+'([^']+)'/g,
      /(?:^|\n)\s*import\s+'([^']+)'/g,
      /import\(\s*'([^']+)'/g,
      /require\(\s*'([^']+)'/g,
    ];
    for (const source of sources.values()) {
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
      }
    }
    for (const spec of specifiers) {
      expect(spec.startsWith('./green-'), `评分链出现域外 import: '${spec}'`).toBe(true);
    }
  });

  it('评分链代码体禁用随机/时间/IO/异步 token（无 LLM/无网络/无时钟依赖）', () => {
    const IMPURE_TOKENS =
      /Math\.random|Date\.now|new Date\(|performance\.now|process\.env|\bfetch\(|\bawait\b|\basync\b|\bcrypto\b|localStorage|sessionStorage|XMLHttpRequest|WebSocket/;
    for (const [file, source] of sources) {
      const hit = IMPURE_TOKENS.exec(source);
      expect(hit, `${file} 出现非确定性/IO token: ${hit?.[0]}`).toBeNull();
    }
  });
});
