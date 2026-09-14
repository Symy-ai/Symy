'use client';

/**
 * MeDreamFundsSection — Me 页面专用的梦想基金模块
 *
 * 基于 buddy/dream-funds-section.tsx，修复两个 bug:
 * 1. 拖拽 handle 太小 (w-3 h-3 = 12px) → 增大到 w-5 h-5 (20px) + 增加点击 padding
 * 2. 整个基金卡片头部可拖拽 (不仅是 GripVertical 图标)
 *
 * 注意: 这个组件只用于 Me 页面, Buddy 页面继续用原版 dream-funds-section.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { DreamFund } from '@/types/buddy-state';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';
import { DreamFundEditor } from '../buddy/dream-fund-editor';
import { formatCurrency } from '@/lib/format';
import { useDragReorder } from '@/hooks/use-drag-reorder';

interface MeDreamFundsSectionProps {
  dreamFunds: DreamFund[];
  isDemo: boolean;
  onCreateDreamFund?: (fund: Omit<DreamFund, 'id'>) => string;
  onUpdateDreamFund?: (fundId: string, updates: Partial<Omit<DreamFund, 'id'>>) => void;
  onDeleteDreamFund?: (fundId: string) => void;
  onReorderDreamFunds?: (newOrder: string[]) => void;
  onToast?: (message: string, type?: 'success' | 'info') => void;
}

interface FundHistoryEntry {
  id: string;
  amount: number;
  description: string;
  createdAt: string;
  eventType: string;
  triggerSource: string;
}

export function MeDreamFundsSection({
  dreamFunds,
  isDemo,
  onCreateDreamFund,
  onUpdateDreamFund,
  onDeleteDreamFund,
  onReorderDreamFunds,
  onToast,
}: MeDreamFundsSectionProps) {
  const { t } = useI18n();

  const [editingFund, setEditingFund] = useState<DreamFund | null>(null);
  const [showFundEditor, setShowFundEditor] = useState(false);
  const [fundEditorMode, setFundEditorMode] = useState<'create' | 'edit' | 'setNewGoal'>('create');
  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);
  const [fundHistory, setFundHistory] = useState<FundHistoryEntry[]>([]);
  const [isLoadingFundHistory, setIsLoadingFundHistory] = useState(false);

  const dragReorder = useDragReorder({
    items: dreamFunds,
    getId: (f) => f.id,
    onReorder: (ids) => onReorderDreamFunds?.(ids),
    onToast,
    orderSavedMessage: t('buddy.dreamFundOrderSaved', { defaultValue: 'Fund order updated ✓' }),
    disabled: isDemo || !onReorderDreamFunds,
    lockedIds: new Set([SAVINGS_FUND_ID]),
  });
  const { draggedId: draggedFundId, dragOverId: dragOverFundId } = dragReorder;

  const fundHistoryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (fundHistoryAbortRef.current) {
        fundHistoryAbortRef.current.abort();
      }
    };
  }, []);

  const handleCloseFundEditor = useCallback(() => {
    setShowFundEditor(false);
    setFundEditorMode('create');
  }, []);

  const handleFundCardClick = useCallback(async (fundId: string) => {
    if (draggedFundId !== null || dragReorder.wasDragJustEnded()) return;

    if (expandedFundId === fundId) {
      setExpandedFundId(null);
      setFundHistory([]);
      return;
    }

    setExpandedFundId(fundId);
    setFundHistory([]);
    setIsLoadingFundHistory(true);

    if (fundHistoryAbortRef.current) {
      fundHistoryAbortRef.current.abort();
    }
    const controller = new AbortController();
    fundHistoryAbortRef.current = controller;

    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ history?: FundHistoryEntry[] }>(
        `/api/buddy/dream-funds/${encodeURIComponent(fundId)}/history`,
        { signal: controller.signal }
      );
      if (!controller.signal.aborted) {
        setFundHistory(data?.history || []);
      }
    } catch (_err) {
      if (!controller.signal.aborted) {
        setFundHistory([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingFundHistory(false);
      }
    }
  }, [expandedFundId, draggedFundId, dragReorder]);

  const totalCurrent = dreamFunds.reduce((sum, f) => sum + (f.current || 0), 0);

  return (
    <div className="relative z-10 px-4 py-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-text-secondary">
          {t('buddy.dreamFunds')}
          <span className="text-cyan-400/80 ml-1.5">
            ({formatCurrency(totalCurrent, { decimals: false })})
          </span>
        </h3>
        {!isDemo && (
          <button
            onClick={() => {
              setEditingFund(null);
              setFundEditorMode('create');
              setShowFundEditor(true);
            }}
            className="text-cyan-400 hover:text-cyan-300 transition-colors"
            aria-label={t('buddy.dreamFundAdd')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <p className="text-[10px] text-text-tertiary mb-2">
        {t('buddy.dreamFundsSubtitle', { defaultValue: 'Life you reclaimed rests here' })}
      </p>
      <p className="text-[10px] text-text-tertiary/70 mb-2">
        {t('buddy.dreamFundOrderHint', { defaultValue: '💡 Money you save goes to your top fund first. Once full, it flows to the next.' })}
      </p>

      <div className="space-y-2">
        {dreamFunds.map((fund, _index) => {
          const isSavingsFund = fund.id === SAVINGS_FUND_ID;
          const pct = isSavingsFund ? 100 : Math.min(100, Math.round((fund.current / fund.target) * 100));
          const isDragging = draggedFundId === fund.id;
          const isDragOver = dragOverFundId === fund.id;
          const canDrag = !isDemo && onReorderDreamFunds && !isSavingsFund;

          return (
            <div
              key={fund.id}
              data-fund-id={fund.id}
              onPointerMove={dragReorder.onPointerMove}
              onPointerUp={dragReorder.onPointerUp}
              onPointerCancel={dragReorder.onPointerUp}
              onClick={() => handleFundCardClick(fund.id)}
              className={`glass-card rounded-xl p-3 group transition-all ${isDragging ? 'opacity-40 scale-95' : ''} ${isDragOver ? 'ring-2 ring-cyan-400/50' : ''} cursor-pointer ${expandedFundId === fund.id ? 'ring-1 ring-cyan-400/30' : ''}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {/* 🔧 Bug fix: 拖拽区域增大 + 绑定 move/up 事件到 handle (setPointerCapture 在此元素) */}
                  {canDrag && (
                    <div
                      className="flex items-center justify-center w-6 h-6 -ml-1 cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0 hover:bg-glass-hover rounded"
                      aria-label={t('buddy.dreamFundDragReorder', { defaultValue: 'Drag to reorder' })}
                      onPointerDown={dragReorder.onHandlePointerDown(fund.id)}
                      onPointerMove={dragReorder.onPointerMove}
                      onPointerUp={dragReorder.onPointerUp}
                      onPointerCancel={dragReorder.onPointerUp}
                    >
                      <GripVertical className="text-text-tertiary/60 w-4 h-4" />
                    </div>
                  )}
                  {!isDemo && dreamFunds.length > 1 && (
                    <span className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${!isSavingsFund && fund.current >= fund.target ? 'bg-amber-500/25 text-amber-300' : 'bg-cyan-500/20 text-cyan-400'}`}>
                      {!isSavingsFund && fund.current >= fund.target ? '★' : _index + 1}
                    </span>
                  )}
                  <span className="text-base">{fund.emoji}</span>
                  <span className="text-sm font-medium text-text-primary">
                    {fund.id === SAVINGS_FUND_ID ? t('buddy.dreamFundSavings', { defaultValue: 'Savings' }) : fund.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {fund.id === SAVINGS_FUND_ID ? (
                    <span className="text-xs text-text-secondary">
                      {formatCurrency(fund.current, { decimals: false })} <span className="text-text-tertiary/60">/ ∞</span>
                    </span>
                  ) : (
                    <span className="text-xs text-text-secondary">{formatCurrency(fund.current, { decimals: false })} / {formatCurrency(fund.target, { decimals: false })}</span>
                  )}
                  {!isDemo && !isSavingsFund && (
                    <div className="flex items-center gap-0.5">
                      <button
                        draggable={false}
                        disabled={draggedFundId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (draggedFundId !== null || dragReorder.wasDragJustEnded()) return;
                          setEditingFund(fund);
                          setFundEditorMode('edit');
                          setShowFundEditor(true);
                        }}
                        className="text-text-tertiary hover:text-cyan-400 transition-colors p-1 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={t('buddy.dreamFundEdit')}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {dreamFunds.length > 1 ? (
                        <button
                          draggable={false}
                          disabled={draggedFundId !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (draggedFundId !== null || dragReorder.wasDragJustEnded()) return;
                            const fundToDelete = dreamFunds.find(f => f.id === fund.id);
                            const hasProgress = fundToDelete && fundToDelete.current > 0;
                            const confirmMsg = hasProgress
                              ? t('buddy.dreamFundDeleteConfirmWithProgress', { amount: fundToDelete!.current.toLocaleString() })
                              : t('buddy.dreamFundDeleteConfirm');
                            if (confirm(confirmMsg)) {
                              onDeleteDreamFund?.(fund.id);
                              onToast?.(t('buddy.dreamFundDeleted'), 'info');
                            }
                          }}
                          className="text-text-tertiary hover:text-red-400 transition-colors p-1 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={t('buddy.dreamFundDelete')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          disabled
                          className="text-text-tertiary/30 p-1 cursor-not-allowed"
                          aria-label={t('buddy.dreamFundDeleteDisabled', { defaultValue: 'At least 1 dream fund is required' })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-glass-fill rounded-full overflow-hidden relative">
                {isSavingsFund ? (
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400/60 via-purple-400/80 to-cyan-400/60 animate-pulse" style={{ width: '100%' }} />
                ) : (
                  <div
                    className={`h-full rounded-full transition-all duration-700 relative overflow-hidden ${pct >= 100 ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500' : 'bg-gradient-to-r from-cyan-400 to-purple-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              {!isSavingsFund && pct >= 100 && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
                    <span>★</span>
                    {t('buddy.goalReached')}
                  </p>
                  {!isDemo && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFund(null);
                        setFundEditorMode('setNewGoal');
                        setShowFundEditor(true);
                      }}
                      className="text-[10px] text-amber-300 hover:text-amber-200 underline decoration-dotted transition-colors"
                    >
                      {t('buddy.setNewGoal', { defaultValue: 'Set a new goal →' })}
                    </button>
                  )}
                </div>
              )}
              {isSavingsFund && fund.current > 0 && (
                <p className="text-[10px] text-cyan-400/70 mt-1 font-medium">
                  {t('buddy.dreamFundSavingsHint', { defaultValue: '∞ Accumulating savings' })}
                </p>
              )}
              {expandedFundId === fund.id && (
                <div className="mt-2 pt-2 border-t border-glass-border">
                  <p className="text-[10px] text-text-tertiary mb-1.5 font-medium">
                    {t('buddy.dreamFundHistoryTitle', { defaultValue: '📋 Fill history' })}
                  </p>
                  {isLoadingFundHistory ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                      <span className="text-[10px] text-text-tertiary">{t('common.loading', { defaultValue: 'Loading...' })}</span>
                    </div>
                  ) : fundHistory.length === 0 ? (
                    <p className="text-[10px] text-text-tertiary italic py-1">
                      {t('buddy.dreamFundHistoryEmpty', { defaultValue: 'No fill history yet — complete a challenge to start filling this fund!' })}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {fundHistory.map((h) => {
                        const icon = h.eventType === 'refund_boost' ? '💰' : h.eventType === 'challenge_failed' ? '🌫️' : '🛡️';
                        const date = new Date(h.createdAt);
                        const dateStr = isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        return (
                          <div key={h.id} className="flex items-center gap-2 text-[10px] py-0.5">
                            <span>{icon}</span>
                            <span className="text-text-secondary flex-1 truncate">{h.description.slice(0, 50)}</span>
                            <span className="text-cyan-400 font-mono">+${h.amount.toFixed(2)}</span>
                            <span className="text-text-tertiary/70">{dateStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DreamFundEditor
        open={showFundEditor}
        editingFund={editingFund}
        mode={fundEditorMode}
        existingFunds={dreamFunds}
        onClose={handleCloseFundEditor}
        onCreate={(fund) => onCreateDreamFund?.(fund)}
        onUpdate={(fundId, patch) => onUpdateDreamFund?.(fundId, patch)}
        onToast={onToast}
      />
    </div>
  );
}
