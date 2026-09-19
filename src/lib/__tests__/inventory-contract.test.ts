/**
 * inventory 契约测试 (batch87-b) — migration 142 执行前的护栏
 *
 * route.ts 的 select/eq/order 列名、POST insert 键、InventoryItemRow 读面键
 * 必须与 database.types.ts 的 user_inventory Row/Insert 对齐:
 * 表列被改名/删除/漂移时 tsc 或本测试即红, 不等 migration 上线才炸。
 * (b81-c 写侧 + b84-a 读侧共享同一张护城河表, 列契约只守一处。)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../database.types';
import { inventoryItemSchema, type InventoryItemRow, type InventoryItemInput } from '../inventory';

type Row = Database['public']['Tables']['user_inventory']['Row'];
type Insert = Database['public']['Tables']['user_inventory']['Insert'];

// 全列存根: Row 每列必填 — 表类型少列/改名/改型时此行 tsc 红
const ROW_STUB: Row = {
  id: 'r',
  user_id: 'u',
  item_name: '数据线',
  category: null,
  source: 'chat',
  created_at: '2026-01-01T00:00:00Z',
};
const COLUMNS = Object.keys(ROW_STUB) as (keyof Row)[];

// 写侧输入键 ⊆ Insert 列 (route: insert({ user_id, ...parsed.data })) — tsc 级护栏
const INSERT_GUARD: { [K in keyof InventoryItemInput]: keyof Insert } = {
  item_name: 'item_name',
  category: 'category',
  source: 'source',
};
const USER_ID_COLUMN: keyof Insert = 'user_id';

// 读面行键 ⊆ Row 列 (GET 返回的 InventoryItemRow) — tsc 级护栏
const ROW_VIEW_GUARD: Record<keyof InventoryItemRow, keyof Row> = {
  id: 'id',
  item_name: 'item_name',
  category: 'category',
  source: 'source',
  created_at: 'created_at',
};

const ROUTE_SRC = readFileSync(join(process.cwd(), 'src/app/api/inventory/route.ts'), 'utf-8');

describe('user_inventory 表契约 (migration 142 护栏)', () => {
  it('database.types.ts Row 恒为六列 id/user_id/item_name/category/source/created_at', () => {
    expect([...COLUMNS].sort()).toEqual(['category', 'created_at', 'id', 'item_name', 'source', 'user_id']);
  });

  it('route 的 select/eq/order 列名全部 ∈ Row 列', () => {
    const used = new Set<string>();
    for (const m of ROUTE_SRC.matchAll(/\.select\('([^']+)'\)/g)) {
      for (const col of m[1].split(',')) used.add(col.trim());
    }
    for (const m of ROUTE_SRC.matchAll(/\.eq\('([^']+)',/g)) used.add(m[1]);
    for (const m of ROUTE_SRC.matchAll(/\.order\('([^']+)'/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThanOrEqual(5);
    for (const col of used) {
      expect(COLUMNS as string[], `route 列 "${col}" 不在 user_inventory Row 中`).toContain(col);
    }
  });

  it('select 列表不回传 user_id (读面脱敏)', () => {
    const selects = [...ROUTE_SRC.matchAll(/\.select\('([^']+)'\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThanOrEqual(2); // GET 与 POST 各一处
    for (const s of selects) {
      expect(s.split(',').map((c) => c.trim())).not.toContain('user_id');
    }
  });

  it('schema 输出键 + user_id + INSERT_GUARD 值全部 ∈ Row 列 (POST insert 形状)', () => {
    const parsed = inventoryItemSchema.parse({ item_name: 'x', category: 'electronics' });
    const insertKeys = [...Object.keys(parsed), USER_ID_COLUMN, ...Object.values(INSERT_GUARD)];
    for (const key of insertKeys) {
      expect(COLUMNS as string[], `insert 键 "${key}" 不在 user_inventory Row 中`).toContain(key);
    }
    expect(ROW_VIEW_GUARD).toBeTruthy(); // tsc 已护栏, 运行时仅防 tree-shake 误删
  });
});
