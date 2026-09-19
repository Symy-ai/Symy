/**
 * inventory-client — 物品清单前端数据层 (batch84-a, BP p12 数据飞轮第②环)
 *
 * batch81-c 只有写侧 (对话「家里有」落库); 这里补读侧与查看面数据造型。
 * 表未建 (migration 142 未执行期) API 已降级回 200 { items: [], inventoryEnabled: false };
 * 网络/500 等其他失败同样降级为不可用 — 查看页永不炸。
 * DELETE 供卡片乐观删除用: 失败抛 ApiError, 由 useMutation onError 回滚。
 */

import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import type { InventoryItemRow } from '@/lib/inventory';

export interface InventoryPayload {
  items: InventoryItemRow[];
  inventoryEnabled: boolean;
}

export const INVENTORY_QUERY_KEY = ['inventory'] as const;

/** 拉自己的清单 (RLS self-only); 任何失败降级 inventoryEnabled:false */
export async function fetchInventory(): Promise<InventoryPayload> {
  try {
    const data = await apiFetch<Partial<InventoryPayload>>('/api/inventory');
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      inventoryEnabled: data?.inventoryEnabled === true,
    };
  } catch {
    // safe to ignore: 查看面是非关键路径, 网络/500 一律降级为「功能不可用」轻提示
    return { items: [], inventoryEnabled: false };
  }
}

/** 删自己的一条 (API 侧 id + user_id 双过滤); 失败/不存在抛 ApiError */
export async function deleteInventoryItem(id: string): Promise<void> {
  await apiFetchVoid(`/api/inventory?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type InventoryGroup = 'today' | 'week' | 'earlier';

/** created_at desc → 今天/本周/更早 三桶 (空桶丢弃, 保持原相对顺序) */
export function groupInventoryItems(items: InventoryItemRow[], now = new Date()): [InventoryGroup, InventoryItemRow[]][] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 86_400_000;
  const buckets: Record<InventoryGroup, InventoryItemRow[]> = { today: [], week: [], earlier: [] };
  for (const item of items) {
    const at = new Date(item.created_at).getTime();
    buckets[at >= startOfToday ? 'today' : at >= weekAgo ? 'week' : 'earlier'].push(item);
  }
  return (['today', 'week', 'earlier'] as InventoryGroup[]).flatMap((g) => (buckets[g].length ? [[g, buckets[g]] as [InventoryGroup, InventoryItemRow[]]] : []));
}
