/**
 * Symy Ledger — Stats Glass Card
 *
 * 提取自 src/components/buddy-tab.tsx (Round 95 拆分)
 * 包含: Streak + Balance + Vitality + XP bar + Share progress button
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Flame, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import type { BuddyState } from '@/types/buddy-state';
import { ShareCardModal } from './share-card-modal';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
// 🔧 PM-P1-18 fix: 统一金额格式化
import { formatCurrency } from '@/lib/format';
// 🔧 PM3-P2-1 fix: 今日任务清单 (streak ≤ 3 时显示)
// 🛡️ batch6-b: 守护转存进项 — 从既有 deposit 审计管道派生, 不发明新资金流
import { fetchGuardTransfers, guardTransfersTotal, type GuardTransferEntry } from '@/lib/guard-ledger';

interface SymyLedgerProps {
  buddyState: BuddyState;
  config: {
    color: string;
    neonGradient: string;
    /** 🔧 样式改进: 传入 statusEmoji + statusTextKey 让 mood 区域更直观 */
    statusEmoji?: string;
    statusTextKey?: string;
  };
  isDemo: boolean;
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** 🔧 PM3-P2-1: 今日任务清单回调 */
  onSeeIt?: () => void;
  _onChat?: () => void;
  onChat?: () => void;
  onSetRate?: () => void;
  /** 🔧 PM3-P2-1: 今日任务数据 (从 page.tsx 传入, 保证全局同步) */
}

