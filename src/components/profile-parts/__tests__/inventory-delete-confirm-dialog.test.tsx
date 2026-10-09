// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { name?: string }) => {
  const map: Record<string, string> = {
    'profile.inventory.confirmTitle': '删除这件物品?',
    'profile.inventory.confirmDesc': '「{name}」将被移出清单, 此操作需要确认。',
    'profile.inventory.cancel': '取消',
    'profile.inventory.confirmYes': '删除',
  };
  let v = map[key] ?? key;
  if (opts && opts.name !== undefined) v = v.replace('{name}', opts.name);
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { InventoryDeleteConfirmDialog } from '../inventory-delete-confirm-dialog';

const item = { id: 'i1', item_name: '蓝牙耳机', status: 'active' } as never;

/**
 * inventory-delete-confirm-dialog.tsx (42行) — 删除确认 (batch84-a, owner UX 红线件)。
 *
 * 锁定:
 * - role=dialog + aria-modal
 * - item name 插入确认描述
 * - 取消/删除双按钮回调
 * - 遮罩点击=取消; 内容区不冒泡
 * - z-[320] (MODAL 300 与 MODAL_HIGH 400 之间)
 */
describe('InventoryDeleteConfirmDialog', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('role=dialog+aria-modal; name 插入描述', () => {
    render(<InventoryDeleteConfirmDialog item={item} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('「蓝牙耳机」将被移出清单, 此操作需要确认。')).toBeTruthy();
  });

  it('双按钮: 取消→onCancel / 删除→onConfirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<InventoryDeleteConfirmDialog item={item} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('inventory-delete-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('inventory-delete-confirm-yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('遮罩点击=取消; 内容区不冒泡', () => {
    const onCancel = vi.fn();
    render(<InventoryDeleteConfirmDialog item={item} onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText('删除这件物品?')); // 内容区
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('inventory-delete-confirm')); // 遮罩
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
