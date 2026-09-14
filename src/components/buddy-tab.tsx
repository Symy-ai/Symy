'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/i18n/provider';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { ChallengeModal } from './buddy/challenge-modal';
import { InterceptMedalBanner } from './buddy/intercept-medal-banner'; // 🏅 拦截勋章 (绿色转向)
import { HEALTH_CONFIG } from './buddy/constants';
import { BuddyTabSkeleton } from './buddy/buddy-tab-skeleton';
import { HeroSection } from './buddy/hero-section';
import { GrowthMilestoneOverlay } from './buddy/growth-milestone-overlay';
import { SymyLedger } from './buddy/symy-ledger';
import { ProactiveMessageBanner } from './buddy/proactive-message-banner';
import { CompanionDetailModal } from './buddy/companion-detail-modal';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { useHealthEvents } from '@/hooks/use-health-events';
import type { BuddyTabProps } from './buddy/buddy-tab-props';
// ChallengeContext 单一 source of truth
import type { ChallengeContext } from '@/types/challenge-context';
export type { ChallengeContext };
// ====== File Split Wave 1: 状态逻辑拆到 buddy/hooks/*, JSX 区块拆到 buddy/sections/* (纯搬运, 行为零变化)
//        (DreamFundsSection / MinimumPaymentTrapCard / BadgesSection / HealthEventLog / DailyNeedsSection
//         均已移出 Buddy 页面或移入 CompanionDetailModal, 不再在本页渲染) ======
import { usePatternAlert } from './buddy/hooks/use-pattern-alert';
import { useHealthNotification } from './buddy/hooks/use-health-notification';
import { useHealingKit } from './buddy/hooks/use-healing-kit';
import { useChallengeFlow } from './buddy/hooks/use-challenge-flow';
import { useRedeemDialog } from './buddy/hooks/use-redeem-dialog';
import { HealthNotificationOverlay } from './buddy/sections/health-notification-overlay';
import { BuddyAmbientBackground } from './buddy/sections/buddy-ambient-background';
import { PatternAlertBanner } from './buddy/sections/pattern-alert-banner';
import { QuickActions } from './buddy/sections/quick-actions';
import { DormantRevivalPrompt } from './buddy/sections/dormant-revival-prompt';
import { RedeemDialog } from './buddy/sections/redeem-dialog';

/**
 * BuddyTab 编排壳 — 只负责 props 装配与 JSX 区块编排; 状态逻辑在 buddy/hooks/*, 区块在 buddy/sections/*。
 */
