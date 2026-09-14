import { describe, expect, it } from 'vitest';

import { sortByGreenLevel } from '@/lib/green-sort';
import type { GreenLevel } from '@/lib/green-level';

const item = (id: string, level: GreenLevel) => ({ id, level });

describe('sortByGreenLevel 稳定排序', () => {
  it('high 全部排在 medium 前，medium 全部排在 unknown 前', () => {
    const input = [
      item('u1', 'unknown'),
      item('h1', 'high'),
      item('m1', 'medium'),
      item('h2', 'high'),
    ];
    const ordered = sortByGreenLevel(input, (entry) => entry.level);
    expect(ordered.map(({ id }) => id)).toEqual(['h1', 'h2', 'm1', 'u1']);
  });

  it('同档保持原序 — 交错输入下各组内部顺序不变', () => {
    const input = [
      item('u1', 'unknown'),
      item('u2', 'unknown'),
      item('m1', 'medium'),
      item('u3', 'unknown'),
      item('h1', 'high'),
      item('m2', 'medium'),
      item('h2', 'high'),
      item('u4', 'unknown'),
    ];
    const ordered = sortByGreenLevel(input, (entry) => entry.level);
    expect(ordered.map(({ id }) => id)).toEqual(['h1', 'h2', 'm1', 'm2', 'u1', 'u2', 'u3', 'u4']);
  });

  it('全部同档 → 完全等于原序', () => {
    const input = [item('c', 'unknown'), item('a', 'unknown'), item('b', 'unknown')];
    expect(sortByGreenLevel(input, (entry) => entry.level).map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  it('不修改入参数组（渲染前的纯排序）', () => {
    const input = [item('u1', 'unknown'), item('h1', 'high')];
    const snapshot = [...input];
    sortByGreenLevel(input, (entry) => entry.level);
    expect(input).toEqual(snapshot);
  });

  it('空数组与单元素安全', () => {
    expect(sortByGreenLevel([], (entry: { level: GreenLevel }) => entry.level)).toEqual([]);
    const single = [item('h1', 'high')];
    expect(sortByGreenLevel(single, (entry) => entry.level)).toHaveLength(1);
  });
});
