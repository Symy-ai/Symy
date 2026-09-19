'use client';

/**
 * InventoryListCard — 物品清单查看卡 (batch84-a, BP p12 数据飞轮第②环「画像」)
 *
 * batch81-c 对话建库之后, 用户第一次能看见自己的清单在生长 — 感知
 * 「参谋越来越懂我」。只读 + 删除。红线: 无手动添加 (BP 冷启动不做表单,
 * 唯一入口是对话, 空态引导点明); 删除必走确认弹窗 (独立组件), 乐观更新
 * 失败回滚; 数据 self-only (RLS + API user_id 双过滤)。
 * 三态: disabled (表未建降级) / empty (引导去对话) / normal (时间分组)。
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { fetchInventory, deleteInventoryItem, groupInventoryItems, INVENTORY_QUERY_KEY, type InventoryPayload } from '@/lib/inventory-client';
import { InventoryDeleteConfirmDialog } from '@/components/profile-parts/inventory-delete-confirm-dialog';

/** chat 建库 (batch81-c duplicate-precheck) 的品类集; 命中才走 i18n, 未知名显示原文 */
const CHAT_CATEGORIES = new Set(['electronics', 'food', 'home', 'other']);

export function InventoryListCard() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: INVENTORY_QUERY_KEY, queryFn: fetchInventory });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rollbackToast, setRollbackToast] = useState(false);

  useEffect(() => {
    if (!rollbackToast) return;
    const timer = setTimeout(() => setRollbackToast(false), 3000);
    return () => clearTimeout(timer);
  }, [rollbackToast]);

  const deleteMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: INVENTORY_QUERY_KEY });
      const prev = queryClient.getQueryData<InventoryPayload>(INVENTORY_QUERY_KEY);
      queryClient.setQueryData<InventoryPayload>(INVENTORY_QUERY_KEY, (old) => (old ? { ...old, items: old.items.filter((it) => it.id !== id) } : old));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(INVENTORY_QUERY_KEY, ctx.prev);
      setRollbackToast(true);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY }),
  });

  if (isLoading) {
    return (
      <div className="p-3 rounded-xl border border-glass-border bg-glass-fill animate-pulse" data-testid="inventory-list-card-skeleton">
        <div className="h-4 w-28 rounded bg-white/10 mb-2" />
        <div className="h-3 w-full rounded bg-white/10" />
      </div>
    );
  }

  // 态 1: disabled — 表未建 (migration 142 未执行期) 或拉取失败, 轻提示不炸
  if (!data?.inventoryEnabled) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill" data-testid="inventory-list-card-disabled">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted"><PackageOpen className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.inventory.title')}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t('profile.inventory.disabled')}</p>
        </div>
      </div>
    );
  }

  const categoryLabel = (category: string | null) => (category && CHAT_CATEGORIES.has(category) ? t(`profile.inventory.cat.${category}`) : category);
  const groups = groupInventoryItems(data.items);
  const dateFormatter = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="p-3 rounded-xl border border-glass-border bg-glass-fill" data-testid="inventory-list-card">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted"><PackageOpen className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">{t('profile.inventory.title')}</p>
            {data.items.length > 0 && (
              <p className="text-[11px] text-text-tertiary" data-testid="inventory-list-card-headline">{t('profile.inventory.headline', { count: data.items.length })}</p>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary mb-2">{t('profile.inventory.desc')}</p>

          {/* 态 2: empty — enabled 但还没有物品: 引导去对话, 点明无手动添加 (红线) */}
          {data.items.length === 0 ? (
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2" data-testid="inventory-list-card-empty">
              <p className="text-xs text-text-secondary">{t('profile.inventory.empty')}</p>
              <p className="mt-1 text-[11px] text-text-tertiary">{t('profile.inventory.emptyHint')}</p>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="inventory-list-card-groups">
              {groups.map(([group, groupItems]) => (
                <li key={group}>
                  <p className="text-[11px] font-medium text-text-tertiary mb-1">{t(`profile.inventory.group.${group}`)}</p>
                  <ul className="space-y-1">
                    {groupItems.map((item) => {
                      const cat = categoryLabel(item.category);
                      return (
                        <li key={item.id} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 flex items-center gap-2" data-testid={`inventory-item-${item.id}`}>
                          <span className="truncate text-xs font-bold text-text-primary">{item.item_name}</span>
                          {cat && <span className="flex-shrink-0 rounded-full border border-cyan-300/25 bg-cyan-950/30 px-1.5 py-0.5 text-[10px] text-cyan-100/90">{cat}</span>}
                          <span className="flex-shrink-0 rounded-full border border-emerald-300/25 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-200/90">
                            {t(item.source === 'manual' ? 'profile.inventory.sourceManual' : 'profile.inventory.sourceChat')}
                          </span>
                          <span className="ml-auto flex-shrink-0 text-[10px] text-text-tertiary">{t('profile.inventory.addedAt', { date: dateFormatter.format(new Date(item.created_at)) })}</span>
                          <button
                            type="button"
                            aria-label={t('profile.inventory.deleteAria')}
                            className="flex-shrink-0 text-text-tertiary hover:text-red-300 transition-colors cursor-pointer"
                            onClick={() => setPendingDelete(item.id)}
                            data-testid={`inventory-item-delete-${item.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 (破坏性操作红线) + 乐观删除失败回滚 toast */}
      {data.items.filter((it) => it.id === pendingDelete).map((item) => (
        <InventoryDeleteConfirmDialog
          key={item.id}
          item={item}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { deleteMutation.mutate(item.id); setPendingDelete(null); }}
        />
      ))}
      {rollbackToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[330] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg bg-red-500/90 text-white" data-testid="inventory-rollback-toast">
          {t('profile.inventory.deleteFailed')}
        </div>
      )}
    </div>
  );
}
