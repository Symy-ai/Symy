/**
 * inventory — 复用优先物品清单数据契约 (batch81-c, BP p12/15/18)
 *
 * 表 user_inventory (migration 142, owner 手动执行) 的服务端校验与
 * 降级判定。表未建期间 API 不炸: GET 回 { items: [], inventoryEnabled: false },
 * 写操作回 503 TABLE_NOT_FOUND — 客户端建库钩子按 best-effort 吞掉。
 */

import { z } from 'zod';

export const INVENTORY_SOURCE_VALUES = ['chat', 'manual'] as const;

export const inventoryItemSchema = z.object({
  item_name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'item_name must be 1-100 characters').max(100, 'item_name must be 1-100 characters')),
  category: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(50))
    .optional(),
  source: z.enum(INVENTORY_SOURCE_VALUES).default('chat'),
});

export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export interface InventoryItemRow {
  id: string;
  item_name: string;
  category: string | null;
  source: string;
  created_at: string;
}

/** supabase-js 把 PG 42P01 (undefined_table) 放在 PostgrestError.code 上 */
export function isInventoryTableMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}
