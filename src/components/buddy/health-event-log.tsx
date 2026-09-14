/**
 * Health Event Log — Display spending ↔ health connection
 *
 * 提取自 src/components/buddy-tab.tsx (Round 83 拆分)
 * 显示最近的健康事件 (冲动消费/退款/挑战完成等), 包含 loading/error/empty 状态。
 * 🔧 Round 90 QA: 新增 "View All" 弹窗 + 筛选 (All/Positive/Negative)
 */

'use client';

import { Activity, Clock, Trash2, X, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';
import { type HealthEvent, HEALTH_EVENT_ICONS, formatTimeAgo } from './constants';
import { apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { sanitizeDisplay } from '@/lib/display-sanitize';
import { useHourlyRate } from '@/hooks/use-hourly-rate';

interface HealthEventLogProps {
  healthEvents: HealthEvent[];
  isLoadingEvents: boolean;
  healthEventsError: string | null;
  onRetry: () => void;
  /** 🔧 镜子哲学 reset: 清空历史记录后回调 (让父组件刷新) */
  onCleared?: () => void;
  isDemo?: boolean;
}

// 🔧 PM-NEW-41 fix: 用 eventType 判断正负面
const POSITIVE_EVENT_TYPES = ['challenge_completed', 'challenge_reward', 'refund_boost', 'mindful_recovery', 'passive_recovery', 'revive'];
const NEGATIVE_EVENT_TYPES = ['impulse_damage', 'impulse_confessed', 'drain'];

type FilterType = 'all' | 'positive' | 'negative';

export function HealthEventLog({
  healthEvents,
  isLoadingEvents,
  healthEventsError,
  onRetry,
  onCleared,
  isDemo = false,
}: HealthEventLogProps) {
  const { t } = useI18n();
  // 🔧 P0-2 fix (2026-07-17): 拿当前时薪, 与历史事件 snapshot 对比,
  //   如果不同则展示「at $X/hr then」让用户理解历史 hours 是按当时时薪算的
  const { hourlyRate: currentHourlyRate } = useHourlyRate(isDemo);
  const [isClearing, setIsClearing] = useState(false);
  // 🔧 Round 90 QA: View All modal state
  const [showAllModal, setShowAllModal] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const modalRef = useRef<HTMLDivElement>(null);

  const handleClearHistory = async () => {
    if (isDemo) {
      onCleared?.();
      return;
    }
    setIsClearing(true);
    try {
      await apiFetchVoid('/api/buddy/health-events', { method: 'DELETE' });
      onCleared?.();
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[HealthEventLog] Failed to clear history:', err);
    } finally {
      setIsClearing(false);
    }
  };

  // 🔧 Round 90 QA: Modal escape + click outside + body scroll lock
  useEffect(() => {
    if (!showAllModal) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAllModal(false); };
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setShowAllModal(false);
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    // Round 105 P0-1 fix: 不再操作 body overflow — CompanionDetailModal 已锁定 body
    //   旧代码 cleanup 会把 body overflow 恢复为 '', 但 modal 仍打开, 导致背景可滚动
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAllModal]);

  // 🔧 Round 90 QA: Filtered events for modal
  const filteredEvents = useMemo(() => {
    if (filter === 'positive') return healthEvents.filter(e => POSITIVE_EVENT_TYPES.includes(e.eventType));
    if (filter === 'negative') return healthEvents.filter(e => NEGATIVE_EVENT_TYPES.includes(e.eventType));
    return healthEvents;
  }, [healthEvents, filter]);

  const positiveCount = healthEvents.filter(e => POSITIVE_EVENT_TYPES.includes(e.eventType)).length;
  const negativeCount = healthEvents.filter(e => NEGATIVE_EVENT_TYPES.includes(e.eventType)).length;

  // 🔧 Round 90 QA: Render single event row (shared between inline + modal)
  const renderEvent = (event: HealthEvent, fullText = false) => {
    const eventConfig = HEALTH_EVENT_ICONS[event.eventType] || HEALTH_EVENT_ICONS.manual_adjustment;
    const isPositive = POSITIVE_EVENT_TYPES.includes(event.eventType);
    const isNegative = NEGATIVE_EVENT_TYPES.includes(event.eventType);
    const timeAgo = formatTimeAgo(new Date(event.createdAt), t);
    const safeDesc = sanitizeDisplay(event.description);
    // 🔧 P0-2 fix (2026-07-17): 提取 snapshot hourly_rate, 若与当前时薪不同则展示标注
    //   历史事件可能按旧时薪算 (用户后来改了时薪), 展示「at $X/hr then」让用户理解
    const snapshotRate = event.metadata?.hourly_rate_snapshot;
    const hasSnapshot = typeof snapshotRate === 'number' && Number.isFinite(snapshotRate) && snapshotRate > 0;
    const showRateNote = hasSnapshot && Math.abs(snapshotRate - currentHourlyRate) > 0.01;
    const rateNoteText = showRateNote
      ? t('buddy.healthEventRateNote', {
          defaultValue: 'at ${rate}/hr then',
          rate: (snapshotRate as number).toFixed(0),
        })
      : '';
    return (
      <div
        key={event.id}
        className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all ${
          isPositive
            ? 'bg-emerald-500/5 border border-emerald-500/10'
            : isNegative
              ? 'bg-red-500/5 border border-red-500/10'
              : 'bg-glass-fill border border-glass-border'
        }`}
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${eventConfig.color}`}>
          {eventConfig.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs text-text-primary ${fullText ? '' : 'truncate'}`}>
            {(() => {
              if (fullText) return safeDesc;
              return safeDesc.length > 80 ? safeDesc.substring(0, 80) + '...' : safeDesc;
            })()}
          </p>
          <p className="text-[10px] text-text-tertiary flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {timeAgo}
            {showRateNote && (
              <span className="text-text-tertiary/70 ml-1" title={t('buddy.healthEventRateNoteTooltip', { defaultValue: 'Hours were calculated using your hourly rate at that time' })}>
                · {rateNoteText}
              </span>
            )}
          </p>
        </div>
        {event.vitalityChange !== 0 && (
          <div
            className={`text-sm font-bold flex-shrink-0 ${event.vitalityChange > 0 ? 'text-green-400' : 'text-red-400'}`}
            title={t('buddy.healthImpactTooltip', { defaultValue: 'Mood change from this moment' })}
          >
            {event.vitalityChange > 0 ? '+' : ''}{event.vitalityChange}
          </div>
        )}
        {event.vitalityChange === 0 && (
          <div
            className="text-sm font-bold flex-shrink-0 text-text-tertiary/50"
            title={t('buddy.healthImpactZeroTooltip', { defaultValue: 'No mood change (rewards: tokens/XP/badges)' })}
          >
            —
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative z-10 px-4 py-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          {t('buddy.healthLog')}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary">{t('buddy.spendingImpactsCompanion')}</span>
          {/* 🔧 镜子哲学 reset: 清空历史记录按钮 */}
          {healthEvents.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={isClearing}
              title={t('buddy.clearHistory', { defaultValue: 'Clear history' })}
              className="text-[10px] text-text-tertiary hover:text-red-400 transition-colors flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              {isClearing ? '...' : t('buddy.clearHistory', { defaultValue: 'Clear' })}
            </button>
          )}
        </div>
      </div>
      {isLoadingEvents ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-glass-fill animate-pulse">
              <div className="w-7 h-7 rounded-full bg-glass-fill" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-glass-fill rounded w-3/4" />
                <div className="h-2 bg-glass-fill rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : healthEventsError ? (
        // 🔧 ARCH fix (Round 40 MEDIUM-2): 首次加载失败显示错误 + retry
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs text-red-400">{healthEventsError}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-[10px] text-text-tertiary hover:text-text-secondary underline"
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      ) : healthEvents.length === 0 ? (
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-xs text-text-tertiary">{t('buddy.noHealthEvents')}</p>
          <p className="text-[10px] text-text-tertiary mt-1">
            {t('buddy.healthEventsDesc')}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {/* 🔧 PM-NEW-68 fix: 显示 5 条 (inline), 点 View All 看全部 */}
            {healthEvents.slice(0, 5).map((event) => renderEvent(event))}
          </div>
          {/* 🔧 Round 90 QA: View All button + modal */}
          {healthEvents.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllModal(true)}
              className="w-full mt-2 py-2 rounded-xl bg-glass-fill border border-glass-border text-text-secondary text-xs font-medium hover:bg-glass-fill-strong hover:text-text-primary transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              {t('buddy.viewAllEvents', { defaultValue: 'View all {count} events', count: healthEvents.length })}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </>
      )}

      {/* 🔧 Round 90 QA: View All Modal with filters */}
      {showAllModal && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            ref={modalRef}
            className="relative w-full max-w-sm bg-surface-2 border border-glass-border rounded-2xl shadow-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-t-2xl" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-glass-border">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                {t('buddy.healthLogAllTitle', { defaultValue: 'All Events' })}
              </h3>
              <button
                onClick={() => setShowAllModal(false)}
                className="w-6 h-6 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center"
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 px-5 py-3 border-b border-glass-border">
              {([
                { key: 'all' as const, label: t('buddy.filterAll', { defaultValue: 'All' }), count: healthEvents.length },
                { key: 'positive' as const, label: t('buddy.filterPositive', { defaultValue: 'Positive' }), count: positiveCount },
                { key: 'negative' as const, label: t('buddy.filterNegative', { defaultValue: 'Negative' }), count: negativeCount },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all ${
                    filter === tab.key
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-glass-fill text-text-tertiary border border-glass-border hover:text-text-secondary'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3 space-y-1.5">
              {filteredEvents.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-8">
                  {t('buddy.noEventsInFilter', { defaultValue: 'No events in this filter' })}
                </p>
              ) : (
                filteredEvents.map(event => renderEvent(event, true))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-glass-border">
              <p className="text-[10px] text-text-tertiary text-center">
                {t('buddy.eventsCount', { defaultValue: '{count} events total', count: healthEvents.length })}
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