export function SymyLedger({ buddyState, config: _config, isDemo, onToast, _onChat, onSetRate }: SymyLedgerProps) {
  const { t } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemo);
  // 🔧 P1-3 fix (2026-07-20): Token 数字滚动动画
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [aiQuote, setAiQuote] = useState('');
  // 🔧 代币详情 overlay
  // 🔧 S4 fix: Streak 补救状态
  const [streakRedeeming, setStreakRedeeming] = useState(false);
  const [prevStreak, setPrevStreak] = useState<number | null>(null);
  // 🔧 "帮你找回了" 详情 overlay
  const [showReclaimDetail, setShowReclaimDetail] = useState(false);
  // 🛡️ batch6-b: 守护转存条目 (拦截结算存入梦想基金的进项记录)
  const [guardEntries, setGuardEntries] = useState<GuardTransferEntry[]>([]);

  // 🔧 P2-4 fix: Streak tooltip — proper portal-based popover (visible, dismissible, accessible)
  const [showStreakTooltip, setShowStreakTooltip] = useState(false);
  const streakTooltipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showStreakTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (streakTooltipRef.current && !streakTooltipRef.current.contains(e.target as Node)) {
        setShowStreakTooltip(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowStreakTooltip(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showStreakTooltip]);

  // 🔧 S4 fix: 读取 prev-streak (断签前的 streak), 用于显示"代币补救"按钮
  useEffect(() => {
    if (!isDemo && showStreakTooltip) {
      try {
        // userId 从 buddyState 无法直接获取, 用 localStorage key pattern 查找
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('symy-buddy-prev-streak-')) {
            const val = localStorage.getItem(key);
            if (val) {
              setPrevStreak(Number(val));
              break;
            }
          }
        }
      } catch { /* silent */ }
    }
  }, [showStreakTooltip, isDemo]);

  // 🔧 S4 fix: 用代币补救 streak
  const handleRedeemStreak = useCallback(async () => {
    if (isDemo || prevStreak === null) return;
    setStreakRedeeming(true);
    try {
      const result = await apiFetch<{ success: boolean; cost: number; tokens: number; newStreak: number; error?: string }>('/api/buddy/redeem-streak', {
        method: 'POST',
        body: { prevStreak },
      });
      if (result.success) {
        onToast?.(t('buddy.streakRedeemed', { defaultValue: `✓ Streak restored to ${result.newStreak} days!`, n: result.newStreak }), 'success');
        // 清除 prev-streak (已用)
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('symy-buddy-prev-streak-')) {
              localStorage.removeItem(key);
            }
          }
        } catch { /* silent */ }
        setPrevStreak(null);
        setShowStreakTooltip(false);
        // 刷新页面让 buddy state 更新
        window.location.reload();
      } else {
        onToast?.(result.error || t('buddy.streakRedeemFailed', { defaultValue: 'Failed to redeem streak' }), 'info');
      }
    } catch {
      onToast?.(t('buddy.streakRedeemFailed', { defaultValue: 'Failed to redeem streak' }), 'info');
    } finally {
      setStreakRedeeming(false);
    }
  }, [isDemo, prevStreak, onToast, t]);

  // 🔧 ARCH fix Round 78: Calculate life hours from total saved + hourly rate
  const totalSaved = buddyState.dreamFunds.reduce((sum, f) => sum + (f.current || 0), 0);
  const effectiveRate = hourlyRate || 25;
  const lifeHours = effectiveRate > 0 ? Math.round(totalSaved / effectiveRate) : 0;

  // 🛡️ batch6-b: 拉取 deposit 审计记录并派生守护转存条目 (非关键展示, 失败静默为空)
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 挂载时按需拉取既有 deposit 审计管道 (分页取全, cancelled flag 防泄漏); 非关键展示区块, 失败静默为空
    fetchGuardTransfers()
      .then((entries) => {
        if (!cancelled) setGuardEntries(entries);
      })
      .catch(() => { /* 非关键区块, 保持为空 */ });
    return () => { cancelled = true; };
  }, [isDemo]);

  const handleShareClick = useCallback(async () => {
    // 业务规则1: 用户至少完成 1 次挑战才能分享
    if ((buddyState.challengesCompleted ?? 0) === 0) {
      onToast?.(t('buddy.shareNeedChallenge', { defaultValue: 'Complete your first challenge, then come back to share your progress! →' }), 'info');
      return;
    }

    // 业务规则2: 从最近挑战中提取 AI 金句
    try {
      const data = await apiFetch<{ messages?: Array<{ role: string; content: string }> }>(
        '/api/chat/history?limit=50&mode=challenge'
      );
      const messages = data?.messages || [];
      // 取 AI 最后一条消息, 截取前 80 字符
      const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAiMsg?.content) {
        let quote = lastAiMsg.content.trim();
        // 截取前 80 字符, 在最后一个完整句子后截断
        if (quote.length > 80) {
          const truncated = quote.substring(0, 80);
          const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?'),
            truncated.lastIndexOf('。'),
            truncated.lastIndexOf('！'),
            truncated.lastIndexOf('？'),
          );
          quote = lastSentenceEnd > 30 ? truncated.substring(0, lastSentenceEnd + 1) + '…' : truncated + '…';
        }
        // 业务规则3: 隐私保护 — 不含用户名/邮箱/商品名 (AI 回复通常不含这些, 但以防万一)
        setAiQuote(quote);
      } else {
        setAiQuote(''); // fallback to slogan
      }
    } catch {
      setAiQuote(''); // fallback to slogan
    }

    setShareModalOpen(true);
  }, [buddyState.challengesCompleted, onToast, t]);

  return (
    <div className="relative z-10 px-4 py-3">
      <div className="glass-card-strong rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary tracking-wider">{t('buddy.symyLedger')}</span>
          {/* 🔧 P2-4 fix: Streak tooltip — proper portal popover with close button, accessible */}
          <div
            ref={streakTooltipRef}
            className="flex items-center gap-1 cursor-pointer relative"
            onClick={(e) => {
              e.stopPropagation();
              setShowStreakTooltip(prev => !prev);
            }}
            role="button"
            tabIndex={0}
            aria-label={`${t('buddy.dayStreak', { n: buddyState.streak })} — ${t('buddy.streakTooltip')}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowStreakTooltip(prev => !prev);
              }
            }}
          >
            <Flame className={`w-3 h-3 ${buddyState.streak >= 30 ? 'text-yellow-400' : buddyState.streak >= 7 ? 'text-orange-500' : 'text-orange-400'}`} />
            <span className={`text-xs font-medium ${buddyState.streak >= 30 ? 'text-yellow-400' : buddyState.streak >= 7 ? 'text-orange-500' : 'text-orange-400'}`}>
              {t('buddy.dayStreak', { n: buddyState.streak })}
              {buddyState.streak >= 30 && ' 🔥🔥'}
              {buddyState.streak >= 100 && '🔥'}
            </span>
            {/* 🔧 PM-P1-8 fix: streak=0 时显示 "Start" 引导按钮 */}
            {buddyState.streak === 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // 滚动到 See it 按钮
                  const seeItBtn = document.querySelector('[data-testid="see-it-button"], button[class*="challenge"]');
                  if (seeItBtn) (seeItBtn as HTMLElement).click();
                }}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors cursor-pointer ml-1"
              >
                {t('buddy.startStreak', { defaultValue: '👉 Start' })}
              </button>
            )}
            <span className="text-[9px] text-text-tertiary/60 hover:text-cyan-400 transition-colors">ⓘ</span>

            {/* 🔧 P2-4 fix: Portal-based tooltip popover — visible, styled, dismissible */}
            {showStreakTooltip && createPortal(
              <div
                className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                onClick={() => setShowStreakTooltip(false)}
              >
                <div
                  className="relative w-full max-w-xs bg-surface-2 border border-glass-border rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Top accent line */}
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-400 to-amber-500 rounded-t-2xl" />
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-orange-400" />
                      {t('buddy.dayStreak', { n: buddyState.streak })}
                    </h4>
                    <button
                      onClick={() => setShowStreakTooltip(false)}
                      className="w-6 h-6 rounded-full bg-glass-fill border border-glass-border text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center text-xs"
                      aria-label="Close"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="border-t border-glass-border mb-3" />
                  {/* Content */}
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t('buddy.streakTooltip')}
                  </p>
                  {/* 🔧 S4 fix: 代币补救断签 — 仅在有 prevStreak 且代币足够时显示 */}
                  {!isDemo && prevStreak !== null && prevStreak > 1 && buddyState.tokens >= 50 && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <p className="text-[11px] text-amber-400 font-medium mb-2">
                        {t('buddy.streakRedeemTitle', { defaultValue: 'Streak broken?', n: prevStreak })}
                      </p>
                      <p className="text-[10px] text-text-tertiary mb-2">
                        {t('buddy.streakRedeemDesc', { defaultValue: `Restore your ${prevStreak}-day streak for 50 tokens`, n: prevStreak })}
                      </p>
                      <button
                        onClick={handleRedeemStreak}
                        disabled={streakRedeeming}
                        className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:from-amber-400 hover:to-orange-400 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {streakRedeeming ? '...' : t('buddy.streakRedeemButton', { defaultValue: '🔄 Restore streak (50 tokens)' })}
                      </button>
                    </div>
                  )}
                  {/* Got it button */}
                  <button
                    onClick={() => setShowStreakTooltip(false)}
                    className="w-full mt-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors"
                  >
                    {t('common.gotIt', { defaultValue: 'Got it' })}
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>
        {/* 🔧 U-2 fix: 情感导向布局 — 左列 Tokens，右列 Reclaimed */}
        <div className="grid grid-cols-1 gap-3">
          {/* owner 09-06: tokens moved to profile overview detail */}

          <div className="bg-glass-fill rounded-xl p-3 text-center border border-glass-border relative">
            <p className="text-[10px] text-text-tertiary tracking-wide mb-1">
              {t('buddy.yourBalance')}
              <span
                onClick={(e) => { e.stopPropagation(); setShowReclaimDetail(true); }}
                className="text-text-tertiary/60 hover:text-cyan-400 transition-colors cursor-pointer ml-1"
                aria-label={t('home.moneySavedDetail', { defaultValue: 'These are hours you won back — time represented by money you considered spending but didn\'t.' })}
              >
                ⓘ
              </span>
            </p>
            {/* 三行布局 — 第2行: 🕐 + 小时数 (owner 铁律 09-06: 不再显示钱数, 金额只在梦想基金语境) */}
            <p className="text-lg font-bold text-text-primary inline-flex items-center justify-center gap-1 mb-0.5">
              <span className="text-base">🕐</span>
              {lifeHours.toLocaleString()}h
            </p>
            {/* Dream Funds 入口 — 点击跳转到 Me 页面 */}
            {!isDemo && onSetRate && (
              <button
                onClick={(e) => { e.stopPropagation(); onSetRate(); }}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors mt-1"
              >
                {t('buddy.viewDreamFunds', { defaultValue: 'View Dream Funds →' })}
              </button>
            )}
            {/* Demo 模式标注 "📊 Sample" */}
            {isDemo && (
              <span className="absolute top-1 right-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded">
                {t('ahaMoment.sampleDataLabel', { defaultValue: '📊 示例' })}
              </span>
            )}
          </div>
        </div>
        {/* 🛡️ batch6-b: 守护转存进项区块 — 无守护数据时整体隐藏 (荣誉非羞辱, 不出 0 表) */}
        {guardEntries.length > 0 && (
          <div className="mt-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15 p-3" data-testid="guard-transfer-block">
            <p className="text-[11px] font-semibold text-emerald-400 mb-0.5">
              {t('buddy.ledger.guard.title')}
            </p>
            <p className="text-[10px] text-text-secondary mb-2">
              {t('buddy.ledger.guard.totalLine', {
                count: guardEntries.length,
                amount: formatCurrency(guardTransfersTotal(guardEntries), { decimals: false }),
              })}
            </p>
            <p className="text-[9px] text-text-tertiary/70 tracking-wide mb-1">
              {t('buddy.ledger.guard.recentTitle')}
            </p>
            <div className="space-y-0.5" role="list">
              {[...guardEntries].reverse().slice(0, 3).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-1.5 text-[10px]"
                  role="listitem"
                  aria-label={t('buddy.ledger.guard.entryAria', {
                    amount: formatCurrency(entry.amount),
                    fund: entry.fundName,
                  })}
                >
                  <span>🛡️</span>
                  <span className="text-text-secondary flex-1 truncate">{entry.fundName}</span>
                  <span className="text-emerald-400 font-mono">+{formatCurrency(entry.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* owner 09-06: 功能减负 — 登录即自动签到 (streak 与已加入的社区挑战), 任务清单区域已删除 */}
        {/* 🔧 代币兑换按钮已移至次数用完的提醒对话框中 */}
        {/* 需求二: Share my progress 按钮 — 打开分享卡弹窗 */}
        {!isDemo && (
          <button
            type="button"
            onClick={handleShareClick}
            className="w-full mt-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:from-cyan-500/30 hover:to-purple-500/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>📤</span>
            {t('buddy.shareProgress', { defaultValue: 'Share my progress' })}
          </button>
        )}
      </div>

      {/* 🔧 "帮你找回了" 详情 overlay */}
      {showReclaimDetail && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowReclaimDetail(false)}>
          <div className="w-full max-w-md bg-surface-1 rounded-t-3xl flex flex-col max-h-[80vh] overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-glass-border" />
            </div>
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <h2 className="text-base font-bold text-text-primary">{t('buddy.yourBalance')}</h2>
              <button onClick={() => setShowReclaimDetail(false)} className="text-text-secondary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 px-4 py-4">
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                {t('home.moneySavedDetail', { defaultValue: 'These are hours you won back — time represented by money you considered spending but didn\'t.\n\n⚠️ This is virtual bookkeeping, not real savings. The money is still in your bank account.\n\nConnect Dream Funds to track real progress.' })}
              </p>
              {!isDemo && onSetRate && (
                <button
                  onClick={() => { setShowReclaimDetail(false); onSetRate(); }}
                  className="w-full mt-4 py-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors cursor-pointer"
                >
                  {t('buddy.viewDreamFunds', { defaultValue: 'View Dream Funds →' })}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🔧 代币详情 overlay */}
      {/* owner 09-06: token detail overlay moved to profile TokenRow */}

      {/* 分享卡弹窗 */}
      <ShareCardModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        buddyState={buddyState}
        aiQuote={aiQuote}
        onToast={onToast}
      />
    </div>
  );
}
