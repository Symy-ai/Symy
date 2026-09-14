import { describe, it, expect } from 'vitest';
import { detectAltFootprintQuery } from '../alt-footprint-intent';

describe('detectAltFootprintQuery', () => {
  it('zh 召回问法命中', () => {
    expect(detectAltFootprintQuery('我做过哪些绿色替代？')).toBe(true);
    expect(detectAltFootprintQuery('看看我的替代足迹')).toBe(true);
    expect(detectAltFootprintQuery('我采纳过哪些替代呀')).toBe(true);
    expect(detectAltFootprintQuery('帮我查一下绿色替代记录')).toBe(true);
  });

  it('en 召回问法命中', () => {
    expect(detectAltFootprintQuery('What green swaps I made so far?')).toBe(true);
    expect(detectAltFootprintQuery('show me my alternative footprint')).toBe(true);
    expect(detectAltFootprintQuery('what are the green alternatives i took?')).toBe(true);
    expect(detectAltFootprintQuery('my green swaps over time')).toBe(true);
    expect(detectAltFootprintQuery('list my alt adoptions')).toBe(true);
  });

  it('购买/知识问法不误伤', () => {
    expect(detectAltFootprintQuery('我想买个貂皮围巾')).toBe(false);
    expect(detectAltFootprintQuery('二手家具值得买吗')).toBe(false);
    expect(detectAltFootprintQuery('refurb 值得买吗')).toBe(false);
    expect(detectAltFootprintQuery('')).toBe(false);
  });
});