export function BuddyTab({ buddyState, onNavigateChat, onRevive, onAddTokens, onUseHealingKit, onBuddyStateRefresh, onToast, isDemo = false, userId, isLoading = false, onCreateDreamFund: _onCreateDreamFund, onUpdateDreamFund: _onUpdateDreamFund, onDeleteDreamFund: _onDeleteDreamFund, onReorderDreamFunds: _onReorderDreamFunds, hourlyRateProp, onSeeIt, onGacha, onSetRate, dailyTasks, dailyTasksCompleted: _dailyTasksCompleted }: BuddyTabProps) {
  const { t } = useI18n();
  const config = HEALTH_CONFIG[buddyState.health] ?? HEALTH_CONFIG.dormant;
  const vitalityPct = buddyState.vitality;
  // 🔧 P1-3 fix: Token 数字滚动动画 (与 symy-ledger.tsx 一致)
  const animatedTokens = useAnimatedNumber(buddyState.tokens);
  // 🔧 P1-5 QA: Companion detail modal state
  const [showCompanionDetail, setShowCompanionDetail] = useState(false);

  // 优先用 page.tsx 传入的 prop (直接数据流, 保证 Profile 改后主页立即更新)
  //    fallback 到共享 hook (兼容旧调用方)
  const { hourlyRate: sharedHourlyRate } = useHourlyRate(isDemo);
  const _hourlyRate = hourlyRateProp ?? sharedHourlyRate;

  // BUG-131 fix: Store pulse timeout refs for cleanup on unmount
  const pulseTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const healthNotification = useHealthNotification({ vitality: buddyState.vitality, isDemo, isLoading });
  // 🔧 P1-2 Pattern Alert (Round 91): 在壳上 fetch, 避免 React 19 effect 问题
  const patternAlertData = usePatternAlert({ isDemo, userId });
  const { healingPulse, handleCompanionClick } = useHealingKit({ buddyState, isDemo, onUseHealingKit, onAddTokens, onToast, onBuddyStateRefresh, setShowCompanionDetail, pulseTimerRefs });
  const { showRedeemDialog, setShowRedeemDialog, redeemType, redeeming, openRedeemDialog, handleRedeem } = useRedeemDialog({ isDemo, onToast });
  const { showChallengeModal, handleCloseChallengeModal, isCheckingChallenge, challengePulse, challengeLimitData, handleSeeItClick, startChallenge } = useChallengeFlow({ isDemo, userId, onNavigateChat, onToast, pulseTimerRefs, openRedeemDialog });
  const { healthEvents, isLoadingEvents, healthEventsError, retryFetch: retryHealthEvents } = useHealthEvents({
    isDemo,
    userId,
    vitality: buddyState.vitality,
  });

  // BUG-131 fix: 清理所有 pulse timer refs（组件卸载时）
  // dragJustEndedTimerRef cleanup → moved to DreamFundsSection
  useEffect(() => {
    return () => {
      pulseTimerRefs.current.forEach(tid => clearTimeout(tid));
      pulseTimerRefs.current = [];
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar relative">
      {/* 🔧 Bug 17 fix: 数据加载中显示 skeleton 而非空白闪烁 */}
      {isLoading && <BuddyTabSkeleton />}
      {!isLoading && (
        <>
      {/* Health Change Notification Overlay */}
      {healthNotification && <HealthNotificationOverlay notification={healthNotification} />}
      <BuddyAmbientBackground health={buddyState.health} />

      {/* 🔧 P3-1 fix: visually-hidden H1 for SEO + screen readers */}
      <h1 className="sr-only">{t('buddy.pageTitle', { defaultValue: 'Symy' })}</h1>

      <HeroSection
        buddyState={buddyState}
        config={config}
        vitalityPct={vitalityPct}
        onCompanionClick={handleCompanionClick}
        healingPulse={healingPulse}
      />

      <CompanionDetailModal
        open={showCompanionDetail}
        onClose={() => setShowCompanionDetail(false)}
        buddyState={buddyState}
        healthEvents={healthEvents}
        isLoadingEvents={isLoadingEvents}
        healthEventsError={healthEventsError}
        onRetryHealthEvents={retryHealthEvents}
        isDemo={isDemo}
      />

      {/* P1-5: Symy 主动留言横幅 (显示最新未读) */}
      <ProactiveMessageBanner
        messages={buddyState.proactiveMessages}
        onMarkRead={(_messageId) => {
          // 乐观更新本地 state, 标记留言已读
          // 实际 DB 写入由 ProactiveMessageBanner 内部调 API 完成
          // 这里不需要额外操作, 因为 Realtime 会推送 DB 变更
        }}
      />
      <InterceptMedalBanner streakDays={buddyState.streak > 0 ? buddyState.streak : undefined} isDemo={isDemo} />
      {/* P1-2: Pattern Alert Banner — 条件渲染内联, 避免 React 19 Compiler 缓存问题 */}
      {patternAlertData?.alert && patternAlertData.failedCount >= 2 && (
        <PatternAlertBanner data={patternAlertData} />
      )}

      {/* ====== Quick Actions ====== */}
      <QuickActions
        isDemo={isDemo}
        isCheckingChallenge={isCheckingChallenge}
        challengePulse={challengePulse}
        challengeLimitData={challengeLimitData}
        onSeeItClick={handleSeeItClick}
        onGacha={onGacha}
      />

      <SymyLedger
        buddyState={buddyState}
        config={config}
        isDemo={isDemo}
        onToast={onToast}
        onSeeIt={onSeeIt}
        onSetRate={onSetRate}
      />

      <ChallengeModal
        open={showChallengeModal} onClose={handleCloseChallengeModal}
        onSubmit={(itemName, amount) => startChallenge(itemName, amount)}
        dreamFunds={buddyState.dreamFunds} isDemo={isDemo} buddyState={buddyState}
        todaySeeItCount={challengeLimitData?.degraded ? undefined : challengeLimitData?.count}
        chattedToday={dailyTasks?.chatted}
      />

      <GrowthMilestoneOverlay buddyState={buddyState} isLoading={isLoading} />

      {/* Dormant state: Revival prompt */}
      {buddyState.health === 'dormant' && (
        <DormantRevivalPrompt onRevive={onRevive} />
      )}
        </>
      )}

      {/* 🔧 代币兑换对话框 — 次数用完时显示 */}
      {showRedeemDialog && (
        <RedeemDialog
          redeemType={redeemType}
          animatedTokens={animatedTokens}
          tokens={buddyState.tokens}
          redeeming={redeeming}
          onRedeem={handleRedeem}
          onClose={() => setShowRedeemDialog(false)}
        />
      )}
    </div>
  );
}
