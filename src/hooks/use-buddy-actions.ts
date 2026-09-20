/**
 * useBuddyActions — Round 126 用户决策 7 (#4)
 *
 * 🔧 提取自 use-buddy-state-rq.ts:484-538
 *    addTokens, revive, useHealingKit, forceRefresh
 *
 * 将 use-buddy-state-rq.ts 从 557 行降到 ~470 行 (低于 500 限制)
 */

'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { symyEvents } from '@/lib/posthog';
import { getHealthFromVitality } from '@/lib/buddy-defaults';
import type { BuddyState } from './buddy-state-helpers';
import { BUDDY_STATE_KEY } from './use-buddy-state-rq';

interface PushMutation {
  mutate: (state: BuddyState) => void;
  mutateAsync: (state: BuddyState) => Promise<unknown>;
}

export function useBuddyActions(pushMutation: PushMutation) {
  const queryClient = useQueryClient();

  const addTokens = useCallback((amount: number, reason: 'survival' | 'growth' | 'pleasure') => {
    const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
    if (!prev) return;

    const newTokens = prev.tokens + amount;
    const vitalityBoost = reason === 'survival' ? 2 : reason === 'growth' ? 5 : 3;
    const newXp = prev.xp + (reason === 'growth' ? 20 : reason === 'pleasure' ? 15 : 10);
    const leveledUp = newXp >= prev.xpToNext;
    const newVitality = Math.min(100, prev.vitality + vitalityBoost);

    pushMutation.mutate({
      ...prev,
      tokens: newTokens,
      vitality: newVitality,
      health: getHealthFromVitality(newVitality),
      xp: leveledUp ? newXp - prev.xpToNext : newXp,
      xpToNext: leveledUp ? Math.floor(prev.xpToNext * 1.3) : prev.xpToNext,
      level: leveledUp ? prev.level + 1 : prev.level,
      lastHealingKitAt: reason === 'pleasure' ? new Date().toISOString() : prev.lastHealingKitAt,
    });
  }, [queryClient, pushMutation]);

  const revive = useCallback(async (depositAmount: number) => {
    const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
    if (!prev) return;

    try {
      await pushMutation.mutateAsync({
        ...prev,
        vitality: Math.min(100, prev.vitality + 30),
        health: getHealthFromVitality(Math.min(100, prev.vitality + 30)),
        totalSaved: prev.totalSaved + depositAmount,
      });
      symyEvents.depositMade({ amount: depositAmount, source: 'revive' });
    } catch {
      // React Query onError will rollback; no analytics on failure
    }
  }, [queryClient, pushMutation]);

  // eslint-disable-next-line symy/no-async-callback-mutation
  const useHealingKit = useCallback(async (): Promise<'success' | 'already_used' | 'error'> => {
    try {
      await apiFetch('/api/buddy/healing-kit', { method: 'POST' });
      return 'success';
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        return 'already_used';
      }
      logger.warn('[BuddyStateRQ] Healing kit failed:', err);
      return 'error';
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lastManualInvalidateRef is private to use-buddy-state-rq, injected via opts
  const forceRefresh = useCallback((opts?: { manualInvalidateRef?: React.MutableRefObject<number> }) => {
    // 🔧 P0-3 fix (2026-07-17): 记录 manual invalidate 时间, 让 Realtime dedup 短窗口内能跳过
    if (opts?.manualInvalidateRef) {
      opts.manualInvalidateRef.current = Date.now();
    }
    queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
  }, [queryClient]);

  // 🔧 Round 126 用户决策 7 (#4): reorderDreamFunds 也提取到此处
  // eslint-disable-next-line symy/no-async-callback-mutation
  const reorderDreamFunds = useCallback(async (newOrder: string[]) => {
    const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
    if (!prev) return;

    const reordered = newOrder
      .map(id => prev.dreamFunds.find(f => f.id === id))
      .filter((f): f is NonNullable<typeof f> => f !== undefined);
    const missing = prev.dreamFunds.filter(f => !newOrder.includes(f.id));

    queryClient.setQueryData(BUDDY_STATE_KEY, {
      ...prev,
      dreamFunds: [...reordered, ...missing],
    });

    for (let i = 0; i < reordered.length; i++) {
      try {
        await apiFetchVoid('/api/buddy/dream-funds', {
          method: 'PATCH',
          body: { fund_id: reordered[i].id, sort_order: i },
        });
      // safe to ignore: non-critical background operation, error already logged
      } catch (err) {
                      // safe to ignore: non-critical background operation, error already logged
        logger.warn(`[BuddyStateRQ] Reorder PATCH failed for fund ${newOrder[i]}:`, err);
      }
    }
  }, [queryClient]);

  return { addTokens, revive, useHealingKit, forceRefresh, reorderDreamFunds };
}
