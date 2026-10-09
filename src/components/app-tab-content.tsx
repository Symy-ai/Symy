'use client';

import { ErrorBoundary } from '@/components/error-boundary';
import { ChatTab } from '@/components/chat-tab';
import { BuddyTab } from '@/components/buddy-tab';
import { DefenseTab } from '@/features/defense/components/defense-tab';
import { ProfileTab } from '@/components/profile-tab';
import { HomeTab } from '@/components/home-tab';
import { MonitorTab } from '@/components/monitor-tab';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { DreamFund, BuddyState } from '@/types/buddy-state';
import type { ChallengeContext } from '@/types/challenge-context';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import type { Tab } from '@/components/tab-bar';
import type { DailyTasks } from '@/hooks/use-daily-tasks';

const ButterflyTab = dynamic(
  () => import('@/features/butterfly/components/butterfly-tab').then((module) => module.ButterflyTab),
  {
    loading: () => (
      <div className="absolute inset-0 bg-surface-1 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="mt-4 h-[calc(100%-4.5rem)] w-full" />
      </div>
    ),
  },
);

export interface AppTabContentProps {
  activeTab: string;
  tabDir: 'left' | 'right';
  impulseContext: { platform: string; amount: number; reasons: string[]; time: string } | undefined;
  buddyState: BuddyState;
  chatContextMessage: string | undefined;
  challengeContext: ChallengeContext | undefined;
  isDemo: boolean;
  sharedSessionId: string | null;
  appStatus: 'stable' | 'alert' | 'success';
  events: ImpulseEvent[];
  stats: { totalEvents: number; impulseInterventions: number; moneySaved: number; daysStreak: number };
  isHomeDataLoading: boolean;
  previousTab: string;
  userId?: string;
  hourlyRate: number;
  buddyTabLoading: boolean;
  handleContextConsumed: () => void;
  forceRefresh: () => void;
  handleBuddyNavigateChat: (context?: { type: 'challenge' | 'healing' | 'default'; message?: string; challengeContext?: ChallengeContext }) => void;
  handleBuddyRevive: () => void;
  handleBuddyAddTokens: (amount: number, reason: 'survival' | 'growth' | 'pleasure') => void;
  handleBuddyToast: (message: string, type?: 'success' | 'info') => void;
  handleChallengePassed: (challenge: { challengeId: string; itemName: string; amount: number }) => void;
  handleNavigateChat: (context?: { type: 'challenge' | 'healing' | 'default'; message?: string; challengeContext?: ChallengeContext }) => void;
  handleNavigateMonitor: () => void;
  handleNavigateFamily: () => void;
  showAuthPrompt: (feature: string) => void;
  handleMonitorTalkToAI: (context: { platform: string; amount: number; reasons: string[]; time: string }) => void;
  handleImpulseAlert: (score: number) => void;
  switchTab: (tab: Tab) => void;
  setSharedSessionId: (id: string | null) => void;
  setShowInsightsOverlay: (show: boolean) => void;
  setActiveTab: (tab: Tab) => void;
  createDreamFund: (fund: Omit<DreamFund, 'id'>) => string;
  updateDreamFund: (fundId: string, updates: Partial<Omit<DreamFund, 'id'>>) => void;
  deleteDreamFund: (fundId: string) => void;
  reorderDreamFunds: (newOrder: string[]) => Promise<void>;
  markDailyChatted: () => void;
  dailyTasks: DailyTasks;
  dailyTasksCompleted: number;
  useHealingKit: () => Promise<'success' | 'already_used' | 'error'>;
  showInsightsOverlay: boolean;
  t: (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => string;
}

export function AppTabContent({
  activeTab,
  tabDir,
  impulseContext,
  buddyState,
  chatContextMessage,
  challengeContext,
  isDemo,
  sharedSessionId,
  appStatus,
  events,
  stats,
  isHomeDataLoading,
  previousTab,
  userId,
  hourlyRate,
  buddyTabLoading,
  handleContextConsumed,
  forceRefresh,
  handleBuddyNavigateChat,
  handleBuddyRevive,
  handleBuddyAddTokens,
  handleBuddyToast,
  handleChallengePassed,
  handleNavigateChat,
  handleNavigateMonitor,
  handleNavigateFamily,
  showAuthPrompt,
  handleMonitorTalkToAI,
  handleImpulseAlert,
  switchTab,
  setSharedSessionId,
  setShowInsightsOverlay,
  setActiveTab,
  createDreamFund,
  updateDreamFund,
  deleteDreamFund,
  reorderDreamFunds,
  markDailyChatted,
  dailyTasks,
  dailyTasksCompleted,
  useHealingKit,
  showInsightsOverlay: insightsVisible,
  t,
}: AppTabContentProps) {
  return (
    <>
      <div
        className={`absolute inset-0 ${activeTab === 'chat' ? (tabDir === 'left' ? 'animate-tab-in-left' : 'animate-tab-in-right') : 'hidden'}`}
        {...(activeTab !== 'chat' ? { 'aria-hidden': true, inert: true } : {})}
      >
        <ErrorBoundary>
          <ChatTab
            impulseContext={impulseContext}
            buddyState={buddyState}
            contextMessage={chatContextMessage}
            challengeContext={challengeContext}
            onContextConsumed={handleContextConsumed}
            onBuddyStateRefresh={forceRefresh}
            isDemo={isDemo}
            onAuthPrompt={showAuthPrompt}
            onToast={handleBuddyToast}
            onChallengePassed={handleChallengePassed}
            onMessageSent={markDailyChatted}
            onNavigateProfile={() => switchTab('profile')}
          />
        </ErrorBoundary>
      </div>
      <div
        className={`absolute inset-0 ${activeTab === 'buddy' ? (tabDir === 'left' ? 'animate-tab-in-left' : 'animate-tab-in-right') : 'hidden'}`}
        {...(activeTab !== 'buddy' ? { 'aria-hidden': true, inert: true } : {})}
      >
        <ErrorBoundary>
          <BuddyTab
            buddyState={buddyState}
            onNavigateChat={handleBuddyNavigateChat}
            onRevive={handleBuddyRevive}
            onAddTokens={handleBuddyAddTokens}
            onUseHealingKit={useHealingKit}
            onBuddyStateRefresh={forceRefresh}
            onToast={handleBuddyToast}
            isDemo={isDemo}
            userId={userId}
            isLoading={buddyTabLoading}
            onCreateDreamFund={createDreamFund}
            onUpdateDreamFund={updateDreamFund}
            onDeleteDreamFund={deleteDreamFund}
            onReorderDreamFunds={reorderDreamFunds}
            hourlyRateProp={hourlyRate}
            onSeeIt={() => switchTab('chat')}
            onGacha={() => switchTab('butterfly')}
            onSetRate={() => switchTab('profile')}
            dailyTasks={dailyTasks}
            dailyTasksCompleted={dailyTasksCompleted}
          />
        </ErrorBoundary>
      </div>
      <div
        className={`absolute inset-0 ${activeTab === 'butterfly' ? (tabDir === 'left' ? 'animate-tab-in-left' : 'animate-tab-in-right') : 'hidden'}`}
        {...(activeTab !== 'butterfly' ? { 'aria-hidden': true, inert: true } : {})}
      >
        <ErrorBoundary>
          <ButterflyTab
            isDemo={isDemo}
            onAuthPrompt={showAuthPrompt}
            sharedSessionId={sharedSessionId}
            onSharedSessionConsumed={() => setSharedSessionId(null)}
            onBack={() => switchTab('buddy')}
          />
        </ErrorBoundary>
      </div>
      <div
        className={`absolute inset-0 ${activeTab === 'defense' ? (tabDir === 'left' ? 'animate-tab-in-left' : 'animate-tab-in-right') : 'hidden'}`}
        {...(activeTab !== 'defense' ? { 'aria-hidden': true, inert: true } : {})}
      >
        <ErrorBoundary>
          <DefenseTab
            isDemo={isDemo}
            onAuthPrompt={showAuthPrompt}
            userTotalSaved={stats?.moneySaved}
            guardRankStats={{
              totalIntercepts: buddyState?.challengesCompleted ?? 0,
              streakDays: stats?.daysStreak ?? 0,
              badgesUnlocked: Array.isArray(buddyState?.badges) ? buddyState.badges.length : 0,
            }}
          />
        </ErrorBoundary>
      </div>
      <div
        className={`absolute inset-0 ${activeTab === 'profile' ? (tabDir === 'left' ? 'animate-tab-in-left' : 'animate-tab-in-right') : 'hidden'}`}
        {...(activeTab !== 'profile' ? { 'aria-hidden': true, inert: true } : {})}
      >
        <ErrorBoundary>
          <ProfileTab
            darkMode={false}
            onToggleDarkMode={() => {}}
            isDemo={isDemo}
            onAuthPrompt={showAuthPrompt}
            onNavigateMonitor={handleNavigateMonitor}
            buddyStreak={stats?.daysStreak}
            buddyTotalSaved={stats?.moneySaved}
            buddyChallengesCompleted={Math.max(
              events.filter((e) => (e as { eventType?: string }).eventType === 'challenge_completed' || (e as { eventType?: string }).eventType === 'challenge_failed').length,
              stats?.totalEvents ?? 0,
            )}
            buddyDreamFunds={buddyState?.dreamFunds}
            isActive={activeTab === 'profile'}
            onOpenInsights={() => setShowInsightsOverlay(true)}
            dreamFunds={buddyState?.dreamFunds}
            onCreateDreamFund={createDreamFund}
            onUpdateDreamFund={updateDreamFund}
            onDeleteDreamFund={deleteDreamFund}
            onReorderDreamFunds={reorderDreamFunds}
          />
        </ErrorBoundary>
      </div>
      {insightsVisible && !isDemo && (
        <div className="absolute inset-0 z-20 bg-surface-1 flex flex-col animate-tab-in">
          <div className="flex-shrink-0 flex items-center px-4 py-3 border-b border-glass-border">
            <button
              onClick={() => setShowInsightsOverlay(false)}
              className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">{t('common.back', { defaultValue: '← Back' })}</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ErrorBoundary>
              <HomeTab
                status={appStatus}
                events={events}
                stats={stats}
                onNavigateMonitor={handleNavigateMonitor}
                onNavigateFamily={handleNavigateFamily}
                onNavigateChat={(ctx) => { setShowInsightsOverlay(false); handleNavigateChat(ctx); }}
                isLoading={isHomeDataLoading}
                isDemo={isDemo}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
      {activeTab === 'monitor' && (
        <div className="absolute inset-0 z-10 bg-surface-1 flex flex-col animate-tab-in">
          <div className="flex-shrink-0 flex items-center px-4 py-3 border-b border-glass-border">
            <button
              onClick={() => setActiveTab(previousTab as Tab)}
              className="text-text-secondary hover:text-text-primary text-sm flex items-center gap-1 transition-colors cursor-pointer select-none active:opacity-70"
            >
              {t('common.back')}
            </button>
            <span className="ml-3 text-sm font-medium text-text-primary">{t('tabs.monitor')}</span>
          </div>
          <div className="flex-1 min-h-0">
            <ErrorBoundary>
              <MonitorTab onTalkToAI={handleMonitorTalkToAI} onImpulseAlert={handleImpulseAlert} isDemo={isDemo} onAuthPrompt={showAuthPrompt} />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </>
  );
}
