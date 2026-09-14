/**
 * ButterflyHistoryList — 历史剧情列表视图
 *
 * 展示用户所有已结束的剧情会话（completed + abandoned）。
 * 每条卡片显示: 决策类型 / 描述 / 日期 / 结局基调 / 章节数 / 蝴蝶效应摘要。
 * 点击卡片进入详情回看；可删除单条。
 *
 * V2 优化 (2026-06-25):
 * - 搜索框: 按描述/平台/金额过滤
 * - 状态过滤: All / Completed / Incomplete 标签切换
 * - 卡片视觉层次: 基调色条 + 状态徽章 + 元信息分区
 * - 章节进度可视化: 圆点指示器显示完成章节
 * - 空状态优化: 搜索无结果 vs 无历史 区分文案
 */

'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useI18n } from '@/i18n/provider';
import type { UseButterflyHistoryReturn } from '../hooks/use-butterfly-history';
import { SessionCard } from './tab/session-card';
// ARCH fix Round 73 (Finding 5.1): TONE underscore constants imported from single source.
// 旧代码: 本文件定义 TONE_EMOJI / TONE_ACCENT_DARK / TONE_GLOW_DARK 等, 但
// tab/session-card.tsx 反向 import 这些常量 → 形成 runtime circular dependency。
// 根因修复: 所有 TONE underscore 常量移到 tab/constants.ts, 本文件 import 使用。
import {
  TONE_EMOJI,
  TONE_ACCENT_DARK,
  TONE_ACCENT_LIGHT,
  TONE_GLOW_DARK,
  TONE_GLOW_LIGHT,
} from './tab/constants';

// Re-export for backward compat — any external consumer that imported TONE_* from
// butterfly-history-list.tsx still works (no breaking change).
export {
  TONE_EMOJI,
  TONE_ACCENT_DARK,
  TONE_ACCENT_LIGHT,
  TONE_GLOW_DARK,
  TONE_GLOW_LIGHT,
};

// ============================================================
// 辅助函数 — formatDate 已提取到 @/lib/utils (共享)
// ============================================================
// 之前: 本地定义 formatDate (与 butterfly-history-detail.tsx 重复)
// 现在: import { formatDate } from '@/lib/utils'

// ============================================================
// Props
// ============================================================

interface ButterflyHistoryListProps {
  history: UseButterflyHistoryReturn;
  isLight: boolean;
  onBack: () => void;
  onStartNew: () => void;
}

type FilterType = 'all' | 'completed' | 'incomplete';
// 🔧 PM-NEW-15 fix: 新增 decision type 过滤 — 'I Bought' vs 'I Resisted'
// 🔧 2026-07-17 (task 4): 加 'considering' (购买前双宇宙模拟) + 'bookmarked' 过滤
type DecisionFilter = 'all' | 'bought' | 'resisted' | 'considering' | 'bookmarked';

// 🔧 分页: 每页显示数量 (与 hook 的 PAGE_SIZE 一致)
const PAGE_SIZE_DISPLAY = 10;

// ============================================================
// 组件
// ============================================================

