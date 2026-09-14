/**
 * CommunityChallengeList — 社区挑战列表
 */

'use client';

import { useI18n } from '@/i18n/provider';
import type { CommunityChallenge } from '../hooks/use-community-challenges';
import { CommunityChallengeCard } from './community-challenge-card';

interface Props {
  challenges: CommunityChallenge[];
  isLoading: boolean;
  isDemo: boolean;
  onJoin: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCheckin: (id: string) => Promise<{ success: boolean; currentDay?: number; status?: string; error?: string }>;
  actionLoading: boolean;
  t: ReturnType<typeof useI18n>['t'];
}

export function CommunityChallengeList({ challenges, isLoading, isDemo, onJoin, onCheckin, actionLoading, t }: Props) {
  if (isLoading) {
    return (
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">
          {t('inward.challengesTitle', { defaultValue: 'Community Challenges' })}
        </h3>
        <div className="space-y-3 animate-pulse">
          {[1, 2].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-glass-fill/50 border border-glass-border" />
          ))}
        </div>
      </div>
    );
  }

  if (!challenges.length) {
    return (
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-text-primary mb-3">
          {t('inward.challengesTitle', { defaultValue: 'Community Challenges' })}
        </h3>
        <div className="rounded-2xl bg-glass-fill/30 border border-glass-border p-6 text-center">
          <p className="text-xs text-text-tertiary">
            {t('defense.noChallenges', { defaultValue: 'No active challenges this week. Check back soon!' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 mt-6">
      <h3 className="text-sm font-bold text-text-primary mb-3">
        {t('inward.challengesTitle', { defaultValue: 'Community Challenges' })}
      </h3>
      <div className="space-y-3">
        {challenges.map(challenge => (
          <CommunityChallengeCard
            key={challenge.id}
            challenge={challenge}
            isDemo={isDemo}
            onJoin={onJoin}
            onCheckin={onCheckin}
            actionLoading={actionLoading}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
