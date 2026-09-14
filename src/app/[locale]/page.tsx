/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ChallengeContext } from '@/types/challenge-context';
import { TabBar, type Tab } from '@/components/tab-bar';
import { TAB_ORDER, TAB_URL_WHITELIST, isTabId, type TabId } from '@/lib/tab-registry';
import { GlobalToast } from '@/components/global-toast';
import { showToast } from '@/lib/toast';
import { recordAhaChallenge, useAhaChallengeMigration } from '@/hooks/use-aha-challenge-migration';
import { ImpulseEvent } from '@/lib/impulse-detector';
import { formatPlatformName } from '@/lib/utils';
import { useAuth } from '@/components/auth/auth-provider';
import { createClient } from '@/lib/supabase-browser';
import { useI18n } from '@/i18n/provider';
import { useBuddyStateRQ as useBuddyState } from '@/hooks/use-buddy-state-rq';
import { useHomeData } from '@/hooks/use-home-data';
// 🔧 P1-5 机制闭合 (Round 90): 主动留言 + 个性觉醒 + challenge stats
import { useCompanionEffects } from '@/hooks/use-companion-effects';
import { useMilestoneToasts } from '@/hooks/use-milestone-toasts';
import { useOnboardingFlow } from '@/hooks/use-onboarding-flow';
import { useAhaMoment } from '@/hooks/use-aha-moment';
import { OnboardingGuide } from '@/components/onboarding-guide';
import { AhaMomentOnboarding } from '@/components/aha-moment-onboarding';
import { AuthPromptModal } from '@/components/auth-prompt-modal';
import { DailyRitualOverlay } from '@/components/daily-ritual-overlay';
import { WelcomeBackOverlay } from '@/components/welcome-back-overlay';
import { AppTabContent } from '@/components/app-tab-content';
// 🔧 P1-1 Variable Reward (Round 92): 可变奖励视觉动画
import { VariableRewardOverlay } from '@/components/chat/variable-reward-overlay';
import { useVariableReward } from '@/hooks/use-variable-reward';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
// 🔧 PM3-P2-1 fix: 今日任务清单 (streak ≤ 3 时显示)
import { useDailyTasks } from '@/hooks/use-daily-tasks';
import { useWelcomeBack } from '@/hooks/use-welcome-back';
import { captureRefCode, useRefCodeTracking } from '@/hooks/use-ref-code-tracking';
// 🔧 ARCH fix (2026-07-21): Impulse alert logic extracted to hook
import { useImpulseAlert } from '@/hooks/use-impulse-alert';
import {
  DEMO_IMPULSE_EVENTS,
  DEMO_STATS,
  getDemoBuddyState,
  localizeDefaultDreamFunds,
} from '@/lib/demo-data';
import type { BuddyState } from '@/types/buddy-state';
import { logger } from '@/lib/logger';
import { LandingPage } from '@/components/landing-page';
import { moneyToFreedomLabel } from '@/lib/freedom-time';