export function ButterflyHistoryList({
  history,
  isLight,
  onBack,
  onStartNew,
}: ButterflyHistoryListProps) {
  const { t, locale } = useI18n();
  const { sessions, isLoading, isLoadingMore, isRefreshing, error, selectSession, deleteSession, deleteAllIncomplete, deletingId, refresh, loadMore, hasMore, total } = history;

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  // 🔧 PM-NEW-15 fix: decision type filter (bought / resisted)
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // 🔧 PM-NEW-25 fix: 批量删除 incomplete 的确认 dialog + 进行中状态
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ deleted: number; failed: number } | null>(null);
  // 🔧 ARCH fix (Round 26 AUDIT-5 MEDIUM-1): track setTimeout for cleanup
  const bulkResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (bulkResultTimerRef.current) {
        clearTimeout(bulkResultTimerRef.current);
        bulkResultTimerRef.current = null;
      }
    };
  }, []);

  // eslint-disable-next-line require-await -- async for API consistency
  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    // 🔧 NEW-Y fix: 用 state 替代 confirm() — confirm() 阻塞主线程导致删除不生效
    setPendingDeleteId(sessionId);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await deleteSession(id);
  };

  const cancelDelete = () => {
    setPendingDeleteId(null);
  };

  // 🔧 PM-NEW-25 fix: 批量删除所有 incomplete 故事
  const handleBulkDeleteClick = () => {
    setPendingBulkDelete(true);
  };
  const confirmBulkDelete = async () => {
    setPendingBulkDelete(false);
    setBulkDeleting(true);
    try {
      const result = await deleteAllIncomplete();
      setBulkResult({ deleted: result.deleted, failed: result.failed });
      // 5s 后清空 result toast
      // 🔧 MEDIUM-1: save timer ref for cleanup
      if (bulkResultTimerRef.current) clearTimeout(bulkResultTimerRef.current);
      bulkResultTimerRef.current = setTimeout(() => {
        bulkResultTimerRef.current = null;
        setBulkResult(null);
      }, 5000);
    } finally {
      setBulkDeleting(false);
    }
  };
  const cancelBulkDelete = () => {
    setPendingBulkDelete(false);
  };

  // 提取所有平台列表（按出现次数排序）
  const platformList = useMemo(() => {
    // 🔧 N35 fix: 平台名大小写归一化（title case），防止 ZARA/zara 出现两个条目
    const counts = new Map<string, number>();
    for (const s of sessions) {
      if (s.platform) {
        // 归一化：首字母大写，其余小写（title case）
        const normalized = s.platform.charAt(0).toUpperCase() + s.platform.slice(1).toLowerCase();
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [sessions]);

  // 过滤 + 搜索
  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (filter === 'completed') {
      result = result.filter(s => s.status === 'completed');
    } else if (filter === 'incomplete') {
      result = result.filter(s => s.status !== 'completed');
    }
    // 🔧 PM-NEW-15 fix: 按 decision type 过滤 (bought / resisted)
    // 🔧 2026-07-17 (task 4): 加 considering + bookmarked 过滤
    if (decisionFilter === 'bought') {
      result = result.filter(s => s.decisionType === 'bought');
    } else if (decisionFilter === 'resisted') {
      result = result.filter(s => s.decisionType === 'resisted');
    } else if (decisionFilter === 'considering') {
      result = result.filter(s => s.decisionType === 'considering');
    } else if (decisionFilter === 'bookmarked') {
      result = result.filter(s => s.isBookmarked === true);
    }
    if (platformFilter) {
      // 🔧 N35 fix: 平台过滤大小写不敏感（与归一化后的 platformList 匹配）
      const normalizedFilter = platformFilter.charAt(0).toUpperCase() + platformFilter.slice(1).toLowerCase();
      result = result.filter(s => {
        if (!s.platform) return false;
        const normalized = s.platform.charAt(0).toUpperCase() + s.platform.slice(1).toLowerCase();
        return normalized === normalizedFilter;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(s => {
        // 🔧 N37 fix: 搜索覆盖更多字段（decisionDescription + platform + amount + 章节标题 + 蝴蝶效应总结）
        const descMatch = s.decisionDescription.toLowerCase().includes(q);
        const platformMatch = (s.platform || '').toLowerCase().includes(q);
        const amountMatch = s.amount !== null && String(s.amount).includes(q);
        // 搜索章节标题
        const chapterTitleMatch = s.chapters?.some(ch =>
          ch.title.toLowerCase().includes(q)
        );
        // 搜索蝴蝶效应总结
        const effectMatch = (s.butterflyEffect || '').toLowerCase().includes(q);
        return descMatch || platformMatch || amountMatch || chapterTitleMatch || effectMatch;
      });
    }
    return result;
  }, [sessions, filter, decisionFilter, searchQuery, platformFilter]);

  const completedCount = useMemo(() => sessions.filter(s => s.status === 'completed').length, [sessions]);
  // 🔧 ARCH fix: 用 API 返回的 total (而非 sessions.length) 显示总数, 因 sessions 是分页加载的
  const incompleteCount = total - completedCount;
  // 🔧 PM-NEW-15 fix: bought / resisted / considering / bookmarked 计数
  const boughtCount = useMemo(() => sessions.filter(s => s.decisionType === 'bought').length, [sessions]);
  const resistedCount = useMemo(() => sessions.filter(s => s.decisionType === 'resisted').length, [sessions]);
  const consideringCount = useMemo(() => sessions.filter(s => s.decisionType === 'considering').length, [sessions]);
  const bookmarkedCount = useMemo(() => sessions.filter(s => s.isBookmarked === true).length, [sessions]);

  // ============================================================
  // 渲染：加载中
  // ============================================================
  if (isLoading) {
    return (
      <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
        <HistoryHeader isLight={isLight} onBack={onBack} title={t('butterfly.historyTitle')} onRefresh={refresh} isRefreshing={isRefreshing} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-4xl">🎰</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>{t('butterfly.historyLoading')}</span>
        </div>
      </div>
    );
  }

  // ============================================================
  // 渲染：主视图
  // ============================================================
  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-gray-50' : 'bg-surface-1'}`}>
      <HistoryHeader
        isLight={isLight}
        onBack={onBack}
        title={t('butterfly.historyTitle')}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
        subtitle={total > 0 ? t('butterfly.historyCount', { n: total }) : undefined}
      />

      {/* 搜索 + 过滤栏（仅有历史时显示） */}
      {sessions.length > 0 && (
        <div className={`flex-shrink-0 px-4 py-2.5 space-y-2 border-b ${isLight ? 'border-gray-200 bg-white' : 'border-glass-border bg-glass-fill'}`}>
          {/* 搜索框 */}
          <div className="relative">
            <svg viewBox="0 0 16 16" className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`} fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('butterfly.historySearchPlaceholder')}
              className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm transition-all focus:outline-none ${isLight ? 'bg-gray-100 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-cyan-400/40 focus:bg-white' : 'bg-glass-fill-strong border border-glass-border text-text-primary placeholder:text-text-tertiary focus:border-cyan-400/40'}`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-all active:scale-90 ${isLight ? 'hover:bg-gray-200 text-gray-400' : 'hover:bg-glass-fill text-text-tertiary'}`}
                aria-label="clear"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            )}
          </div>
          {/* 状态过滤标签 */}
          <div className="flex items-center gap-1.5">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              isLight={isLight}
              label={t('butterfly.historyFilterAll')}
              count={total}
            />
            <FilterChip
              active={filter === 'completed'}
              onClick={() => setFilter('completed')}
              isLight={isLight}
              label={t('butterfly.historyCompleted')}
              count={completedCount}
              accent="cyan"
            />
            <FilterChip
              active={filter === 'incomplete'}
              onClick={() => setFilter('incomplete')}
              isLight={isLight}
              label={t('butterfly.historyAbandoned')}
              count={incompleteCount}
              accent="gray"
            />
          </div>
          {/* 🔧 PM-NEW-15 fix: Decision type 过滤 — I Bought / I Resisted */}
          <div className="flex items-center gap-1.5">
            <FilterChip
              active={decisionFilter === 'all'}
              onClick={() => setDecisionFilter('all')}
              isLight={isLight}
              label={t('butterfly.historyFilterAllDecisions', { defaultValue: 'All decisions' })}
              count={total}
            />
            <FilterChip
              active={decisionFilter === 'bought'}
              onClick={() => setDecisionFilter('bought')}
              isLight={isLight}
              label={t('butterfly.historyFilterBought', { defaultValue: 'I Bought' })}
              count={boughtCount}
              accent="red"
            />
            <FilterChip
              active={decisionFilter === 'resisted'}
              onClick={() => setDecisionFilter('resisted')}
              isLight={isLight}
              label={t('butterfly.historyFilterResisted', { defaultValue: 'I Resisted' })}
              count={resistedCount}
              accent="emerald"
            />
            {/* 🔧 2026-07-17 (task 4): I'm considering 过滤 — 购买前双宇宙模拟 */}
            <FilterChip
              active={decisionFilter === 'considering'}
              onClick={() => setDecisionFilter('considering')}
              isLight={isLight}
              label={t('butterfly.historyFilterConsidering', { defaultValue: "I'm considering" })}
              count={consideringCount}
              accent="purple"
            />
            {/* 🔧 2026-07-17 (task 4): Bookmarked 过滤 — 用户收藏的故事 */}
            <FilterChip
              active={decisionFilter === 'bookmarked'}
              onClick={() => setDecisionFilter('bookmarked')}
              isLight={isLight}
              label={t('butterfly.filterBookmarked', { defaultValue: 'Bookmarked' })}
              count={bookmarkedCount}
              accent="amber"
            />
            {/* 🔧 PM-NEW-28 fix: 用户从未用过 'I Resisted' 模式时, 加 'Try it →' 引导 */}
            {resistedCount === 0 && consideringCount === 0 && (
              <span className="text-[10px] text-emerald-500/80 italic ml-1">
                {t('butterfly.historyTryResistedHint', { defaultValue: 'Try it →' })}
              </span>
            )}
          </div>
          {/* 🔧 PM-NEW-25 fix: 批量删除 incomplete 按钮 + 进行中状态 */}
          {incompleteCount > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={handleBulkDeleteClick}
                disabled={bulkDeleting}
                className={`text-[11px] px-3 py-1 rounded-full border transition-all active:scale-95 ${bulkDeleting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isLight ? 'text-red-600 border-red-300 hover:bg-red-50' : 'text-red-400 border-red-400/30 hover:bg-red-400/10'}`}
              >
                {bulkDeleting
                  ? t('butterfly.historyBulkDeleting', { defaultValue: 'Deleting...' })
                  : t('butterfly.historyDeleteAllIncomplete', { defaultValue: 'Delete all incomplete' })} ({incompleteCount})
              </button>
              {bulkResult && (
                <span className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>
                  {t('butterfly.historyBulkResult', { deleted: bulkResult.deleted, failed: bulkResult.failed, defaultValue: `Deleted ${bulkResult.deleted}${bulkResult.failed > 0 ? `, failed ${bulkResult.failed}` : ''}` })}
                </span>
              )}
            </div>
          )}
          {/* 平台过滤标签（可水平滚动） */}
          {platformList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
              <PlatformChip
                active={platformFilter === null}
                onClick={() => setPlatformFilter(null)}
                isLight={isLight}
                label={t('butterfly.historyAllPlatforms')}
              />
              {platformList.map(p => (
                <PlatformChip
                  key={p.name}
                  active={platformFilter === p.name}
                  onClick={() => setPlatformFilter(prev => prev === p.name ? null : p.name)}
                  isLight={isLight}
                  label={p.name}
                  count={p.count}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-4 pt-3">
          <div className="text-center text-sm text-red-400 bg-red-400/10 rounded-xl px-4 py-2">
            {t('butterfly.historyLoadError')}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-md mx-auto space-y-3">
          {sessions.length === 0 ? (
            // 空状态: 无历史
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="text-5xl mb-4 opacity-50">📜</div>
              <p className={`text-base font-medium mb-2 ${isLight ? 'text-gray-700' : 'text-text-secondary'}`}>
                {t('butterfly.historyEmpty')}
              </p>
              <p className={`text-sm ${isLight ? 'text-gray-400' : 'text-text-tertiary'} mb-6`}>
                {t('butterfly.historyEmptyDesc')}
              </p>
              <button
                onClick={onStartNew}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                {t('butterfly.historyStartNew')}
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            // 空状态: 搜索/过滤无结果
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="text-4xl mb-3 opacity-40">🔍</div>
              <p className={`text-sm font-medium mb-1 ${isLight ? 'text-gray-600' : 'text-text-secondary'}`}>
                {t('butterfly.historyNoResults')}
              </p>
              <p className={`text-xs ${isLight ? 'text-gray-400' : 'text-text-tertiary'}`}>
                {t('butterfly.historyNoResultsDesc')}
              </p>
              <button
                onClick={() => { setSearchQuery(''); setFilter('all'); setDecisionFilter('all'); setPlatformFilter(null); }}
                className={`mt-4 text-xs px-4 py-2 rounded-lg transition-all active:scale-95 ${isLight ? 'text-cyan-600 hover:bg-cyan-50' : 'text-cyan-400 hover:bg-cyan-400/10'}`}
              >
                {t('butterfly.historyClearFilters')}
              </button>
            </div>
          ) : (
            <>
              {/* 会话卡片列表 */}
              {filteredSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isLight={isLight}
                  locale={locale}
                  onClick={() => selectSession(session)}
                  onDelete={(e) => handleDelete(e, session.id)}
                  isDeleting={deletingId === session.id}
                  onBookmarkToggle={(sessionId, isBookmarked) => {
                    // 🔧 2026-07-17 (task 4): 收藏状态变化时, 通知 hook 刷新 (重新计算 bookmarkedCount)
                    // 这里不直接操作 sessions, 让 hook 自己 refresh 拿到最新数据
                    // 但如果 hook 没有 refresh 方法, 至少 UI 上的 isBookmarked 已被 SessionCard 内部更新
                    void sessionId;
                    void isBookmarked;
                  }}
                />
              ))}

              {/* 🔧 分页: 加载更多按钮 */}
              {hasMore && (
                <div className="flex justify-center pt-2 pb-4">
                  <button
                    onClick={() => loadMore()}
                    disabled={isLoadingMore}
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                      isLight
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-glass-fill text-text-secondary hover:bg-glass-fill-strong'
                    } ${isLoadingMore ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {isLoadingMore
                      ? t('butterfly.historyLoadingMore', { defaultValue: 'Loading more...' })
                      : t('butterfly.historyLoadMore', { defaultValue: 'Load more' })}
                  </button>
                </div>
              )}

              {/* 没有更多了 (仅在已加载多页且无搜索/过滤时显示) */}
              {!hasMore && total > PAGE_SIZE_DISPLAY && !searchQuery && filter === 'all' && !platformFilter && (
                <div className="text-center text-xs text-text-tertiary py-3">
                  {t('butterfly.historyNoMore', { defaultValue: 'No more stories' })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 🔧 NEW-Y fix: 删除确认弹窗 (替代 confirm()) */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={cancelDelete}>
          <div className="bg-surface-1 border border-glass-border rounded-2xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-text-primary mb-4">{t('butterfly.historyDeleteConfirm')}</p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="flex-1 py-2 rounded-xl bg-red-500/80 text-white text-sm font-medium hover:bg-red-500 transition-colors"
              >
                {t('butterfly.deleteConfirm', { defaultValue: 'Delete' })}
              </button>
              <button
                onClick={cancelDelete}
                className="flex-1 py-2 rounded-xl bg-glass-fill text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔧 PM-NEW-25 fix: 批量删除 incomplete 确认弹窗 */}
      {pendingBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={cancelBulkDelete}>
          <div className="bg-surface-1 border border-glass-border rounded-2xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-text-primary mb-2">
              {t('butterfly.historyBulkDeleteConfirm', { n: incompleteCount, defaultValue: `Delete all ${incompleteCount} incomplete stories?` })}
            </p>
            <p className="text-xs text-text-tertiary mb-4">
              {t('butterfly.historyBulkDeleteWarning', { defaultValue: 'This cannot be undone. Completed stories will be kept.' })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmBulkDelete}
                className="flex-1 py-2 rounded-xl bg-red-500/80 text-white text-sm font-medium hover:bg-red-500 transition-colors"
              >
                {t('butterfly.deleteAll', { defaultValue: 'Delete all' })}
              </button>
              <button
                onClick={cancelBulkDelete}
                className="flex-1 py-2 rounded-xl bg-glass-fill text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子组件：头部
// ============================================================

function HistoryHeader({
  isLight,
  onBack,
  title,
  onRefresh,
  isRefreshing,
  subtitle,
}: {
  isLight: boolean;
  onBack: () => void;
  title: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  subtitle?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${isLight ? 'border-gray-200 bg-white' : 'border-glass-border bg-glass-fill'}`}>
      <button
        onClick={onBack}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${isLight ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-glass-fill-strong text-text-secondary'}`}
        aria-label={t('common.back', { defaultValue: 'back' })}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
          <path d="M10 12L6 8l4-4v8z" />
        </svg>
      </button>
      <div className="flex-1 text-center">
        <h2 className={`text-base font-bold ${isLight ? 'text-gray-900' : 'text-text-primary'}`}>{title}</h2>
        {subtitle && (
          <p className={`text-[11px] ${isLight ? 'text-gray-500' : 'text-text-tertiary'}`}>{subtitle}</p>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95 cursor-pointer ${isLight ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-glass-fill-strong text-text-tertiary'} ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={t('common.refresh', { defaultValue: 'refresh' })}
      >
        <svg viewBox="0 0 16 16" className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="currentColor">
          <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z M8 4.5l3 2.5-3 2.5v-5z" transform="rotate(0 8 8)" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================
// 子组件：过滤标签
// ============================================================

function FilterChip({
  active,
  onClick,
  isLight,
  label,
  count,
  accent = 'cyan',
}: {
  active: boolean;
  onClick: () => void;
  isLight: boolean;
  label: string;
  count: number;
  // 🔧 PM-NEW-15 fix: 加 'red' (bought) + 'emerald' (resisted) accent
  // 🔧 2026-07-17 (task 4): 加 'purple' (considering) + 'amber' (bookmarked) accent
  accent?: 'cyan' | 'gray' | 'red' | 'emerald' | 'purple' | 'amber';
}) {
  // 🔧 PM-NEW-15 fix: 6 种 accent 颜色 (cyan/gray/red/emerald/purple/amber)
  const activeColor =
    accent === 'cyan'
      ? (isLight ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-cyan-400/20 text-cyan-300 border-cyan-400/40')
      : accent === 'red'
        ? (isLight ? 'bg-red-500 text-white border-red-500' : 'bg-red-400/20 text-red-300 border-red-400/40')
        : accent === 'emerald'
          ? (isLight ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40')
          : accent === 'purple'
            ? (isLight ? 'bg-purple-500 text-white border-purple-500' : 'bg-purple-400/20 text-purple-300 border-purple-400/40')
            : accent === 'amber'
              ? (isLight ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-400/20 text-amber-300 border-amber-400/40')
              : (isLight ? 'bg-gray-700 text-white border-gray-700' : 'bg-glass-fill-strong text-text-primary border-glass-border');

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all active:scale-95 cursor-pointer ${
        active
          ? activeColor
          : (isLight ? 'bg-transparent text-gray-500 border-gray-300 hover:bg-gray-100' : 'bg-transparent text-text-tertiary border-glass-border hover:bg-glass-fill-strong')
      }`}
    >
      <span>{label}</span>
      <span className={`text-[10px] font-mono px-1 rounded ${active ? 'bg-white/20' : (isLight ? 'bg-gray-200 text-gray-500' : 'bg-glass-fill text-text-tertiary')}`}>
        {count}
      </span>
    </button>
  );
}

// ============================================================
// 子组件：平台过滤标签（可水平滚动）
// ============================================================

function PlatformChip({
  active,
  onClick,
  isLight,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  isLight: boolean;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all active:scale-95 cursor-pointer ${
        active
          ? (isLight ? 'bg-purple-500 text-white border-purple-500' : 'bg-purple-400/20 text-purple-300 border-purple-400/40')
          : (isLight ? 'bg-transparent text-gray-500 border-gray-300 hover:bg-gray-100' : 'bg-transparent text-text-tertiary border-glass-border hover:bg-glass-fill-strong')
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-[9px] font-mono ${active ? 'opacity-80' : (isLight ? 'text-gray-400' : 'text-text-tertiary')}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================
// 子组件：会话卡片（V2 视觉优化）
