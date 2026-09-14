'use client';

/**
 * Companion Detail Modal — Symy 伙伴详情弹窗 (Round 97 重构)
 *
 * 点击 hero section 的头像打开, 显示完整伙伴信息:
 * - 成长阶段 (图标 + 名称 + 描述 + 升级进度)
 * - 个性 (图标 + 名称 + 描述, 未觉醒显示觉醒条件)
 * - 和谐状态 (当前状态 + 3 个需求值)
 * - 伙伴等级 + XP 进度
 * - 一句基于当前状态的伙伴语录
 * - Daily Tasks (streak ≤ 3 时显示今日任务清单)
 * - Health Event Log (健康事件日志)
 * - Badges (徽章 + 详情面板)
 *
 * 设计原则:
 * - 与其他弹窗一致 (portal + backdrop blur + animate-in)
 * - i18n 双语
 * - 响应式 (max-w-md, 适配手机)
 * - Buddy Tab 主页精简后, 这里是伙伴完整信息中心
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { BuddyState, GrowthStage } from '@/types/buddy-state';
import { getHarmonyStatus } from '@/lib/buddy-defaults';
import { SymyAvatar } from './symy-avatar';
import { GrowthStageBadge } from './growth-stage-badge';
import { PersonalityBadge } from './personality-badge';
// 🔧 Round 97: 主页精简, 把以下 sections 移到 modal
import { HealthEventLog } from './health-event-log';
import { BadgesSection } from './badges-section';
import { DailyNeedsSection } from './daily-needs-section';
import type { HealthEvent } from './constants';

interface CompanionDetailModalProps {
  open: boolean;
  onClose: () => void;
  buddyState: BuddyState;
  /** Round 97: health events 数据 (从 BuddyTab 传入) */
  healthEvents?: HealthEvent[];
  isLoadingEvents?: boolean;
  healthEventsError?: string | null;
  onRetryHealthEvents?: () => void;
  isDemo?: boolean;
}

const STAGE_EMOJI: Record<GrowthStage, string> = {
  baby: '🍼',
  young: '⭐',
  adult: '✨',
  elder: '🪷',
};

