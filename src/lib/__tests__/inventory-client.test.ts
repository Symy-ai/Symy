/**
 * inventory-client 测试 (batch84-a)
 *
 * 覆盖: GET 透传 / 表未建降级透传 / 网络失败与畸形响应降级不炸 /
 * DELETE id 查询参数契约 / 删除失败上抛 (由 useMutation 回滚) /
 * groupInventoryItems 今天-本周-更早 分桶。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { fetchInventory, deleteInventoryItem, groupInventoryItems } from '../inventory-client';
import type { InventoryItemRow } from '@/lib/inventory';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedApiFetchVoid = vi.mocked(apiFetchVoid);

function row(overrides: Partial<InventoryItemRow> = {}): InventoryItemRow {
  return { id: 'id-1', item_name: '电钻', category: 'home', source: 'chat', created_at: '2026-09-19T02:00:00.000Z', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchInventory — 透传与降级', () => {
  it('API 200 正常数据原样透传', async () => {
    const payload = { items: [row()], inventoryEnabled: true };
    mockedApiFetch.mockResolvedValue(payload as never);
    await expect(fetchInventory()).resolves.toEqual(payload);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/inventory');
  });

  it('表未建: API 200 { items: [], inventoryEnabled: false } 原样透传 (不炸)', async () => {
    const payload = { items: [], inventoryEnabled: false };
    mockedApiFetch.mockResolvedValue(payload as never);
    await expect(fetchInventory()).resolves.toEqual(payload);
  });

  it('网络/500 失败降级 inventoryEnabled: false, 不抛错', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    await expect(fetchInventory()).resolves.toEqual({ items: [], inventoryEnabled: false });
  });

  it('畸形响应 (items 非数组 / 缺 inventoryEnabled) 按降级处理', async () => {
    mockedApiFetch.mockResolvedValue({ items: 'not-an-array' } as never);
    await expect(fetchInventory()).resolves.toEqual({ items: [], inventoryEnabled: false });
  });
});

describe('deleteInventoryItem — DELETE 契约', () => {
  it('带 id 查询参数 DELETE, 特殊字符走 encodeURIComponent', async () => {
    mockedApiFetchVoid.mockResolvedValue(undefined);
    await deleteInventoryItem('abc/123&x');
    expect(mockedApiFetchVoid).toHaveBeenCalledWith('/api/inventory?id=abc%2F123%26x', { method: 'DELETE' });
  });

  it('503 TABLE_NOT_FOUND / 404 等失败上抛 — 供 useMutation onError 回滚', async () => {
    mockedApiFetchVoid.mockRejectedValue(new Error('503'));
    await expect(deleteInventoryItem('id-1')).rejects.toThrow('503');
  });
});

describe('groupInventoryItems — 今天/本周/更早分桶', () => {
  const now = new Date(2026, 8, 19, 15, 0, 0); // 2026-09-19 15:00 本地时间
  const at = (month: number, day: number, hour = 10) => new Date(2026, month, day, hour).toISOString();

  it('按 created_at 分入三桶, 桶内保持 desc 相对顺序, 空桶丢弃', () => {
    const items = [
      row({ id: 'a', created_at: at(8, 19, 9) }), // 今天 09-19
      row({ id: 'b', created_at: at(8, 18) }), // 本周 09-18
      row({ id: 'c', created_at: at(8, 13) }), // 本周边界 09-13 (== 6 天前零点)
      row({ id: 'd', created_at: at(8, 12) }), // 更早 09-12
      row({ id: 'e', created_at: at(7, 1) }), // 更早 08-01
    ];
    const groups = groupInventoryItems(items, now);
    expect(groups.map(([g]) => g)).toEqual(['today', 'week', 'earlier']);
    expect(groups[0][1].map((i) => i.id)).toEqual(['a']);
    expect(groups[1][1].map((i) => i.id)).toEqual(['b', 'c']);
    expect(groups[2][1].map((i) => i.id)).toEqual(['d', 'e']);
  });

  it('只有更早的物品 → 只出一个 earlier 桶', () => {
    const groups = groupInventoryItems([row({ created_at: at(0, 5) })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe('earlier');
  });
});
