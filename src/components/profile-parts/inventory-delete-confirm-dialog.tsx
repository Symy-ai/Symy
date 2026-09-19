'use client';

/**
 * InventoryDeleteConfirmDialog — 物品删除确认弹窗 (batch84-a)
 *
 * 删除是破坏性操作 (owner UX 红线): 必走确认, 不做裸删除。
 * 确认后由父级 useMutation 乐观删除 + 失败回滚。
 */

import { useI18n } from '@/i18n/provider';
import type { InventoryItemRow } from '@/lib/inventory';

interface Props {
  item: InventoryItemRow;
  onCancel: () => void;
  onConfirm: () => void;
}

export function InventoryDeleteConfirmDialog({ item, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={onCancel} data-testid="inventory-delete-confirm">
      <div className="rounded-xl border border-glass-border bg-surface-1 p-4 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-text-primary">{t('profile.inventory.confirmTitle')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('profile.inventory.confirmDesc', { name: item.item_name })}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-glass-border px-3 py-1.5 text-xs text-text-secondary cursor-pointer" onClick={onCancel} data-testid="inventory-delete-cancel">
            {t('profile.inventory.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/30 transition-colors cursor-pointer"
            onClick={onConfirm}
            data-testid="inventory-delete-confirm-yes"
          >
            {t('profile.inventory.confirmYes')}
          </button>
        </div>
      </div>
    </div>
  );
}