export default function WeMeApp() {
  const { user, loading } = useAuth();
  const { t, locale } = useI18n();
  const hasEverHadUserRef = useRef(false);
  // 🔧 架构优化 Round 58: 移 ref mutation 到 useEffect (React 19 兼容 — Finding 2)
  useEffect(() => {
    if (user) hasEverHadUserRef.current = true;
  }, [user]);
  // 🔧 需求七: 邀请码追踪 — 捕获 ?ref=CODE + 登录后记录 ref 关系
  useEffect(() => { captureRefCode(); }, []);
  useRefCodeTracking(user?.id);
   
  const isDemo = !hasEverHadUserRef.current && !user && !loading;
  const [activeTab, setActiveTab] = useState<Tab>('buddy');
  // 🔧 Round 95: 2.5D Tab 方向感知
  const [tabDir, setTabDir] = useState<'left' | 'right'>('right');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tabOrder is constant
  const switchTab = useCallback((tab: Tab) => {
    // 🔧 ARCH fix: TAB_ORDER 从 @/lib/tab-registry 导入 (原为硬编码数组)
    const currIdx = TAB_ORDER.indexOf(activeTabRef.current as TabId);
    const nextIdx = TAB_ORDER.indexOf(tab);
    setTabDir(nextIdx > currIdx ? 'left' : 'right');
    setActiveTab(tab);
    // 🔧 Round 106 fix: 切换 tab 时关闭 Insights overlay (否则 overlay z-20 会遮住新 tab 内容)
    setShowInsightsOverlay(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);
  const [previousTab, setPreviousTab] = useState<Tab>('buddy');
   
  const isDemoRef = useRef(isDemo);
  // 🔧 v4 fix: 跟踪本次会话是否 skip 过 AhaMoment — 避免 Skip 后 DailyRitual 立即弹出
  const [skippedAha, setSkippedAha] = useState(false);
  const [welcomeBackVisible, setWelcomeBackVisible] = useState(false);
   
  useEffect(() => { isDemoRef.current = isDemo; }, [isDemo]);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  // 🔧 BUG-005 fix: guard so the welcome toast fires at most once per session,
  //   even if user_metadata hasn't refreshed yet after updateUser() persists the flag.
  const welcomeToastFiredRef = useRef(false); useAhaChallengeMigration(user, t);
  // 🔧 P0 fix (2026-07-10): tab 切换派发事件, useChallengeLimit 监听切回 buddy 时刷新
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('symy:tab-change', { detail: { tab: activeTab } }));
  }, [activeTab]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    // 🔧 ARCH fix: 使用 isTabId() + TAB_URL_WHITELIST 替换硬编码白名单
    if (tabParam && isTabId(tabParam) && (TAB_URL_WHITELIST as readonly string[]).includes(tabParam)) {
      // URL 参数 → 初始 tab 设置 (一次性, mount 后不重复)
      // 🔧 ARCH fix Round 78: 'insights' tab removed (merged into 'profile')
      switchTab(tabParam as Tab);
      setPreviousTab(tabParam === 'monitor' || tabParam === 'family' ? 'profile' : (tabParam as Tab));
    }
    // 🔧 ARCH fix Round 78: Support ?session=SESSION_ID for butterfly story sharing
    const sessionParam = params.get('session');
    if (sessionParam && tabParam === 'butterfly') {
      setSharedSessionId(sessionParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);
  // P0P1-B: ?guest=true flag for LandingPage early-return decision
  // 🔧 b68-hotfix2 fix: 派生自 useSearchParams (响应式)。
  //   旧实现 useState + 空依赖 useEffect 只在 mount 时读一次 URL — 用户在 /zh 点
  //   「体验演示」是同路由 query 变化 (router.push('/zh?guest=true')), 组件不重挂载,
  //   effect 不重跑 → isGuest 恒 false → LandingPage 永不消失。派生值随 query 变化
  //   同一 render 即生效, 无 effect 延迟 (SSR/硬导航同理)。
  // 🔧 ARCH fix (2026-07-21): Impulse alert logic extracted to useImpulseAlert hook
  const { appStatus, shaking, handleImpulseAlert } = useImpulseAlert(isDemoRef);
  // 🔧 Round 102: Home data loading extracted to useHomeData hook
  const { emailReceipts, healthEvents, isHomeDataLoading } = useHomeData(user?.id);
  const [impulseContext, setImpulseContext] = useState<{
    platform: string;
    amount: number;
    reasons: string[];
    time: string;
  } | undefined>(undefined);
  // 🔧 P1-1 Variable Reward (Round 92): 可变奖励动画 (提取到 hook)
  const { variableReward, clearVariableReward } = useVariableReward();
  const [chatContextMessage, setChatContextMessage] = useState<string | undefined>(undefined);
  const [challengeContext, setChallengeContext] = useState<ChallengeContext | undefined>(undefined);
  // 🔧 ARCH fix Round 78: Insights overlay state — opened via settings icon in Profile tab
  const [showInsightsOverlay, setShowInsightsOverlay] = useState(false);
  // 🔧 ARCH fix Round 78: Shared butterfly session ID (from ?session= param)
  const [sharedSessionId, setSharedSessionId] = useState<string | null>(null);
  // P0P1-B: isGuest skips LandingPage early-return for demo mode
  const searchParams = useSearchParams();
  const isGuest = searchParams.get('guest') === 'true';

  const [authPromptFeature, setAuthPromptFeature] = useState<string | null>(null);
  const showAuthPrompt = useCallback((feature: string) => {
    setAuthPromptFeature(feature);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);
  const hideAuthPrompt = useCallback(() => {
    setAuthPromptFeature(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      // 检查是否刚从登录状态变为未登录 (用 sessionStorage 标记)
      const wasLoggedIn = sessionStorage.getItem('symy_was_logged_in');
      if (wasLoggedIn === 'true') {
        sessionStorage.removeItem('symy_was_logged_in');
        // Sign Out 一次性 toast 通知
         
        showToast(t('auth.signedOut', { defaultValue: "You've been signed out. Explore as guest or sign in again." }), 'info');
      }
    }
    if (user) {
      sessionStorage.setItem('symy_was_logged_in', 'true');
      // 🔧 BUG-005 fix: welcome toast only on the user's first login ever.
      //   Old code keyed off a sessionStorage flag that got re-set on every
      //   logged-out moment, so returning LV.4 users saw "LV.1 → LV.2 + 50
      //   tokens" on every login. Now gated by a persistent user_metadata
      //   flag that survives across sessions and devices.
      if (!user.user_metadata?.welcome_shown && !welcomeToastFiredRef.current) {
        welcomeToastFiredRef.current = true;
        showToast(t('ahaMoment.welcomeLevelUp', { defaultValue: '🎉 Symy is now yours! LV.1 → LV.2 + 50 tokens — your journey begins.' }), 'success');
        // Persist the flag best-effort so the toast never reappears.
        const client = createClient();
        client?.auth.updateUser({ data: { welcome_shown: true } }).catch(() => {
          // non-critical: worst case the toast shows once more next login
        });
      }
    }
  }, [user, loading, t]);
  const { buddyState: realBuddyState, addTokens, useHealingKit, revive, forceRefresh, createDreamFund, updateDreamFund, deleteDreamFund, reorderDreamFunds, isLoaded: buddyIsLoaded, syncError: buddySyncError } = useBuddyState();

  useEffect(() => {
    if (buddySyncError) {
       
      showToast(t('buddy.syncErrorRefresh', { defaultValue: 'Sync issue detected — please refresh to avoid losing changes.' }), 'info');
    }
  }, [buddySyncError, t]);

  useMilestoneToasts({ isDemo, buddyState: realBuddyState, onToast: (toast) => showToast(toast.message, toast.type), t });

  // 🔧 P1-5 机制闭合 (Round 90): 主动留言 + 个性觉醒 + challenge stats (提取到 hook)
  const { challengeStats } = useCompanionEffects({
    isDemo,
    buddyIsLoaded: buddyIsLoaded as boolean,
    userId: user?.id,
    realBuddyState,
    buddyChallengesCompleted: realBuddyState.challengesCompleted,
  });
   
  // 🔧 BUG-5 fix (i18n): demo mode uses localized dream fund names
  // 🔧 BUG-003/004 fix: real users get default seed fund names localized by id too
  const buddyState: BuddyState = isDemo
    ? getDemoBuddyState(t)
    : { ...realBuddyState, dreamFunds: localizeDefaultDreamFunds(realBuddyState.dreamFunds, t) };
   
  const buddyTabLoading = isDemo ? false : !buddyIsLoaded;

  // 🔧 P0 fix: 用共享 hook — Profile 改了时薪后 DailyRitualOverlay 立即收到新值
  const { hourlyRate } = useHourlyRate(isDemo);

  // 🔧 Brief D1c: See It 完成后显示 toast 通知 (金额 + 生命小时数)
  //   Normal 模式的 toast 已在 use-challenge-actions.ts handleGiveUp 中显示。
  //   Demo 模式没有 use-challenge-actions, 此 listener 补上 demo 模式的 toast。
  //   监听 variable-reward 事件 (demo 路径通过 triggerDemoSeeItCelebration 触发)。
  //   🔧 P0P1-B fix: 此块原在 hourlyRate 声明之前 (TDZ 错误), 移到此处保证声明顺序。
  const hourlyRateRef = useRef(hourlyRate);
  useEffect(() => { hourlyRateRef.current = hourlyRate; }, [hourlyRate]);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { savedAmount?: number; rewardTier?: string } | undefined;
      // Demo 模式下 savedAmount 存在 — 显示 See It 完成 toast
      if (detail?.savedAmount && detail.savedAmount > 0) {
        const rate = hourlyRateRef.current;
        // owner 铁律 (09-06): toast 只显示自由时间, 不显示金额
        const hours = moneyToFreedomLabel(detail.savedAmount, locale, rate);
        // 🔧 Brief D1c: 延迟 500ms 显示 toast — 让 VariableRewardOverlay 先开始动画
        setTimeout(() => {
          showToast(
            t('chat.seeItCompletedToast', {
              defaultValue: `🎉 You won back ${hours} of your life!`,
              hours,
            }),
            'success',
          );
        }, 500);
      }
    };
    window.addEventListener('variable-reward', handler);
    return () => window.removeEventListener('variable-reward', handler);
  }, [t, locale]);

  // 🔧 PM3-P2-1 fix: 今日任务清单 (streak ≤ 3 时显示)
  //   追踪用户今日是否完成 See it / Chat / Set hourly rate
  //   在用户完成 See it (handleAhaComplete) / Chat (handleBuddyNavigateChat) 时调用 mark
  const { tasks: dailyTasks, completedCount: dailyTasksCompleted, markSeen: markDailySeen, markChatted: markDailyChatted } = useDailyTasks(isDemo, hourlyRate);

  // 🔧 架构优化 Round 65: 新手引导逻辑提取到 use-onboarding-flow.ts
  const { showOnboarding, handleOnboardingComplete, handleOnboardingSkip, closeOnboarding } = useOnboardingFlow({ user, loading, isDemo });

  // 🔧 回归欢迎 (absence >= 3 days): 暂停 daily ritual + 显示欢迎层
  const { welcomeBack, ack: ackWelcomeBack } = useWelcomeBack(isDemo);
  const handleWelcomeBackNavigateChat = useCallback(() => {
    setWelcomeBackVisible(false);
    setActiveTab('chat');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setActiveTab stable from useCallback
  }, []);
  useEffect(() => {
    setWelcomeBackVisible(!!welcomeBack);
  }, [welcomeBack]);

  const handleOnboardingSwitchTab = useCallback((tab: string) => {
    switchTab(tab as Tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);

  const {
    showAhaMoment,
    setShowAhaMoment,
    ahaChallengeContext,
    setAhaChallengeContext,
    handleAhaNavigateToChallenge: _handleAhaNav,
    handleAhaComplete: _handleAhaComplete,
    handleAhaSkip: _handleAhaSkip,
  } = useAhaMoment({
    isDemoRef,
    loading,
    user,
    t,
    setChatContextMessage,
    setChallengeContext,
    setActiveTab: (tab: string) => switchTab(tab as Tab),
  });

  const handleAhaNavigateToChallenge = useCallback((context: ChallengeContext) => {
    _handleAhaNav(context);
    closeOnboarding();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [_handleAhaNav]);
  const handleAhaComplete = useCallback(() => {
    _handleAhaComplete();
    closeOnboarding();
    // 🔧 PM3-P2-1 fix: 标记今日 See it 任务完成
    markDailySeen();
    if (isDemoRef.current) {
      // safe to ignore: non-critical background operation, error already logged
      try { localStorage.setItem('symy-onboarding-seen', 'true'); } catch { logger.warn('[Onboarding] localStorage.setItem failed (privacy mode?)'); }
            // safe to ignore: non-critical background operation, error already logged
      // 🔧 PM3-P1-3 fix: 未登录用户 See it 提交时弹登录引导
      //   需求: "Sign up to save your seeing" + [Sign Up Free] [Maybe later]
      //   旧代码: 只存 localStorage, 不弹引导 → 用户不知道要注册
      //   新代码: 弹 auth prompt (feature='aha_moment')
      showAuthPrompt('aha_moment');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [_handleAhaComplete, isDemoRef, showAuthPrompt, markDailySeen]);

  const handleAhaSkip = useCallback(() => {
    _handleAhaSkip();
    closeOnboarding();
    // 🔧 v4 fix: 标记本次会话已 skip — DailyRitual 本次会话不再弹出
    setSkippedAha(true);
    if (isDemoRef.current) {
      // safe to ignore: non-critical background operation, error already logged
      try { localStorage.setItem('symy-onboarding-seen', 'true'); } catch { logger.warn('[Onboarding] localStorage.setItem failed (privacy mode?)'); }
            // safe to ignore: non-critical background operation, error already logged
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [_handleAhaSkip, isDemoRef]);

  // 🔧 P2-2 fix: Removed top status bar (clock + signal + battery) — meaningless decoration
  //    that confused users ("is this last action time or current time?"). Real device status
  //    bar already shows this info; duplicating it adds no value.

  // 🔧 ARCH fix (2026-07-21): Impulse alert logic (impulseTimeoutsRef, handleImpulseAlert,
  //    shaking state, appStatus state) extracted to useImpulseAlert hook.
  //    See src/hooks/use-impulse-alert.ts for the extracted implementation.

  // 🔧 Round 102: loadHomeData + homeDataAbortRef + email/health state extracted to useHomeData hook
  // Clear non-home user data on user switch (chat context, challenge context — not home data, that's in the hook)
  const prevPageUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevPageUserIdRef.current !== user?.id) {
      setChatContextMessage(undefined);
      setChallengeContext(undefined);
      setImpulseContext(undefined);
    }
    prevPageUserIdRef.current = user?.id;
  }, [user?.id]);

  const uniqueReceipts = useMemo(() => Array.from(new Map(emailReceipts.map((r) => [r.id, r])).values()), [emailReceipts]);
  const uniqueHealthEvents = useMemo(() => Array.from(new Map(healthEvents.map((e) => [e.id, e])).values()), [healthEvents]);

  const events: ImpulseEvent[] = useMemo(() => {
     
    if (isDemo) return DEMO_IMPULSE_EVENTS;
    const receiptEvents = uniqueReceipts.map((r) => {
      let itemName = r.item_name || r.subject || 'Unknown item';
      if (itemName.length > 60) itemName = itemName.substring(0, 60) + '...';
      return {
        id: r.id,
        platform: r.platform,
        item: itemName,
        amount: r.amount || 0,
        timestamp: new Date(r.received_at),
        category: r.platform,
        isLivestream: false,
        isFlashSale: false,
        impulseScore: r.impulse_score,
        reasons: [`Email receipt from ${formatPlatformName(r.platform)}`],
        // 🔧 PM-NEW-33 fix: 标记退款事件用 💰 图标
        subType: r.status === 'refunded' ? 'refund_processed' as const : 'impulse_purchase' as const,
      };
    });
    // 🔧 N56 fix: 把 challenge_completed health_events 也加入 events 数组
    // 这样 Weekly Trend 和 Recent Events 也能显示挑战完成记录，与 totalEvents 一致
    // 🔧 Bug 6 fix: 用 uniqueHealthEvents (去重) 而非 healthEvents (可能含重复)
    const challengeEvents: ImpulseEvent[] = uniqueHealthEvents
      .filter((e) => e.eventType === 'challenge_completed' || e.eventType === 'challenge_failed')
      .map((e) => ({
        id: e.id,
        platform: 'challenge',
        item: e.description || 'Challenge completed',
        amount: (e.metadata?.savedAmount as number) || 0,
        timestamp: new Date(e.createdAt),
        category: 'challenge',
        isLivestream: false,
        isFlashSale: false,
        impulseScore: 0,
        reasons: ['Challenge completed'],
        // 🔧 PM-NEW-33 fix: 挑战完成用 🛡️, 挑战失败用 💔
        subType: (e.eventType === 'challenge_failed' ? 'challenge_failed' : 'challenge_completed') as 'challenge_failed' | 'challenge_completed',
      }));
    return [...receiptEvents, ...challengeEvents];
   
  }, [isDemo, uniqueReceipts, uniqueHealthEvents]);

  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // 🔧 P1-3 "You saw" 计数修复 (Round 90):
  //   health_events 被 Clear 后 challengesSawCount 变 0。
  //   修复: 从 active_challenges 表查 passed + failed 总数 (不受 Clear 影响)
  //   challengeStats 来自 useCompanionEffects hook

  //         保证两个 stat 数据源完全一致, 不变量恒成立。
  //   防御: 即使理论上 Interventions ≤ Events, 仍 clamp = min(intv, events) 防止任何
  //         意外的数据竞态导致自相矛盾数字。

  const stats = useMemo(() => {
     
    if (isDemo) return DEMO_STATS;
    // 🔧 Bug 6 fix (round 2): 用 challengeEvents.length 而非 buddyState.challengesCompleted
    //   旧代码: uniqueReceipts.length + (realBuddyState?.challengesCompleted || 0)
    //   问题: buddyState.challengesCompleted 是 cached 数字, 可能与 uniqueHealthEvents 中
    //     实际的 challenge_completed 事件数不一致 (stale / drift) →
    //     totalEvents (38) < events array length (44) → Weekly Trend > Events Detected 矛盾。
    //   修复: 用 events 数组中实际的 challenge_completed 数 (= challengeEvents.length),
    //     保证 totalEvents 与 events array 数据源一致, weekly ≤ total 恒成立。
    //   注意: health-events API limit=50, 若用户 >50 个 challenge_completed 会低估 —
    //     但这种情况下 weekly 也只算最近 7 天, 仍 ≤ total, 不矛盾。
    // 🔧 BUG-339 fix (Round 37): 抽出 challengesCompletedCount 变量, totalEvents 和
    //   impulseInterventions 共用同一数据源, 消除 drift 可能性。
    // 🔧 PM5-P2-2 fix: challengesSawCount = challenge_completed + challenge_failed
    //   "You saw" = 用户看见代价的所有挑战 (无论最终买不买)
    //   旧逻辑只算 challenge_completed → 用户买了的不算 saw → "You saw: 0" 但有 $25,793 reclaimed
    const challengesSawCount = Math.max(
      uniqueHealthEvents.filter((e) => e.eventType === 'challenge_completed' || e.eventType === 'challenge_failed').length,
      challengeStats?.totalSaw ?? 0,
    );
    const refundedCount = uniqueReceipts.filter((r) => r.status === 'refunded').length;
    const rawEvents = uniqueReceipts.length + challengesSawCount;
    const rawInterventions = challengesSawCount + refundedCount;
    return {
      totalEvents: rawEvents,
      // 不变量防御: Interventions 永远 ≤ Events
      impulseInterventions: Math.min(rawInterventions, rawEvents),
      // 🔧 Bug 7 fix: 用 sum(dreamFunds.current) 替代 realBuddyState.totalSaved
      //   与 BuddyTab Balance 显示保持一致 (避免 RPC LEAST clamp 导致 totalSaved > sum(dreamFunds.current))
      moneySaved: uniqueReceipts
        .filter((r) => r.status === 'refunded')
        .reduce((sum, r) => sum + (r.amount || 0), 0) + (
          buddyState.dreamFunds && buddyState.dreamFunds.length > 0
            ? buddyState.dreamFunds.reduce((sum, f) => sum + (f.current || 0), 0)
            : (realBuddyState?.totalSaved || 0)
        ),
      // 🔧 Bug H fix: 用 buddyState.streak (和 BuddyTab 相同的数据源) 确保 streak 一致
      // 之前用 realBuddyState?.streak 可能在 streak bonus useEffect 增量后 stats 没同步更新
      daysStreak: buddyState.streak || 0,
    };
   
  }, [isDemo, uniqueReceipts, uniqueHealthEvents, realBuddyState?.totalSaved, buddyState.streak, buddyState.dreamFunds, challengeStats]);

  const handleNavigateMonitor = useCallback(() => {
    if (activeTabRef.current === 'monitor') return; // 防止无限循环
    setPreviousTab(activeTabRef.current);
    setActiveTab('monitor');
    // 🔧 P1-15 fix: 关闭 Insights overlay, 避免 z-20 overlay 遮挡 MonitorTab (z-10) 的 Demo Mode 按钮
    //   旧代码: 从 Insights 内点击 Check Orders 进入 Monitor, 但 Insights overlay 仍开着
    //   → Demo Mode 按钮被 overlay 遮挡无法点击
    setShowInsightsOverlay(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);

  // Family overlay navigation — same pattern as Monitor
  const handleNavigateFamily = useCallback(() => {
    if (activeTabRef.current === 'family') return;
    setPreviousTab(activeTabRef.current);
    setActiveTab('family');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);
  const handleNavigateChat = useCallback((context?: { type: 'challenge' | 'healing' | 'default'; message?: string; challengeContext?: ChallengeContext }) => {
    if (isDemoRef.current) {
      // 🔧 N84 fix: Demo 模式下挑战也导航到 Chat (用 demo AI 回复), 不弹 auth prompt
      // 之前: Demo 模式挑战弹 auth prompt, 用户看不到挑战 banner
      // 现在: Demo 模式挑战导航到 Chat, 显示挑战 banner + demo AI 回复
      if (context?.type === 'challenge') {
        // 🔧 2026-07-15 fix: 同非 Demo 路径 — message 可能 undefined (去重)
        if (context.message) {
          setChatContextMessage(context.message);
        }
        if (context.challengeContext) {
          setChallengeContext(context.challengeContext);
        }
        switchTab('chat');
      } else {
        showAuthPrompt('chat');
      }
      return;
    }
    if (context?.type === 'challenge') {
      // 🔧 2026-07-15 fix: message 可能是 undefined (重复点击 See it 不发 "I'm back")
      //   旧代码: context.message || t('navigation.challengePurchase') → undefined 时 fallback 发默认消息
      //   新代码: 只在 message 存在时设置, undefined 时不发任何消息 (只导航 + 设 challengeContext)
      if (context.message) {
        setChatContextMessage(context.message);
      }
      // 传递挑战上下文（物品名+金额）给 ChatTab
      if (context.challengeContext) {
        setChallengeContext(context.challengeContext);
      }
    } else if (eventsRef.current.length > 0) {
      setImpulseContext({
        platform: eventsRef.current[0].platform,
        amount: eventsRef.current[0].amount,
        reasons: eventsRef.current[0].reasons,
        time: eventsRef.current[0].timestamp.toLocaleTimeString(),
      });
    } else {
      setImpulseContext(undefined);
    }
    switchTab('chat');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, [showAuthPrompt, t]); // 🔧 架构优化 Round 58: 加 t 到 deps (Fixing stale closure — Finding 1)

  const handleContextConsumed = useCallback(() => {
    setChatContextMessage(undefined);
    setChallengeContext(undefined);
    setImpulseContext(undefined); // BUG-193 fix: 消费后清除 impulseContext
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
  }, []);

  const handleBuddyNavigateChat = useCallback(
    (context?: { type: 'challenge' | 'healing' | 'default'; message?: string; challengeContext?: ChallengeContext }) => {
      if (isDemoRef.current) {
        // 🔧 N84 fix: Demo 模式下挑战也导航到 Chat (用 demo AI 回复), 不弹 auth prompt
        if (context?.type === 'challenge') {
          setChatContextMessage(context.message || t('navigation.challengePurchase'));
          if (context.challengeContext) {
            setChallengeContext(context.challengeContext);
          }
          switchTab('chat');
        } else {
          showAuthPrompt('healing');
        }
        return;
      }
      handleNavigateChat(context);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
    [showAuthPrompt, handleNavigateChat, t]
  );

  const handleBuddyRevive = useCallback(() => {
    if (isDemoRef.current) {
      showAuthPrompt('general');
      return;
    }
    revive(50);
  }, [showAuthPrompt, revive]);

  const handleBuddyAddTokens = useCallback(
    (amount: number, reason: 'survival' | 'growth' | 'pleasure') => {
      if (isDemoRef.current) {
        showAuthPrompt('healing');
        return;
      }
      addTokens(amount, reason);
    },
    [showAuthPrompt, addTokens]
  );

  const handleMonitorTalkToAI = useCallback(
    (context: { platform: string; amount: number; reasons: string[]; time: string }) => {
      if (isDemoRef.current) {
        showAuthPrompt('chat');
        return;
      }
      setImpulseContext(context);
      switchTab('chat');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- switchTab stable
    [showAuthPrompt]
  );

  const handleBuddyToast = useCallback((message: string, type?: 'success' | 'info') => {
    // 🔧 DM-fix: Demo 模式下 success toast (挑战通过) 不弹 auth prompt — 让用户看到结算反馈
    //    旧代码: 所有 toast 在 demo 模式都弹 auth prompt → 挑战完成后聊天框被 modal 遮挡
    //    现在: 只有 info 类型 (非挑战结果) 才弹 auth prompt; success 直接显示 toast
    if (isDemoRef.current && type !== 'success') {
      showAuthPrompt('healing');
      return;
    }
    showToast(message, type || 'info');
  }, [showAuthPrompt]);
  // 🔧 架构优化 Round 59: 提取 inline closure 为 useCallback (Finding 20)
  const handleChallengePassed = useCallback((challenge: { challengeId: string; itemName: string; amount: number }) => {
    if (ahaChallengeContext) {
      sessionStorage.setItem('symy-aha-challenge-completed', 'true');
      sessionStorage.setItem('symy-aha-challenge-amount', String(challenge.amount));
      recordAhaChallenge({ challengeTitle: challenge.itemName, passed: true, amount: challenge.amount });
      setAhaChallengeContext(null);
      setShowAhaMoment(true);
    }
    // 🔧 P0 fix (2026-07-10): 派发事件让 useChallengeLimit 刷新 "X left"
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('symy:challenge-completed'));
    }
    // Round 124 fix: 标记今日 See it 任务完成 (之前只在 Aha Moment 流程标记)
    markDailySeen();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional omission (stable ref/callback)
  }, [ahaChallengeContext, markDailySeen]);

  // Auth guard: show loading while checking session
  // IMPORTANT: This early return MUST come after ALL hooks to avoid
  // Rules of Hooks violations (React error #310)
  if (loading) {
    return (
      <div className="h-[100dvh] bg-surface-1 flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono font-bold text-2xl gradient-text mb-3 tracking-wider">{t('common.symy')}</div>
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }
  // P0P1-B: early-return LandingPage for demo (non-guest) to prevent z-[500] overlay leak
  // Guest mode: LandingPage returns null → isDemo true → user sees App demo data
  if (isDemo && !isGuest) {
    return <LandingPage />;
  }
  return (
    <div>
      {/* Phone Frame Container */}
      <div className="h-[100dvh] bg-surface-outer flex items-start justify-center overflow-hidden">
        <div
          className={`w-full max-w-[430px] h-full bg-surface-1 relative flex flex-col shadow-2xl transition-transform ${
            shaking ? 'shake-screen' : ''
          }`}
        >

          {/* 🔧 P2-2 fix: Status bar (clock + signal + battery) removed — meaningless decoration */}

          {/* ====== Demo Banner ====== */}
          {/* 🔧 Round 113: 简化 Demo Banner — 从 4 元素 → 2 元素
              旧设计: [DEMO脉冲角标] [Want to buy...文案] [See it once 紫按钮] [Start your seeing 蓝按钮]
              问题: 4 个高饱和度彩色元素横排像调试栏, 与首屏主按钮冲突, 用户困惑"该点哪个"
              新设计: [🌱 示例数据小标签] [说明文案 + 注册链接]
              原则: 免注册试用入口保留, 但视觉降权 — 主入口是首屏 "Start Experience →"
                    Demo Banner 只做"说明 + 次要注册入口", 不抢主按钮注意力 */}
          {isDemo && !loading && (
            <div className="flex-shrink-0 pl-4 pr-14 py-2 bg-glass-fill/60 border-b border-glass-border">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* 🌱 示例数据 — 低饱和度小标签, 无脉冲, 不抢注意力 */}
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-text-tertiary/15 text-text-tertiary flex-shrink-0">
                    {t('ahaMoment.demoBadge', { defaultValue: '🌱 示例数据' })}
                  </span>
                  <span className="text-xs text-text-secondary truncate">
                    {t('ahaMoment.demoBannerSimple', { defaultValue: '这是别人的守护。注册后，Symy 会记住你真实的守护。' })}
                  </span>
                </div>
                {/* 注册链接 — 低调, 不与首屏主按钮竞争 */}
                <button
                  onClick={() => window.location.href = '/auth/signup'}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors cursor-pointer flex-shrink-0 underline decoration-dotted"
                >
                  {t('ahaMoment.signUpLink', { defaultValue: '注册 →' })}
                </button>
              </div>
            </div>
          )}

          {/* Content Area */}
          {/* 🔧 ARCH fix (Round 12 H9): 旧代码用条件渲染 → 切 tab 时组件 unmount → 状态丢失 (聊天草稿/蝴蝶进度/AI 流式)。
              根因修复: 改用 CSS hidden (display:none), 保留所有 tab 的组件实例, 只切换可见性。
              Monitor tab 仍用条件渲染 (它是全屏覆盖, 不需要保持状态)。 */}
          <div className="flex-1 overflow-hidden relative" style={{ perspective: '800px' }}>
            <AppTabContent
              activeTab={activeTab}
              tabDir={tabDir}
              impulseContext={impulseContext}
              buddyState={buddyState}
              chatContextMessage={chatContextMessage}
              challengeContext={challengeContext}
              isDemo={isDemo}
              sharedSessionId={sharedSessionId}
              appStatus={appStatus}
              events={events}
              stats={stats}
              isHomeDataLoading={isHomeDataLoading}
              previousTab={previousTab}
              userId={user?.id}
              hourlyRate={hourlyRate}
              buddyTabLoading={buddyTabLoading}
              handleContextConsumed={handleContextConsumed}
              forceRefresh={forceRefresh}
              handleBuddyNavigateChat={handleBuddyNavigateChat}
              handleBuddyRevive={handleBuddyRevive}
              handleBuddyAddTokens={handleBuddyAddTokens}
              handleBuddyToast={handleBuddyToast}
              handleChallengePassed={handleChallengePassed}
              handleNavigateChat={handleNavigateChat}
              handleNavigateMonitor={handleNavigateMonitor}
              handleNavigateFamily={handleNavigateFamily}
              showAuthPrompt={showAuthPrompt}
              handleMonitorTalkToAI={handleMonitorTalkToAI}
              handleImpulseAlert={handleImpulseAlert}
              switchTab={switchTab}
              setSharedSessionId={setSharedSessionId}
              setShowInsightsOverlay={setShowInsightsOverlay}
              setActiveTab={setActiveTab}
              createDreamFund={createDreamFund}
              updateDreamFund={updateDreamFund}
              deleteDreamFund={deleteDreamFund}
              reorderDreamFunds={reorderDreamFunds}
              markDailyChatted={markDailyChatted}
              dailyTasks={dailyTasks}
              dailyTasksCompleted={dailyTasksCompleted}
              useHealingKit={useHealingKit}
              t={t}
              showInsightsOverlay={showInsightsOverlay}
            />
          </div>

          {/* Bottom Tab Bar — Glassmorphism */}
          <TabBar activeTab={activeTab} previousTab={previousTab} onTabClick={switchTab} />
        </div>
      </div>
      <GlobalToast />

      {/* ====== 新手导引遮罩层 (旧版 spotlight guide, 保留作为 fallback) ====== */}
      {!showAhaMoment && (
        <OnboardingGuide
          visible={showOnboarding}
          onComplete={handleOnboardingComplete}
          onSwitchTab={handleOnboardingSwitchTab}
          onSkip={handleOnboardingSkip}
          isDemo={  isDemo}
        />
      )}

      {/* ====== Aha Moment 引导流程 (新用户首次挑战) ====== */}
      <AhaMomentOnboarding
        open={showAhaMoment}
        isDemo={  isDemo}
        ahaChallengeContext={ahaChallengeContext}
        onComplete={handleAhaComplete}
        onSkip={handleAhaSkip}
        onNavigateToChallenge={handleAhaNavigateToChallenge}
      />

      {/* ====== 注册拦截弹窗 ====== */}
      <AuthPromptModal
        visible={!!authPromptFeature}
        feature={authPromptFeature || 'general'}
        onClose={hideAuthPrompt}
      />

      {/* ====== 每日守护仪式 (每天第一次打开时全屏覆盖) ====== */}
      {/* 🔧 PM-P0-2 fix: onboarding/ahaMoment 显示时暂停 ritual, 避免弹窗叠弹窗 */}
      {/* 🔧 F46 fix: 匿名态 (isDemo) 禁用日常仪式弹窗, 避免打断核心流程 */}
      <DailyRitualOverlay
        // 优先用 user_metadata 昵称, fallback 到 email (组件内转为 "守护者" / "Guardian")
        userName={
          (user?.user_metadata?.nickname as string | undefined) ||
          (user?.user_metadata?.full_name as string | undefined) ||
          (user?.user_metadata?.name as string | undefined) ||
          user?.email ||
          undefined
        }
        totalSaved={stats.moneySaved}
        streakDays={stats.daysStreak}
        isDemo={isDemo}
        hourlyRate={hourlyRate}
        paused={showOnboarding || showAhaMoment || skippedAha || isDemo || welcomeBackVisible}
      />

      {/* 🔧 回归欢迎全屏时刻 (absence >= 3 days): 段位仍在 + 累计自由小时 + CTA */}
      {welcomeBack && (
        <WelcomeBackOverlay
          totalSaved={stats.moneySaved}
          hourlyRate={hourlyRate}
          guardRankStats={{
            totalIntercepts: buddyState.challengesCompleted,
            streakDays: stats.daysStreak,
            badgesUnlocked: (buddyState.badges || []).length,
          }}
          onClose={() => ackWelcomeBack()}
          onNavigateChat={handleWelcomeBackNavigateChat}
          isDemo={isDemo}
        />
      )}
      {/* 🔧 P1-1 Variable Reward (Round 92): 可变奖励视觉动画 */}
      {/* 🔧 F7 fix (串行展示): VariableReward 完成后触发 'variable-reward-complete' 事件,
          让 use-challenge-actions.ts 中的监听器触发 SilentMoment (串行顺序: BONUS → Silent → Deposit) */}
      {variableReward && (
        <VariableRewardOverlay
          rewardTier={variableReward.rewardTier}
          bonusTokens={variableReward.bonusTokens}
          bonusVitality={variableReward.bonusVitality}
          onComplete={() => {
            clearVariableReward();
            window.dispatchEvent(new CustomEvent('variable-reward-complete'));
          }}
        />
      )}

      {/* 🔧 P0P1-B fix (B1): LandingPage 已上移到 early return (isDemo && !isGuest),
          不再在此处 overlay 渲染。旧代码 {isDemo && <LandingPage />} 已移除。 */}
    </div>
  );
}
