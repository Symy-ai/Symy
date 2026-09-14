/**
 * Dream Funds Section — Display + manage dream funds with drag-reorder + expandable history
 *
 * 提取自 src/components/buddy-tab.tsx (Round 96 拆分)
 * 自包含: 拖拽状态 + 基金编辑器状态 + 历史加载状态 全部内化到组件中
 *
 * 包含:
 * - Dream fund 列表 (进度条 + 编辑/删除按钮)
 * - 拖拽排序 (Savings 基金固定最后, 不可拖拽)
 * - 点击展开填充历史 (API lazy load + AbortController)
 * - DreamFundEditor modal (create/edit/setNewGoal 三种模式)
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { DreamFund } from '@/types/buddy-state';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';
import { DreamFundEditor } from './dream-fund-editor';
import {
  claimDreamAchievement,
  dreamAchievementKey,
  readDreamAchievement,
  markDreamBaseline,
  resetDreamAchievement,
  resolveDreamAchievement,
  type DreamAchievementState,
} from './dream-achievement';
import { DreamAchievementOverlay } from './dream-achievement-overlay';
// 🔧 Round 96: 3D 翻转 — 庆祝粒子配置
const FUND_CELEBRATION_PARTICLES = Array.from({ length: 6 }).map((_, i) => ({
  angle: (i / 6) * Math.PI * 2 + Math.PI / 6,
  distance: 14 + (i % 2) * 6,
  delay: i * 0.05,
}));
// 🔧 P1-19 fix: 统一金额格式化
import { formatCurrency } from '@/lib/format';
// 🔧 PM3-P1-2 fix: Pointer Events 拖拽 (移动端可用)
import { useDragReorder } from '@/hooks/use-drag-reorder';
// 🛡️ batch6-b: 守护转存构成拆线 + 守护目标偏好 — 展示层聚合, 同源于 deposit 审计管道
import {
  fetchGuardTransfers,
  guardSavedByFund,
  getGuardTargetFundId,
  setGuardTargetFundId,
} from '@/lib/guard-ledger';

interface DreamFundsSectionProps {
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

export function DreamFundsSection({
  dreamFunds,
  isDemo,
  onCreateDreamFund,
  onUpdateDreamFund,
  onDeleteDreamFund,
  onReorderDreamFunds,
  onToast,
}: DreamFundsSectionProps) {
  const { t } = useI18n();

  // ====== Internal state (moved from buddy-tab.tsx — Round 96) ======
  const [editingFund, setEditingFund] = useState<DreamFund | null>(null);
  const [showFundEditor, setShowFundEditor] = useState(false);
  const [fundEditorMode, setFundEditorMode] = useState<'create' | 'edit' | 'setNewGoal'>('create');
  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);
  const [fundHistory, setFundHistory] = useState<FundHistoryEntry[]>([]);
  const [isLoadingFundHistory, setIsLoadingFundHistory] = useState(false);
  // 🛡️ batch6-b: 每个基金"其中守护攒下"金额 (fundId → Σ存款派生) + 守护目标基金 id
  const [guardByFund, setGuardByFund] = useState<Record<string, number>>({});
  const [guardTargetId, setGuardTargetId] = useState<string>(SAVINGS_FUND_ID);
  const [celebratedFund, setCelebratedFund] = useState<DreamFund | null>(null);
  const stateIdsRef = useRef<Map<string, DreamAchievementState>>(new Map());
  const resetGoalFundIdRef = useRef<string | null>(null);

  // 🔧 PM3-P1-2 fix: 用 Pointer Events 替代 HTML5 drag-and-drop (移动端可用)
  //   旧实现用 draggable/onDragStart/... → 移动端不工作
  //   新实现用 pointerdown/pointermove/pointerup → mouse + touch 统一
  //   touch 时长按 300ms 进入拖拽 (避免误触), mouse 立即拖拽
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

  // Refs
  const fundHistoryAbortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fundHistoryAbortRef.current) {
        fundHistoryAbortRef.current.abort();
      }
    };
  }, []);

  // 🛡️ batch6-b: 挂载时读取守护目标偏好 + 拉取 deposit 审计记录派生各基金守护攒下金额
  //   (非关键展示, 失败静默为空; demo 模式不拉取)
  useEffect(() => {
    if (isDemo) return;
    setGuardTargetId(getGuardTargetFundId());
    let cancelled = false;
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 挂载时按需拉取既有 deposit 审计管道 (分页取全, cancelled flag 防泄漏); 非关键展示区块, 失败静默为空
    fetchGuardTransfers()
      .then((entries) => {
        if (!cancelled) setGuardByFund(guardSavedByFund(entries));
      })
      .catch(() => { /* 非关键区块, 保持为空 */ });
    return () => { cancelled = true; };
  }, [isDemo]);

  const handleSetGuardTarget = useCallback((fundId: string) => {
    setGuardTargetFundId(fundId);
    setGuardTargetId(fundId);
    onToast?.(t('buddy.dreamFund.guardTargetSaved', { defaultValue: 'Guard target set 🛡️' }), 'success');
  }, [onToast, t]);

  // ====== Callbacks ======
  const handleCloseFundEditor = useCallback(() => {
    setShowFundEditor(false);
    setFundEditorMode('create');
  }, []);

  useEffect(() => {
    dreamFunds.forEach((fund) => {
      if (fund.id === SAVINGS_FUND_ID) return;
      try {
        const state = readDreamAchievement(fund.id);
        if (state) {
          stateIdsRef.current.set(fund.id, state);
          return;
        }
        const achieved = fund.current >= fund.target && fund.target > 0;
        if (achieved) {
          stateIdsRef.current.set(fund.id, '1');
          claimDreamAchievement(fund.id);
        } else {
          stateIdsRef.current.set(fund.id, 'unachieved');
          markDreamBaseline(fund.id);
        }
      } catch {
        // safe to ignore: storage failures fall back to an in-memory per-session baseline.
        if (!stateIdsRef.current.has(fund.id)) stateIdsRef.current.set(fund.id, 'unachieved');
      }
    });
    const claimed = (fundId: string) => {
      if (stateIdsRef.current.get(fundId) === 'unachieved') return false;
      if (stateIdsRef.current.get(fundId) === '1') return true;
      try {
        return window.localStorage.getItem(dreamAchievementKey(fundId)) === '1';
      } catch {
        // safe to ignore: storage failures fall back to the in-memory state map.
        return false;
      }
    };
    const winner = resolveDreamAchievement(dreamFunds, claimed);
    if (!winner) return;
    dreamFunds.forEach((fund) => {
      if (fund.current >= fund.target && fund.id !== SAVINGS_FUND_ID) {
        stateIdsRef.current.set(fund.id, '1');
        claimDreamAchievement(fund.id);
      }
    });
    if (celebratedFund?.id !== winner.id) setCelebratedFund(winner);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- celebration suppression is intentional to avoid re-showing after close
  }, [dreamFunds]);

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

  // ====== Render ======
  // 🔧 PM-P0-3 fix: 移除 hasRealData 占位逻辑, 直接显示真实总额 (即使是 $0)
  //   旧代码 (P1-5 fix) 引入 hasRealData = dreamFunds.some(f => f.current > 0)
  //   问题: 新用户或 fund 全 0 的用户, hasRealData=false → 永远显示 "$—"
  //   修复: 直接显示 totalCurrent (用 formatCurrency 统一格式), $0 也显示 $0
  const totalCurrent = dreamFunds.reduce((sum, f) => sum + (f.current || 0), 0);

  return (
    <div className="relative z-10 px-4 py-2">
      <div className="flex items-center justify-between mb-1">
        {/* 🔧 信任存入 fix (Round 106): 标题显示梦想基金总金额 */}
        <h3 className="text-sm font-semibold text-text-secondary">
          {t('buddy.dreamFunds')}
          <span className="text-cyan-400/80 ml-1.5">
            {/* 🔧 PM-P0-3 fix: 直接显示真实总额 (含千位分隔符), 不再用 "—" 占位 */}
            ({formatCurrency(totalCurrent, { decimals: false })})
          </span>
          {/* 🔧 Round 113 + v4 fix: Demo 模式标注 "📊 Sample" — 改用 amber 色系更醒目 */}
          {isDemo && (
            <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded ml-1">
              {t('ahaMoment.sampleDataLabel', { defaultValue: '📊 示例' })}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary">{t('buddy.moneySavedFliesHere')}</span>
          {!isDemo && dreamFunds.length < 10 && (
            <button
              onClick={() => {
                setEditingFund(null);
                setFundEditorMode('create');
                setShowFundEditor(true);
              }}
              className="text-cyan-400 hover:text-cyan-300 transition-colors"
              title={t('buddy.dreamFundAdd')}
              aria-label={t('buddy.dreamFundAdd')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {!isDemo && dreamFunds.length > 1 && (
        <p className="text-[10px] text-text-tertiary mb-2">
          {t('buddy.dreamFundOrderHint', { defaultValue: '💡 Savings fill from top to bottom' })}
        </p>
      )}
      {/* 🔧 PM-#20 fix: Reclaim 免责说明 — 合并到 orderHint 下方, 避免两条 💡 堆叠
          旧代码: 两条独立 💡 提示 (orderHint + reclaimDisclaimerHint) 信息过载
          新代码: 只在有余额时显示 reclaim 提示, 且用更小字号区分层级 */}
      {!isDemo && dreamFunds.length > 0 && dreamFunds.reduce((sum, f) => sum + (f.current || 0), 0) > 0 && (
        <p className="text-[9px] text-text-tertiary/60 mb-2 italic leading-tight">
          {t('buddy.reclaimDisclaimerHint', { defaultValue: 'Move money you didn\'t spend to savings for real' })}
        </p>
      )}
      <div className="space-y-2.5">
        {dreamFunds.map((fund, _index) => {
          const isSavingsFund = fund.id === SAVINGS_FUND_ID;
          const pct = isSavingsFund ? 0 : Math.min(100, (fund.current / (fund.target || 1)) * 100);
          const isDragging = draggedFundId === fund.id;
          const isDragOver = dragOverFundId === fund.id;
          return (
            <div
              key={fund.id}
              data-fund-id={fund.id}
              onPointerMove={dragReorder.onPointerMove}
              onPointerUp={dragReorder.onPointerUp}
              onPointerCancel={dragReorder.onPointerUp}
              onClick={() => handleFundCardClick(fund.id)}
              className={`glass-card rounded-xl p-3 group transition-all ${isDragging ? 'opacity-40 scale-95' : ''} ${isDragOver ? 'ring-2 ring-cyan-400/50' : ''} ${!isDemo && onReorderDreamFunds && !isSavingsFund ? 'cursor-pointer' : 'cursor-pointer'} ${expandedFundId === fund.id ? 'ring-1 ring-cyan-400/30' : ''}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {!isDemo && onReorderDreamFunds && !isSavingsFund && (
                    <GripVertical
                      className="text-text-tertiary/40 w-3 h-3 cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0"
                      aria-label={t('buddy.dreamFundDragReorder', { defaultValue: 'Drag to reorder' })}
                      onPointerDown={dragReorder.onHandlePointerDown(fund.id)}
                    />
                  )}
                  {!isDemo && dreamFunds.length > 1 && (
                    <FundMedal achieved={!isSavingsFund && fund.current >= fund.target} label={_index + 1} />
                  )}
                  <span className="text-base">{fund.emoji}</span>
                  <span className="text-sm font-medium text-text-primary">
                    {fund.id === SAVINGS_FUND_ID ? t('buddy.dreamFundSavings', { defaultValue: 'Savings' }) : fund.name}
                  </span>
                  {/* 🛡️ batch6-b: 守护目标基金徽章 — 拦截省下的钱默认流向这里 */}
                  {!isDemo && guardTargetId === fund.id && (
                    <span
                      className="text-[9px] text-emerald-400/90 border border-emerald-500/25 bg-emerald-500/10 rounded-full px-1.5 py-px whitespace-nowrap"
                      data-testid={`guard-target-badge-${fund.id}`}
                    >
                      🛡️ {t('buddy.dreamFund.guardTargetBadge', { defaultValue: 'Guard target' })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {fund.id === SAVINGS_FUND_ID ? (
                    <span className="text-xs text-text-secondary">
                      {/* 🔧 PM-P2-8 fix: Savings 也显示 $ 符号 (与其他 fund 一致) */}
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
                        className="text-text-tertiary hover:text-cyan-400 transition-colors p-0.5 sm:opacity-0 sm:group-hover:opacity-100"
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
                          className="text-text-tertiary hover:text-red-400 transition-colors p-0.5 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={t('buddy.dreamFundDelete')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          disabled
                          className="text-text-tertiary/30 p-0.5 cursor-not-allowed"
                          aria-label={t('buddy.dreamFundDeleteDisabled', { defaultValue: 'At least 1 dream fund is required' })}
                          title={t('buddy.dreamFundDeleteDisabled', { defaultValue: 'At least 1 dream fund is required' })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Round 96: 进度条 - 满足 100% 时金色 + shimmer */}
              <div className="h-2 bg-glass-fill rounded-full overflow-hidden relative">
                {isSavingsFund ? (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400/60 via-purple-400/80 to-cyan-400/60 animate-pulse"
                    style={{ width: '100%' }}
                  />
                ) : (
                  <div
                    className={`h-full rounded-full transition-all duration-700 relative overflow-hidden ${
                      pct >= 100
                        ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500'
                        : 'bg-gradient-to-r from-cyan-400 to-purple-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  >
                    {/* Round 96: 满 100% 时 shimmer 光斑滑动 */}
                    {pct >= 100 && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                          backgroundSize: '200% 100%',
                          animation: 'fund-shimmer 2.5s var(--ease-in-out-soft) infinite',
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
              {!isSavingsFund && pct >= 100 && (
                <div
                  className="flex items-center gap-2 mt-1 relative"
                  style={{
                    animation: 'goal-reached-in 0.6s var(--ease-spring) backwards',
                    perspective: '200px',
                  }}
                >
                  {/* Round 96: 庆祝粒子 (只在首次到达 100% 时播放) */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none" style={{ perspective: '100px' }}>
                    {FUND_CELEBRATION_PARTICLES.map((p, i) => (
                      <span
                        key={i}
                        className="absolute rounded-full bg-amber-300"
                        style={{
                          width: '2px',
                          height: '2px',
                          left: '50%',
                          top: '50%',
                          // CSS vars 给 fund-particle-burst 动画使用
                          ['--tx' as string]: `${Math.cos(p.angle) * p.distance}px`,
                          ['--ty' as string]: `${Math.sin(p.angle) * p.distance}px`,
                          opacity: 0,
                          animation: `fund-particle-burst 1.2s var(--ease-out-expo) ${p.delay}s forwards`,
                          boxShadow: '0 0 4px rgba(251,191,36,0.9)',
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-300 font-medium flex items-center gap-1">
                    <span style={{
                      display: 'inline-block',
                      animation: 'star-spin 2.4s var(--ease-in-out-soft) infinite',
                      transformOrigin: 'center',
                    }}>★</span>
                    {t('buddy.goalReached')}
                  </p>
                  {!isDemo && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFund(fund);
                        setFundEditorMode('setNewGoal');
                        resetGoalFundIdRef.current = fund.id;
                        setShowFundEditor(true);
                      }}
                      className="text-[10px] text-amber-300 hover:text-amber-200 underline decoration-dotted transition-colors"
                    >
                      {t('buddy.setNewGoal', { defaultValue: 'Set a new goal →' })}
                    </button>
                  )}
                </div>
              )}
              {/* 🛡️ batch6-b: 守护构成拆线 — 该基金含守护转存时显示"其中守护攒下 X" (app 内可见, 精确到结算额) */}
              {(guardByFund[fund.id] || 0) > 0 && (
                <p className="text-[10px] text-emerald-400/80 mt-1 font-medium" data-testid={`guard-saved-line-${fund.id}`}>
                  {t('buddy.dreamFund.guardSavedLine', {
                    amount: formatCurrency(guardByFund[fund.id]),
                    defaultValue: `🛡️ ${formatCurrency(guardByFund[fund.id])} guarded in`,
                  })}
                </p>
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
                        // 🔧 镜子哲学: challenge_failed 不用 💔 (评判), 用 🌫️ (未看见)
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
                  {/* 🛡️ batch6-b: 守护目标设置 — 正面期待话术, 不评判未开始转存的基金 */}
                  {!isDemo && (
                    <div className="mt-2 pt-1.5 border-t border-glass-border/60">
                      {guardTargetId === fund.id ? (
                        <p className="text-[10px] text-emerald-400/80 leading-snug" data-testid={`guard-target-active-${fund.id}`}>
                          🛡️ {t('buddy.dreamFund.guardTargetBadge', { defaultValue: 'Guard target' })} — {t('buddy.dreamFund.guardTargetActiveHint', { defaultValue: 'Money your guards save lands here first.' })}
                        </p>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (draggedFundId !== null || dragReorder.wasDragJustEnded()) return;
                            handleSetGuardTarget(fund.id);
                          }}
                          className="text-[10px] text-text-tertiary hover:text-emerald-400 transition-colors"
                          aria-label={t('buddy.dreamFund.guardTargetSetAria', { defaultValue: 'Set as the guard target fund' })}
                        >
                          {t('buddy.dreamFund.guardTargetSet', { defaultValue: '🛡️ Set as guard target' })}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ====== Dream Fund Editor Modal (extracted to buddy/dream-fund-editor.tsx) ====== */}
      <DreamFundEditor
        open={showFundEditor}
        editingFund={editingFund}
        mode={fundEditorMode}
        existingFunds={dreamFunds}
        onClose={handleCloseFundEditor}
        onCreate={(fund) => onCreateDreamFund?.(fund)}
        onUpdate={(fundId, patch) => {
          if (resetGoalFundIdRef.current === fundId) {
            resetGoalFundIdRef.current = null;
            stateIdsRef.current.delete(fundId);
            resetDreamAchievement(fundId);
          }
          onUpdateDreamFund?.(fundId, patch);
        }}
        onToast={onToast}
      />
      <DreamAchievementOverlay fund={celebratedFund} onClose={() => setCelebratedFund(null)} />
    </div>
  );
}

// ============================================================
// Round 96: FundMedal — 进度满 100% 时触发 3D 翻转的金色奖牌
// ============================================================
function FundMedal({ achieved, label }: { achieved: boolean; label: number | string }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (achieved && !flipped) {
      // 50ms 延迟让 CSS transition 生效
      const t = setTimeout(() => setFlipped(true), 50);
      return () => clearTimeout(t);
    }
    // Round 96 P0-2 fix: 用户 setNewGoal 后 achieved=false, 重置 flipped 让下次再满 100% 时重新触发翻转
    if (!achieved && flipped) {
      setFlipped(false);
    }
  }, [achieved, flipped]);

  return (
    <span
      className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
        achieved
          ? 'bg-amber-500/25 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
          : 'bg-cyan-500/20 text-cyan-400'
      }`}
      style={{
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(360deg)' : 'rotateY(0deg)',
        transition: 'transform 1.2s var(--ease-spring)',
      }}
    >
      {achieved ? '★' : label}
    </span>
  );
}
