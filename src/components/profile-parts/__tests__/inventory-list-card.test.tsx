// @vitest-environment happy-dom

/**
 * InventoryListCard 渲染测试 (batch84-a)
 *
 * 覆盖: 三态 (disabled 表未建 / empty 引导去对话 / normal 分组列表) +
 * 删除确认流 (取消不发请求, 确认才 DELETE) + 乐观删除失败回滚 toast +
 * 红线固化: 无手动添加按钮 (冷启动不做表单, 唯一入口是对话)。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryListCard } from '../inventory-list-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

import { apiFetch, apiFetchVoid } from '@/lib/api-client';

const mockedApiFetch = vi.mocked(apiFetch);
const mockedApiFetchVoid = vi.mocked(apiFetchVoid);

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations: Record<string, string> = {
      'profile.inventory.title': 'Your Inventory',
      'profile.inventory.desc': 'Things mentioned in chats are logged here',
      'profile.inventory.headline': '{count} items · still growing',
      'profile.inventory.disabled': 'Inventory is coming soon',
      'profile.inventory.empty': 'Mention things you already own in a chat and they are logged here',
      'profile.inventory.emptyHint': 'No manual entry — just say it in a chat',
      'profile.inventory.group.today': 'Today',
      'profile.inventory.group.week': 'This week',
      'profile.inventory.group.earlier': 'Earlier',
      'profile.inventory.sourceChat': 'Chat',
      'profile.inventory.sourceManual': 'Manual',
      'profile.inventory.addedAt': 'Added {date}',
      'profile.inventory.deleteAria': 'Delete this item',
      'profile.inventory.confirmTitle': 'Delete this item?',
      'profile.inventory.confirmDesc': '“{name}” will be removed and cannot be recovered.',
      'profile.inventory.confirmYes': 'Delete',
      'profile.inventory.cancel': 'Cancel',
      'profile.inventory.deleteFailed': 'Delete failed — your list is restored',
      'profile.inventory.cat.home': 'Home',
      'profile.inventory.cat.electronics': 'Electronics',
    };
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale: 'en',
    };
  },
}));

const NOW = new Date();
function item(id: string, name: string, opts: { category?: string | null; source?: string; ageDays?: number } = {}) {
  return {
    id,
    item_name: name,
    category: opts.category === undefined ? 'home' : opts.category,
    source: opts.source ?? 'chat',
    created_at: new Date(NOW.getTime() - (opts.ageDays ?? 0) * 86_400_000).toISOString(),
  };
}

function mockGet(payload: unknown) {
  mockedApiFetch.mockResolvedValue(payload as never);
}

/** 每次渲染独立 QueryClient (乐观更新改的是缓存, 不能跨测试串味) */
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** 红线固化: 任何状态下都不允许出现手动添加入口 */
function assertNoAddEntry(container: HTMLElement) {
  for (const button of Array.from(container.querySelectorAll('button'))) {
    expect(button.textContent ?? '').not.toMatch(/add|添加/i);
    expect(button.getAttribute('aria-label') ?? '').not.toMatch(/add|添加/i);
  }
  expect(container.querySelector('[data-testid="inventory-add-btn"]')).toBeNull();
  expect(container.querySelector('[data-testid="inventory-add-form"]')).toBeNull();
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedApiFetchVoid.mockReset();
});

