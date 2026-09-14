/**
 * useCommunityChallenges — 社区挑战 hook
 *
 * - fetch: 活跃挑战列表 + 用户参与状态
 * - joinChallenge(challengeId): 加入挑战
 * - checkin(challengeId): 每日签到
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export interface CommunityChallenge {
  id: string;
  title: string;
  titleKey: string | null;
  description: string | null;
  platform: string | null;
  maxAmount: number | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  currentDay: number;
  totalParticipants: number;
  activeParticipants: number;
  completedParticipants: number;
  myStatus: string | null; // 'active' | 'completed' | 'failed' | null
  myCurrentDay: number;
  myLastCheckinDate: string | null;
}

export function useCommunityChallenges(isDemo: boolean) {
  const [challenges, setChallenges] = useState<CommunityChallenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (isDemo) {
      // Demo 模式: 示例数据
      setChallenges([
        {
          id: 'demo-1',
          title: '7-day no TikTok Shop',
          titleKey: 'defense.challenge.tiktok',
          description: 'No purchases from TikTok Shop recommendations for 7 days',
          platform: 'tiktok_shop',
          maxAmount: null,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          totalDays: 7,
          currentDay: 3,
          totalParticipants: 127,
          activeParticipants: 89,
          completedParticipants: 12,
          myStatus: null,
          myCurrentDay: 0,
          myLastCheckinDate: null,
        },
        {
          id: 'demo-2',
          title: '7-day no livestream buys',
          titleKey: 'defense.challenge.livestream',
          description: 'No purchases from any livestream for 7 days',
          platform: 'livestream',
          maxAmount: null,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          totalDays: 7,
          currentDay: 5,
          totalParticipants: 89,
          activeParticipants: 67,
          completedParticipants: 8,
          myStatus: null,
          myCurrentDay: 0,
          myLastCheckinDate: null,
        },
        {
          id: 'demo-3',
          title: '7-day no $50+ impulse buys',
          titleKey: 'defense.challenge.budget50',
          description: 'No non-essential purchases over $50 for 7 days',
          platform: null,
          maxAmount: 50,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          totalDays: 7,
          currentDay: 4,
          totalParticipants: 156,
          activeParticipants: 112,
          completedParticipants: 23,
          myStatus: null,
          myCurrentDay: 0,
          myLastCheckinDate: null,
        },
      ]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiFetch<{ challenges: CommunityChallenge[] }>('/api/community/challenges');
      setChallenges(data.challenges || []);
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[useCommunityChallenges] Failed to fetch:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // eslint-disable-next-line symy/no-async-callback-mutation
  const joinChallenge = useCallback(async (challengeId: string): Promise<{ success: boolean; error?: string }> => {
    if (isDemo) return { success: false };
    setActionLoading(true);
    try {
      await apiFetch('/api/community/challenges/join', {
        method: 'POST',
        body: { challengeId },
      });
      await refresh();
      return { success: true };
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[useCommunityChallenges] Join failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed' };
    } finally {
      setActionLoading(false);
    }
  }, [isDemo, refresh]);

  const checkin = useCallback(async (challengeId: string): Promise<{ success: boolean; currentDay?: number; status?: string; error?: string }> => {
    if (isDemo) return { success: false };
    setActionLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; currentDay: number; status: string; error?: string }>('/api/community/challenges/checkin', {
        method: 'POST',
        body: { challengeId },
      });
      if (result.success) {
        await refresh();
      }
      return result;
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[useCommunityChallenges] Checkin failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed' };
    } finally {
      setActionLoading(false);
    }
  }, [isDemo, refresh]);

  return {
    challenges,
    isLoading,
    actionLoading,
    joinChallenge,
    checkin,
    refresh,
  };
}
