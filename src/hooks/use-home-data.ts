/**
 * useHomeData — Home tab data loading (email receipts + health events)
 *
 * 🔧 Round 102: Extracted from page.tsx (848 lines → ~780 lines).
 *    This hook encapsulates:
 *    - Loading email receipts (actionable + refunded) in parallel
 *    - Loading health events
 *    - AbortController for canceling stale requests
 *    - User switch cleanup (clears data to prevent cross-user leak)
 *
 *    page.tsx now just calls useHomeData() and uses the returned state.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { EmailReceipt } from '@/lib/supabase';

export interface HealthEventLite {
  id: string;
  eventType: string;
  createdAt: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface UseHomeDataResult {
  emailReceipts: EmailReceipt[];
  healthEvents: HealthEventLite[];
  isHomeDataLoading: boolean;
}

export function useHomeData(userId: string | undefined): UseHomeDataResult {
  const [emailReceipts, setEmailReceipts] = useState<EmailReceipt[]>([]);
  const [healthEvents, setHealthEvents] = useState<HealthEventLite[]>([]);
  const [isHomeDataLoading, setIsHomeDataLoading] = useState(true);
  const homeDataAbortRef = useRef<AbortController | null>(null);
  const prevUserIdRef = useRef<string | undefined>(undefined);

  const loadHomeData = useCallback(async () => {
    if (!userId) return;
    setIsHomeDataLoading(true);

    // 🔧 ARCH fix (Round 15 audit H2): abort old request, don't skip new one
    //   Old code: if (isLoadingRef.current) return; → blocked user-switch data load
    //   New code: abort old + continue (abort makes old request fail fast, ref cleared in finally)
    if (homeDataAbortRef.current) homeDataAbortRef.current.abort();
    const abortController = new AbortController();
    homeDataAbortRef.current = abortController;

    try {
      const [actionableResult, refundedResult, healthResult] = await Promise.allSettled([
        apiFetch<{ receipts?: EmailReceipt[] }>('/api/email/receipts?status=actionable&limit=50', { signal: abortController.signal }),
        apiFetch<{ receipts?: EmailReceipt[] }>('/api/email/receipts?status=refunded&limit=50', { signal: abortController.signal }),
        apiFetch<{ events?: HealthEventLite[] }>('/api/buddy/health-events?limit=50', { signal: abortController.signal }),
      ]);

      const actionable = actionableResult.status === 'fulfilled' ? actionableResult.value.receipts || [] : [];
      const refunded = refundedResult.status === 'fulfilled' ? refundedResult.value.receipts || [] : [];
      setEmailReceipts([...actionable, ...refunded]);

      const healthData = healthResult.status === 'fulfilled' ? healthResult.value.events || [] : [];
      setHealthEvents(healthData);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.error('Failed to load home data:', err);
    } finally {
      const isCurrentRequest = homeDataAbortRef.current === abortController;
      if (isCurrentRequest) {
        homeDataAbortRef.current = null;
        setIsHomeDataLoading(false);
      }
    }
  }, [userId]);

  // Load on mount and when user changes
  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  // Clear user data on user switch (prevent cross-user leak)
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      setEmailReceipts([]);
      setHealthEvents([]);
      prevUserIdRef.current = userId;
    }
  }, [userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (homeDataAbortRef.current) {
        homeDataAbortRef.current.abort();
        homeDataAbortRef.current = null;
      }
    };
  }, []);

  return { emailReceipts, healthEvents, isHomeDataLoading };
}
