/**
 * list-triage-detector 表驱动测试 (batch57-a)
 *
 * 覆盖验收: 命中 (换行列举 / 顿号列举 / "帮我看看这些" 引语) / 互斥让路
 * (对比 / 反驳 / 承诺 / 单对象求问) / 不误伤 (单对象消息 / 已买回顾句 /
 * 纯爱好列举)。
 */

import { describe, expect, it } from 'vitest';
import { detectListTriage } from '../list-triage-detector';

describe('detectListTriage 命中', () => {
  it.each([
    [
      '换行列举',
      '周末要买这些：\n洗衣液\n一双跑鞋\n给爸妈的礼物\n一个新键盘',
      ['洗衣液', '跑鞋', '给爸妈的礼物', '新键盘'],
    ],
    [
      '顿号列举',
      '帮我看看这些：奶茶、跑鞋、新键盘',
      ['奶茶', '跑鞋', '新键盘'],
    ],
    [
      '连接词列举',
      '要买个键盘然后还想买双跑鞋',
      ['键盘', '跑鞋'],
    ],
  ] as const)('zh %s → 抽出对象词', (_name, input, expected) => {
    const intent = detectListTriage(input);
    expect(intent).not.toBeNull();
    expect(intent!.items).toEqual(expected as unknown as string[]);
  });

  it('en 逗号 + and 列举: "check these before the weekend" 抽出对象词', () => {
    const intent = detectListTriage(
      'Help me check these before the weekend: laundry detergent, a pair of running shoes, a new keyboard',
    );
    expect(intent).not.toBeNull();
    expect(intent!.items).toEqual(['laundry detergent', 'pair of running shoes', 'keyboard']);
  });

  it('序号列举: 1. 2. 3. 前缀剥离', () => {
    const intent = detectListTriage('shopping list:\n1. milk tea\n2. running shoes\n3. keyboard');
    expect(intent).not.toBeNull();
    expect(intent!.items).toEqual(['milk tea', 'running shoes', 'keyboard']);
  });

  it('重复条目去重, 超长清单截断到 12 条', () => {
    const words = Array.from({ length: 20 }, (_, i) => `物品${i}号`);
    const intent = detectListTriage(`要买：${words.join('、')}`);
    expect(intent).not.toBeNull();
    expect(intent!.items.length).toBe(12);
    expect(new Set(intent!.items).size).toBe(12);
  });
});

describe('detectListTriage 互斥让路 (更强意图优先)', () => {
  it.each([
    ['对比句式', '买 iPad 还是安卓平板'],
    ['对比句式 or', 'buy running shoes or basketball shoes?'],
    ['反驳 pushback', '我就要买洗衣液和纸巾，别拦我'],
    ['承诺 commitment', '这个月不买奶茶和零食了'],
    ['单对象求问 prepurchase', '该不该买跑鞋'],
  ] as const)('%s → null', (_name, input) => {
    expect(detectListTriage(input)).toBeNull();
  });
});

describe('detectListTriage 不误伤', () => {
  it.each([
    ['单对象消息', '我想买个键盘'],
    ['单对象英文', 'I want to buy a keyboard'],
    ['已买完回顾句', '昨天买了洗衣液、纸巾、零食，都到了'],
    ['已下单回顾句', '已经下单了奶茶和跑鞋'],
    ['纯爱好列举 (无购物语境)', '我喜欢跑步、游泳、爬山'],
    ['空输入', ''],
  ] as const)('%s → null', (_name, input) => {
    expect(detectListTriage(input as string)).toBeNull();
  });

  it('非字符串输入恒 null', () => {
    expect(detectListTriage(null as unknown as string)).toBeNull();
    expect(detectListTriage(undefined as unknown as string)).toBeNull();
  });
});
