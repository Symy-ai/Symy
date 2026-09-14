/**
 * prepurchase-detect 测试 — 买前三问求问意图检测 (batch50-a)
 *
 * 覆盖: zh/en 命中、普通咨询不误触、反驳 (48-b) 语义互斥、空/非字符串输入。
 */

import { describe, expect, it } from 'vitest';
import { detectPrepurchaseIntent } from '../prepurchase-detect';

describe('detectPrepurchaseIntent (买前三问意图)', () => {
  it('zh 求问语义命中', () => {
    expect(detectPrepurchaseIntent('我该买这双鞋吗')).toEqual({ kind: 'should_i_buy' });
    expect(detectPrepurchaseIntent('这个直播间的东西值得买吗？')).toEqual({ kind: 'should_i_buy' });
    expect(detectPrepurchaseIntent('这个扫地机器人该不该买')).toEqual({ kind: 'should_i_buy' });
    expect(detectPrepurchaseIntent('要不要买这台switch呢')).toEqual({ kind: 'should_i_buy' });
  });

  it('en 求问语义命中 (词边界, 不误中 buyer)', () => {
    expect(detectPrepurchaseIntent('Should I buy this pair of sneakers?')).toEqual({ kind: 'should_i_buy' });
    expect(detectPrepurchaseIntent('is it worth buying?')).toEqual({ kind: 'should_i_buy' });
    expect(detectPrepurchaseIntent('HELP ME FIND A GOOD BUYER FOR MY BAG')).toBeNull();
  });

  it('普通商品咨询不命中', () => {
    expect(detectPrepurchaseIntent('帮我找个通勤包')).toBeNull();
    expect(detectPrepurchaseIntent('买什么耳机好？')).toBeNull();
    expect(detectPrepurchaseIntent('find me a cheap laptop')).toBeNull();
  });

  it('反驳语义 (48-b 冷静卡流) 互斥 — 不命中', () => {
    expect(detectPrepurchaseIntent('我就要买，别拦我')).toBeNull();
    expect(detectPrepurchaseIntent('let me buy it now')).toBeNull();
  });

  it('空 / 非字符串输入恒 null', () => {
    expect(detectPrepurchaseIntent('')).toBeNull();
    expect(detectPrepurchaseIntent('   ')).toBeNull();
    expect(detectPrepurchaseIntent(null as unknown as string)).toBeNull();
  });
});
