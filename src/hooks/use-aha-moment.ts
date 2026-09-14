/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * useAhaMoment — Aha Moment 引导流程状态管理
 *
 * 提取自 src/app/page.tsx (Round 2 拆分)
 * 管理: showAhaMoment state + 首次访问检查 + 导航/完成/跳过 handlers
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ChallengeContext } from '@/types/challenge-context';

interface UseAhaMomentOptions {
  isDemoRef: React.MutableRefObject<boolean>;
  loading: boolean;
  user?: { id: string } | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  setChatContextMessage: (msg: string | undefined) => void;
  setChallengeContext: (ctx: ChallengeContext | undefined) => void;
  setActiveTab: (tab: string) => void;
}

export function useAhaMoment({
  isDemoRef,
  loading,
  user,
  t,
  setChatContextMessage,
  setChallengeContext,
  setActiveTab,
}: UseAhaMomentOptions) {
  const [showAhaMoment, setShowAhaMoment] = useState(false);
  const [ahaChallengeContext, setAhaChallengeContext] = useState<ChallengeContext | null>(null);

  // 首次访问检查
  useEffect(() => {
    if (loading) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    if (isDemoRef.current) {
      try {
        const seen = localStorage.getItem('symy-aha-moment-seen');
        if (!seen) {
          timer = setTimeout(() => { if (!cancelled) setShowAhaMoment(true); }, 800);
        }
      } catch {
        timer = setTimeout(() => { if (!cancelled) setShowAhaMoment(true); }, 800);
      }
    } else if (user?.id) {
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
      apiFetch<{ onboarding_completed?: boolean }>('/api/user/onboarding')
        .then((data) => {
          if (cancelled) return;
          if (!data.onboarding_completed) {
            timer = setTimeout(() => { if (!cancelled) setShowAhaMoment(true); }, 800);
          }
        })
        .catch((err) => { if (!cancelled) logger.error('[aha-moment] check failed:', err); });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, loading, isDemoRef]);

  const handleAhaNavigateToChallenge = useCallback((context: ChallengeContext) => {
    setAhaChallengeContext(context);
    setChatContextMessage(t('navigation.challengePurchase'));
    setChallengeContext(context);
    setShowAhaMoment(false);
    setActiveTab('chat');
  }, [t, setChatContextMessage, setChallengeContext, setActiveTab]);

  const handleAhaComplete = useCallback(() => {
    setShowAhaMoment(false);
    setAhaChallengeContext(null);
    if (isDemoRef.current) {
      // safe to ignore: non-critical background operation, error already logged
      try { localStorage.setItem('symy-aha-moment-seen', 'true'); } catch { logger.warn('[AhaMoment] localStorage.setItem failed (privacy mode?)'); }
            // safe to ignore: non-critical background operation, error already logged
    } else {
      apiFetchVoid('/api/user/onboarding', {
        method: 'PUT',
        body: { onboarding_completed: true },
      }).catch(err => logger.warn('[AhaMoment] sync failed:', err));
    }
  }, [isDemoRef]);

  const handleAhaSkip = useCallback(() => {
    setShowAhaMoment(false);
    setAhaChallengeContext(null);
    if (isDemoRef.current) {
      // safe to ignore: non-critical background operation, error already logged
      try { localStorage.setItem('symy-aha-moment-seen', 'true'); } catch { logger.warn('[AhaMoment] localStorage.setItem failed (privacy mode?)'); }
            // safe to ignore: non-critical background operation, error already logged
    } else {
      apiFetchVoid('/api/user/onboarding', {
        method: 'PUT',
        body: { onboarding_completed: true },
      }).catch(err => logger.warn('[AhaMoment] sync failed:', err));
    }
  }, [isDemoRef]);

  return {
    showAhaMoment,
    setShowAhaMoment,
    ahaChallengeContext,
    setAhaChallengeContext,
    handleAhaNavigateToChallenge,
    handleAhaComplete,
    handleAhaSkip,
  };
}
