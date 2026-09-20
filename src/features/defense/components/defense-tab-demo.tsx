/**
 * DefenseTabDemo — 未登录用户看到的守护林 Tab (示例数据 + 注册引导)
 *
 * v3: Refactored to show Daily Reflection, Awakening Stories, Community Challenges
 */

'use client';

import type { CommunityStats, PlatformIndexItem, InducementStrategy } from '../hooks/use-community-stats';
import type { CommunityChallenge } from '../hooks/use-community-challenges';
import type { useI18n } from '@/i18n/provider';
import { DailyReflection } from './daily-reflection';
import { AwakeningStories } from './awakening-stories';
import { DefenseHeroStats } from './defense-hero-stats';

interface Props {
  onAuthPrompt: (feature: string) => void;
  stats: CommunityStats;
  platformIndex: PlatformIndexItem[];
  strategies: InducementStrategy[];
  challenges: CommunityChallenge[];
  joinChallenge: (id: string) => Promise<{ success: boolean; error?: string }>;
  checkin: (id: string) => Promise<{ success: boolean; currentDay?: number; status?: string; error?: string }>;
  actionLoading: boolean;
  t: ReturnType<typeof useI18n>['t'];
  locale: string;
}

const PLATFORM_ICONS: Record<string, string> = { tiktok_shop: '📱', livestream: '🎥', instagram: '📷', amazon: '📦', shein: '👗' };

export function DefenseTabDemo({ onAuthPrompt, stats, platformIndex: _platformIndex, strategies: _strategies, challenges, t, locale }: Props) {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-4">
      {/* Hero */}
      <div className="px-4 pt-6 pb-3 text-center">
        <h1 className="text-2xl font-bold gradient-text">
          {t('defense.title', { defaultValue: '🌱 The Guard Grove' })}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t('defense.subtitle', { defaultValue: 'A community of green spenders. Less bought, less made — together.' })}
        </p>
      </div>

      <DefenseHeroStats stats={stats} isLoading={false} isDemo t={t} locale={locale} />

      {/* Demo badge */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-center gap-2 py-1 px-3 rounded-full bg-glass-fill/60 border border-glass-border mx-auto w-fit">
          <span className="text-[10px] font-medium text-text-tertiary">
            {t('ahaMoment.demoBadge', { defaultValue: '🌱 Sample data' })}
          </span>
        </div>
      </div>

      {/* Daily Reflection — 保留 */}
      <DailyReflection isDemo={true} />

      <AwakeningStories />

      {/* Community Challenges (demo) */}
      {challenges.length > 0 && (
        <div className="px-4 mt-6">
          <h3 className="text-sm font-bold text-text-primary mb-3">
            {t('inward.challengesTitle', { defaultValue: 'Community Challenges' })}
          </h3>
          <div className="space-y-3">
            {challenges.map(c => {
              const daysLeft = c.totalDays - c.currentDay;
              const now = new Date();
              const startDate = new Date(c.startDate);
              const endDate = new Date(c.endDate);
              const isUpcoming = startDate.getTime() > now.getTime();
              const challengeActuallyEnded = endDate.getTime() < now.getTime();
              const isLastDay = daysLeft <= 0 && !challengeActuallyEnded;
              return (
              <div key={c.id} className="rounded-2xl bg-glass-fill/50 border border-glass-border p-4 opacity-80">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{c.platform ? (PLATFORM_ICONS[c.platform] || '🎯') : '🎯'}</span>
                  <p className="text-sm font-bold text-text-primary">{c.titleKey ? t(c.titleKey, { defaultValue: c.title }) : c.title}</p>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-tertiary">{t('defense.communityProgress', { defaultValue: 'Community progress' })}</span>
                  <span className={`text-[10px] ${isUpcoming ? 'text-cyan-400 font-bold' : daysLeft <= 1 ? 'text-amber-400 font-bold' : 'text-text-tertiary'}`}>
                    {isUpcoming
                      ? t('defense.startsTomorrow', { defaultValue: 'Starts tomorrow!' })
                      : `${t('defense.daySlashTotal', { current: c.currentDay, total: c.totalDays, defaultValue: `Day ${c.currentDay}/${c.totalDays}` })}${daysLeft === 1 ? ` · ${t('defense.endsTomorrow', { defaultValue: 'Ends tomorrow!' })}` : ''}${daysLeft === 0 ? ` · ${t('defense.endsToday', { defaultValue: 'Last day!' })}` : ''}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-2 text-[10px] text-text-tertiary">
                  <span>👥 {c.totalParticipants} {t('defense.joined', { defaultValue: 'joined' })}</span>
                  <span>🔥 {c.activeParticipants} {t('defense.active', { defaultValue: 'active' })}</span>
                </div>
                <div className="h-1.5 rounded-full bg-glass-fill overflow-hidden mb-3">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500" style={{ width: `${isUpcoming ? 0 : Math.round((c.currentDay / c.totalDays) * 100)}%` }} />
                </div>
                <button
                  onClick={() => onAuthPrompt('defense')}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-glass-fill text-text-tertiary border border-glass-border cursor-not-allowed"
                >
                  {challengeActuallyEnded
                    ? t('defense.challengeEndedShort', { defaultValue: 'Challenge ended' })
                    : isUpcoming
                      ? t('defense.joinUpcoming', { defaultValue: '🚀 Join (starts tomorrow)' })
                      : isLastDay
                        ? t('defense.joinLastDay', { defaultValue: '🔥 Last day! Join now' })
                        : t('defense.signUpToJoin', { defaultValue: 'Sign up to join' })}
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sign up CTA */}
      <div className="px-4 mt-8">
        <button
          onClick={() => onAuthPrompt('defense')}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-[0.98] cursor-pointer btn-shimmer"
        >
          {t('defense.signUpToJoinDefense', { defaultValue: 'Join The Guard Grove →' })}
        </button>
        <p className="text-[10px] text-text-tertiary mt-2 text-center">
          {t('defense.anonymousContribution', { defaultValue: 'Your reflections anonymously contribute to the community.' })}
        </p>
      </div>
    </div>
  );
}