describe('InventoryListCard — 三态', () => {
  it('禁用态: 表未建 (inventoryEnabled: false) → 即将上线轻提示', async () => {
    mockGet({ items: [], inventoryEnabled: false });
    const { container } = render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-list-card-disabled')).toBeTruthy());
    expect(screen.getByText('Inventory is coming soon')).toBeTruthy();
    assertNoAddEntry(container);
  });

  it('拉取失败 (网络/500) 同样走禁用态降级, 不抛错', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network') as never);
    const { container } = render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-list-card-disabled')).toBeTruthy());
    assertNoAddEntry(container);
  });

  it('空态: enabled 但无物品 → 引导去对话, 点明无手动添加', async () => {
    mockGet({ items: [], inventoryEnabled: true });
    const { container } = render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-list-card-empty')).toBeTruthy());
    expect(screen.getByText(/Mention things you already own in a chat/)).toBeTruthy();
    expect(screen.getByText('No manual entry — just say it in a chat')).toBeTruthy();
    assertNoAddEntry(container);
  });

  it('正常态: 今天/本周/更早分组 + 品类 tag + 来源标记 + 加入日期', async () => {
    mockGet({
      inventoryEnabled: true,
      items: [
        item('id-today', '投影仪', { category: 'electronics' }),
        item('id-week', '露营灯', { ageDays: 3 }),
        item('id-old', '婴儿车', { source: 'manual', ageDays: 30 }),
      ],
    });
    const { container } = render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-list-card')).toBeTruthy());

    expect(screen.getByTestId('inventory-list-card-headline').textContent).toContain('3 items');
    expect(screen.getByTestId('inventory-item-id-today')).toBeTruthy();
    expect(screen.getByTestId('inventory-item-id-week')).toBeTruthy();
    expect(screen.getByTestId('inventory-item-id-old')).toBeTruthy();

    const groups = screen.getByTestId('inventory-list-card-groups').textContent ?? '';
    expect(groups.indexOf('Today')).toBeLessThan(groups.indexOf('This week'));
    expect(groups.indexOf('This week')).toBeLessThan(groups.indexOf('Earlier'));

    expect(screen.getByTestId('inventory-item-id-today').textContent).toContain('Electronics');
    expect(screen.getByTestId('inventory-item-id-old').textContent).toContain('Manual');
    expect(screen.getByTestId('inventory-item-id-today').textContent).toContain('Chat');
    expect(screen.getByTestId('inventory-item-id-old').textContent).toMatch(/Added /);

    assertNoAddEntry(container);
  });
});

describe('InventoryListCard — 删除确认流 (破坏性操作红线)', () => {
  const twoItems = () => ({
    inventoryEnabled: true,
    items: [item('id-1', '投影仪'), item('id-2', '露营灯', { ageDays: 3 })],
  });

  it('取消: 弹窗关闭, 不发 DELETE, 物品仍在', async () => {
    mockGet(twoItems());
    render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-item-delete-id-1')).toBeTruthy());

    fireEvent.click(screen.getByTestId('inventory-item-delete-id-1'));
    expect(screen.getByTestId('inventory-delete-confirm')).toBeTruthy();
    expect(screen.getByTestId('inventory-delete-confirm').textContent ?? '').toContain('投影仪');

    fireEvent.click(screen.getByTestId('inventory-delete-cancel'));
    await waitFor(() => expect(screen.queryByTestId('inventory-delete-confirm')).toBeNull());
    expect(mockedApiFetchVoid).not.toHaveBeenCalled();
    expect(screen.getByTestId('inventory-item-id-1')).toBeTruthy();
  });

  it('确认: 发 DELETE, 乐观更新 — 请求未返回前物品先从界面消失', async () => {
    mockGet(twoItems());
    mockedApiFetchVoid.mockReturnValue(new Promise(() => {}) as never); // DELETE 悬挂
    render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-item-delete-id-1')).toBeTruthy());

    fireEvent.click(screen.getByTestId('inventory-item-delete-id-1'));
    fireEvent.click(screen.getByTestId('inventory-delete-confirm-yes'));

    await waitFor(() => expect(mockedApiFetchVoid).toHaveBeenCalledWith('/api/inventory?id=id-1', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByTestId('inventory-item-id-1')).toBeNull());
    expect(screen.getByTestId('inventory-item-id-2')).toBeTruthy();
  });

  it('失败回滚: DELETE 失败 → 物品回到列表 + 回滚 toast', async () => {
    mockGet(twoItems());
    mockedApiFetchVoid.mockRejectedValue(new Error('500') as never);
    render(<InventoryListCard />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('inventory-item-delete-id-2')).toBeTruthy());

    fireEvent.click(screen.getByTestId('inventory-item-delete-id-2'));
    fireEvent.click(screen.getByTestId('inventory-delete-confirm-yes'));

    await waitFor(() => expect(screen.getByTestId('inventory-rollback-toast')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('inventory-item-id-2')).toBeTruthy());
    expect(screen.getByText('Delete failed — your list is restored')).toBeTruthy();
  });
});
