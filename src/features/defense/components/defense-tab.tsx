/**
 * DefenseTab — The Guard Grove (守护林) main Tab component
 *
 * Green guard narrative: guardians, growth, and choices kept
 * - Daily Reflection (今日觉察)
 * - Awakening Stories (社群故事)
 * - Community Challenges (社群挑战)
 * - Spending Insights overlay (secondary)
 */

'use client';

import { useState } from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import type { GuardRankStats } from '@/lib/guard-rank';
import { useCommunityStats } from '../hooks/use-community-stats';
import { useCommunityChallenges } from '../hooks/use-community-challenges';
import { CommunityChallengeList } from './community-challenge-list';
import { AwakeningStories } from './awakening-stories';
import { DailyReflection } from './daily-reflection';
import { PlatformInduceIndex } from './platform-induce-index';
import { InducementStrategies } from './inducement-strategies';
import { DefenseTabDemo } from './defense-tab-demo';
import { DefenseHeroStats } from './defense-hero-stats';

export interface DefenseTabProps {
  isDemo: boolean;
  onAuthPrompt: (feature: string) => void;
  userTotalSaved?: number;
  userDefenderNumber?: number | null;
  guardRankStats?: GuardRankStats | null;
}

export function DefenseTab({ isDemo, onAuthPrompt, userTotalSaved, userDefenderNumber, guardRankStats }: DefenseTabProps) {
  const { t, locale } = useI18n();
  // 🔧 batch81-b: strategies 走真数据 API, strategiesSource/strategiesLoading 单独透传
  //   (不并入 isLoading — 其它板块的骨架时序保持不变)
  const { stats, platformIndex, strategies, strategiesSource, strategiesLoading, isLoading } = useCommunityStats(isDemo);
  const { challenges, isLoading: challengesLoading, joinChallenge, checkin, actionLoading } = useCommunityChallenges(isDemo);
  const [showDetailsOverlay, setShowDetailsOverlay] = useState(false);

  if (isDemo) {
    return <DefenseTabDemo onAuthPrompt={onAuthPrompt} stats={stats} platformIndex={platformIndex} strategies={strategies} challenges={challenges} joinChallenge={joinChallenge} checkin={checkin} actionLoading={actionLoading} t={t} locale={locale} />;
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-4 relative">
      {/* Hero + 详情按钮 */}
      <div className="px-4 pt-6 pb-3 text-center relative">
        <h1 className="text-2xl font-bold gradient-text">
          {t('defense.title', { defaultValue: '🌱 The Guard Grove' })}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t('defense.subtitle', { defaultValue: 'A community of green spenders. Less bought, less made — together.' })}
        </p>
        <button
          onClick={() => setShowDetailsOverlay(true)}
          className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-glass-fill hover:bg-glass-hover flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors z-10"
          aria-label={t('defense.details', { defaultValue: 'Details' })}
        >
          <Info className="w-5 h-5" />
        </button>
      </div>

      <DefenseHeroStats
        stats={stats}
        isLoading={isLoading}
        userTotalSaved={userTotalSaved}
        userDefenderNumber={userDefenderNumber}
        guardRankStats={guardRankStats}
        t={t}
        locale={locale}
      />

      <DailyReflection isDemo={isDemo} onAuthPrompt={onAuthPrompt} />
      <AwakeningStories />

      <CommunityChallengeList
        challenges={challenges}
        isLoading={challengesLoading}
        isDemo={isDemo}
        onJoin={joinChallenge}
        onCheckin={checkin}
        actionLoading={actionLoading}
        t={t}
      />

      {/* Spending Insights overlay (weakened, secondary) */}
      {showDetailsOverlay && (
        <div className="fixed inset-0 z-[200] bg-surface-1 flex flex-col animate-tab-in max-w-md mx-auto">
          <div className="flex-shrink-0 flex items-center px-4 py-3 border-b border-glass-border">
            <button
              onClick={() => setShowDetailsOverlay(false)}
              className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">{t('common.back', { defaultValue: '← Back' })}</span>
            </button>
            <h2 className="text-base font-bold text-text-primary ml-4">
              {t('inward.detailsTitle', { defaultValue: 'Spending Insights' })}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <PlatformInduceIndex platforms={platformIndex} isLoading={isLoading} t={t} isDemo={isDemo} />
            <InducementStrategies strategies={strategies} isLoading={strategiesLoading} t={t} isDemo={isDemo} source={strategiesSource} />
            <p className="text-[10px] text-text-tertiary text-center py-3 px-4">
              {t('inward.dataSourceNote', { defaultValue: 'Based on anonymous reports from The Guard Grove community' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
