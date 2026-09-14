/**
 * green_level 稳定排序 — 装饰-排序-还原（纯函数，不修改入参）
 *
 * high 在前、medium 次之、unknown殿后；同档内严格保持原有顺序
 * （价格/相关度序）。用入序 index 做破平手键，不依赖引擎的 sort 稳定性。
 */

import { GREEN_LEVEL_RANK, type GreenLevel } from './green-level';

export function sortByGreenLevel<T>(
  items: readonly T[],
  levelOf: (item: T) => GreenLevel,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        GREEN_LEVEL_RANK[levelOf(a.item)] - GREEN_LEVEL_RANK[levelOf(b.item)] ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}