export function CompanionDetailModal({
  open,
  onClose,
  buddyState,
  healthEvents = [],
  isLoadingEvents = false,
  healthEventsError = null,
  onRetryHealthEvents,
  isDemo = false,
}: CompanionDetailModalProps) {
  const { t } = useI18n();

  // Round 97 P1-1 fix: modal 打开时锁定 body 滚动, 防止背景滚动
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Round 97 P1-2 fix: ESC 关闭 modal
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const harmonyStatus = getHarmonyStatus(buddyState.dailyNeeds);
  // P2-3 fix: 加 || 1 防御除零 (与 hero-section 保持一致)
  const xpPct = Math.min(100, (buddyState.xp / (buddyState.xpToNext || 1)) * 100);

  // Companion quote based on state
  const quoteKey = harmonyStatus === 'harmony'
    ? 'buddy.companionQuoteHarmony'
    : harmonyStatus === 'discomfort'
      ? 'buddy.companionQuoteDiscomfort'
      : 'buddy.companionQuoteNeutral';

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-surface-2 border border-glass-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="companion-detail-title"
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-t-2xl" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-glass-fill hover:bg-glass-fill-strong flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors z-10"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Avatar + Level */}
        <div className="flex flex-col items-center pt-6 pb-3 px-6">
          <div className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-500/20">
            <SymyAvatar growthStage={buddyState.growthStage} animate={true} />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span id="companion-detail-title" className="text-base font-bold text-text-primary">LV.{buddyState.level}</span>
            <GrowthStageBadge growthStage={buddyState.growthStage} />
            <PersonalityBadge personality={buddyState.personality} />
          </div>
        </div>

        {/* Companion quote */}
        <div className="mx-6 mb-4 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20">
          <p className="text-[11px] text-text-secondary text-center italic leading-relaxed">
            &ldquo;{t(quoteKey, { defaultValue: 'I am here with you. Every guarded choice matters.' })}&rdquo;
          </p>
        </div>

        {/* XP Progress — P1-2 fix: 加完整 ARIA 属性 */}
        <div className="mx-6 mb-4">
          <div className="flex items-center justify-between text-[10px] mb-1">
            {/* 🔧 PM-#23 fix: 移除 uppercase (EXP 是缩写, 文本已是大写, 不需 CSS 强制) */}
            <span className="text-text-tertiary tracking-wider">EXP</span>
            <span className="text-text-secondary font-mono">{buddyState.xp}/{buddyState.xpToNext}</span>
          </div>
          <div
            className="h-2 rounded-full bg-glass-fill overflow-hidden"
            role="progressbar"
            aria-label={t('buddy.xpProgress', { defaultValue: 'XP progress to next level' })}
            aria-valuenow={Math.round(xpPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-500 shadow-[0_0_6px_rgba(34,211,238,0.4)]"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>

        {/* Growth Stage detail */}
        <div className="mx-6 mb-3 px-3 py-2 rounded-xl bg-glass-fill/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{STAGE_EMOJI[buddyState.growthStage]}</span>
            <span className="text-xs font-semibold text-text-primary">
              {t(`buddy.growthStage.${buddyState.growthStage}`, { defaultValue: buddyState.growthStage })}
            </span>
          </div>
          <p className="text-[10px] text-text-tertiary leading-relaxed">
            {t(`buddy.growthStageDesc.${buddyState.growthStage}`, { defaultValue: '' })}
          </p>
        </div>

        {/* Personality detail */}
        <div className="mx-6 mb-3 px-3 py-2 rounded-xl bg-glass-fill/50">
          {buddyState.personality !== 'unknown' ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">
                  {buddyState.personality === 'sage' ? '🧙' : buddyState.personality === 'playmate' ? '🎭' : buddyState.personality === 'guardian' ? '🛡️' : '🧘'}
                </span>
                <span className="text-xs font-semibold text-text-primary">
                  {t(`buddy.personality.${buddyState.personality}`, { defaultValue: buddyState.personality })}
                </span>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                {t(`buddy.personalityDesc.${buddyState.personality}`, { defaultValue: '' })}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base opacity-50">❓</span>
                <span className="text-xs font-semibold text-text-tertiary">
                  {t('buddy.personalityUnknown', { defaultValue: 'Personality not yet awakened' })}
                </span>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                {t('buddy.personalityUnknownDesc', { defaultValue: 'Symy\'s personality will awaken after 7 days of companionship.' })}
              </p>
            </>
          )}
        </div>

        {/* Round 97 fix: 删除手写简化版 (与 DailyNeedsSection 完整版重复), 只保留完整版组件
            P1-4 fix: 统一用 mx-6 包装, 不再用 -mx-4 让 DailyNeedsSection 全宽 */}
        <div className="mx-6 mb-3">
          <DailyNeedsSection dailyNeeds={buddyState.dailyNeeds} />
        </div>

        {/* Round 97: Daily Tasks Checklist — 不在此显示 (SymyLedger 在主页已展示, 避免重复) */}

        {/* Round 97: Health Event Log (从 Buddy Tab 移入)
            P1-4 fix: 加 mx-6 统一水平对齐 */}
        <div className="mx-6 mt-2">
          <HealthEventLog
            healthEvents={healthEvents}
            isLoadingEvents={isLoadingEvents}
            healthEventsError={healthEventsError}
            onRetry={onRetryHealthEvents ?? (() => {})}
            onCleared={onRetryHealthEvents}
            isDemo={isDemo}
          />
        </div>

        {/* Round 97: Badges (从 Buddy Tab 移入)
            P1-4 fix: 加 mx-6 统一水平对齐 */}
        <div className="mx-6 mt-2 pb-2">
          <BadgesSection badges={buddyState.badges} buddyState={buddyState} />
        </div>

        {/* Got it button */}
        <div className="mx-6 mb-5 sticky bottom-0 bg-surface-2 pt-3">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-purple-500 transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
          >
            {t('common.gotIt', { defaultValue: 'Got it' })}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
