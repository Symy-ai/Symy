/**
 * commitment-detector 单测 (batch53-a)
 *
 * 验收: 正例 (这个月不买咖啡 / 先忍 30 天不买游戏 / 我不买鞋了 / en 同款),
 * 负例 (疑问句 / 转述 / 求问 / 反驳 / 空输入), 纯函数恒不抛异常。
 */
import { describe, expect, it } from 'vitest';
import { detectCommitment } from '@/lib/commitment-detector';

describe('detectCommitment 正例', () => {
  it('这个月不买咖啡 — 默认档到月底, 提取品类原词', () => {
    expect(detectCommitment('这个月不买咖啡')).toEqual({
      subject: '咖啡',
      durationKind: 'month_end',
      days: null,
    });
  });

  it('先忍 30 天不买游戏 — 显式时长', () => {
    expect(detectCommitment('先忍 30 天不买游戏')).toEqual({
      subject: '游戏',
      durationKind: 'fixed',
      days: 30,
    });
  });

  it('坚持14天不买奶茶 (无空格) — 显式时长', () => {
    expect(detectCommitment('坚持14天不买奶茶')).toEqual({
      subject: '奶茶',
      durationKind: 'fixed',
      days: 14,
    });
  });

  it('我不买鞋了 — 未写时长走默认档', () => {
    expect(detectCommitment('我不买鞋了')).toEqual({
      subject: '鞋',
      durationKind: 'month_end',
      days: null,
    });
  });

  it('双十一前不囤护肤品 — 不囤同款语义, 默认档到月底', () => {
    expect(detectCommitment('双十一前不囤护肤品')).toEqual({
      subject: '护肤品',
      durationKind: 'month_end',
      days: null,
    });
  });

  it('en: no more coffee this month — 默认档到月底', () => {
    expect(detectCommitment('No more coffee this month!')).toEqual({
      subject: 'coffee',
      durationKind: 'month_end',
      days: null,
    });
  });

  it('en: not buying games for 30 days — 显式时长', () => {
    expect(detectCommitment("I'm not buying games for 30 days")).toEqual({
      subject: 'games',
      durationKind: 'fixed',
      days: 30,
    });
  });
});

describe('detectCommitment 负例', () => {
  it('疑问句: 能不买咖啡吗 — 求问不是承诺', () => {
    expect(detectCommitment('我这个月能不买咖啡吗')).toBeNull();
  });

  it('疑问句: 这个月不买咖啡可行吗', () => {
    expect(detectCommitment('这个月不买咖啡可行吗？')).toBeNull();
  });

  it('疑问句 en: no more coffee?', () => {
    expect(detectCommitment('no more coffee?')).toBeNull();
  });

  it('转述: 他说他这个月不买咖啡了', () => {
    expect(detectCommitment('他说他这个月不买咖啡了')).toBeNull();
  });

  it('转述 en: my friend said no more coffee', () => {
    expect(detectCommitment('my friend said no more coffee this month')).toBeNull();
  });

  it('求问 (50-a 流): 该买这双鞋吗 — 互斥不命中', () => {
    expect(detectCommitment('该买这双鞋吗')).toBeNull();
  });

  it('反驳 (48-b 流): 我就要买 — 互斥不命中', () => {
    expect(detectCommitment('我就要买这双鞋')).toBeNull();
  });

  it('普通咨询: 帮我找个包 — 不命中', () => {
    expect(detectCommitment('帮我找个包')).toBeNull();
  });

  it('空输入/非字符串恒 null 且不抛异常', () => {
    expect(detectCommitment('')).toBeNull();
    expect(detectCommitment('   ')).toBeNull();
    expect(detectCommitment(undefined as unknown as string)).toBeNull();
    expect(detectCommitment(null as unknown as string)).toBeNull();
  });
});
