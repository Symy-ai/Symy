/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * useOnboardingFlow — 新手引导流程管理
 *
 * 🔧 架构优化 Round 65: 从 page.tsx 提取新手引导逻辑 (~90 行)
 *    好处:
 *      1. page.tsx 行数减少
 *      2. 引导逻辑独立, 可测试
 *      3. 关注点分离 — page.tsx 专注 tab 组合, 此 hook 专注引导
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

export interface UseOnboardingFlowArgs {
  user: User | null;
  loading: boolean;
  isDemo: boolean;
}

export interface UseOnboardingFlowResult {
  showOnboarding: boolean;
  handleOnboardingComplete: () => void;
  handleOnboardingSkip: () => void;
  closeOnboarding: () => void; // 🔧 用于 aha-moment 完成后关闭 onboarding
}

export function useOnboardingFlow({ user, loading, isDemo }: UseOnboardingFlowArgs): UseOnboardingFlowResult {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const isDemoRef = useRef(isDemo);
  useEffect(() => { isDemoRef.current = isDemo; }, [isDemo]);

  useEffect(() => {
    if (loading) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    if (isDemo) {
      try {
        const seen = localStorage.getItem('symy-onboarding-seen');
        if (!seen) {
          timer = setTimeout(() => { if (!cancelled) setShowOnboarding(true); }, 800);
        }
      } catch {
        timer = setTimeout(() => { if (!cancelled) setShowOnboarding(true); }, 800);
      }
    } else if (user?.id) {
      // 🔧 PM fix (2026-07-17): 删除 demo onboarding 同步逻辑
      //   旧代码: 如果 localStorage 有 'symy-onboarding-seen' (demo 模式设置),
      //          自动 PUT onboarding_completed=true → 新用户跳过新手引导
      //   问题: 测试账号在 demo 模式浏览过, localStorage 存了 symy-onboarding-seen,
      //         新注册用户登录后这个值还在 → 自动跳过 onboarding
      //   修复: 新注册用户始终显示 onboarding (由 profiles.onboarding_completed 控制)
      //         demo 模式的 localStorage 不再影响真实用户

  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
      apiFetch<{ onboarding_completed?: boolean }>('/api/user/onboarding')
        .then((data) => {
          if (cancelled) return;
          if (!data.onboarding_completed) {
            timer = setTimeout(() => { if (!cancelled) setShowOnboarding(true); }, 800);
          }
        })
        .catch((err) => { if (!cancelled) logger.error('[onboarding] check failed:', err); });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, loading, isDemo]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    if (isDemoRef.current) {
      // safe to ignore: non-critical background operation, error already logged
      try { localStorage.setItem('symy-onboarding-seen', 'true'); } catch { logger.warn('[Onboarding] localStorage.setItem failed (privacy mode?)'); }
            // safe to ignore: non-critical background operation, error already logged
    } else {
      apiFetchVoid('/api/user/onboarding', {
        method: 'PUT',
        body: { onboarding_completed: true },
      }).catch(err => logger.warn('[Onboarding] sync failed:', err));
    }
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
    if (isDemoRef.current) {
      // safe to ignore: non-critical background operation, error already logged
      try { localStorage.setItem('symy-onboarding-seen', 'true'); } catch { logger.warn('[Onboarding] localStorage.setItem failed (privacy mode?)'); }
            // safe to ignore: non-critical background operation, error already logged
    } else {
      apiFetchVoid('/api/user/onboarding', {
        method: 'PUT',
        body: { onboarding_completed: true },
      }).catch(err => logger.warn('[Onboarding] sync failed:', err));
    }
  }, []);

  const closeOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return { showOnboarding, handleOnboardingComplete, handleOnboardingSkip, closeOnboarding };
}
