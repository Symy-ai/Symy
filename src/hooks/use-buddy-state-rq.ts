/**
 * useBuddyStateRQ — React Query-based buddy state hook.
 *
 * 🔧 Round 95: Replaces Dexie + buddy-sync (1487 lines across 8 files) with
 *    React Query (~200 lines). React Query handles:
 *    - Caching (replaces Dexie/IndexedDB)
 *    - Dedup (replaces api-client dedupe)
 *    - Retry (replaces buddy-sync push retry)
 *    - Optimistic updates + rollback (replaces manual markLocalDirty + pushToServer)
 *    - Background refetch (replaces polling fallback)
 *    - Window focus refetch (replaces visibilitychange handler)
 *
 *    Supabase Realtime still handles cross-device sync by invalidating the query
 *    when a buddy_state UPDATE event arrives.
 *
 *    The server-side optimistic locking (version CAS in PUT /api/buddy/state)
 *    is still used — React Query's mutation onError handler triggers a refetch
 *    on 409, which is equivalent to the old buddy-sync 409 merge logic.
 *
 * Key simplification:
 *    - No more Dexie (IndexedDB) — React Query's in-memory cache is enough
 *    - No more module-level mutable state (15 variables) — React Query manages cache
 *    - No more manual debounced push — mutations are immediate
 *    - No beforeunload handler — React Query persists to cache, server is source of truth
 *    - No 409 merge logic — on 409, refetch gets server state (simple, correct)
 */

'use client';

import { symyEvents } from '@/lib/posthog';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useBuddyActions } from './use-buddy-actions';
import {
  DEFAULT_VITALITY,
  DEFAULT_TOKENS,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  getHealthFromVitality,
} from '@/lib/buddy-defaults';
import type { BuddyState, BuddyHealth, DreamFund } from '@/types/buddy-state';
import { generateDreamFundId } from '@/lib/id-helpers';
// eslint-disable-next-line no-duplicate-imports
import { SAVINGS_FUND_ID, DEFAULT_DREAM_FUNDS } from '@/lib/buddy-defaults';
import { useCallback, useEffect, useId, useRef } from 'react';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { useBuddyTimers } from './use-buddy-timers';
import { useAuth } from '@/components/auth/auth-provider';

// ============================================================
// Types
// ============================================================

interface BuddyStateResponse {
  buddyState?: Record<string, unknown>;
  version?: number;
}

interface BuddyStatePutResponse {
  version?: number;
}

// ============================================================
// Query key
// ============================================================

export const BUDDY_STATE_KEY = ['buddy-state'] as const;

// Fallback when query hasn't loaded yet (prevents null access in components)
const DEMO_BUDDY_STATE_FALLBACK: BuddyState = {
  vitality: DEFAULT_VITALITY,
  tokens: DEFAULT_TOKENS,
  health: 'healthy',
  level: 1,
  xp: 0,
  xpToNext: 100,
  streak: 0,
  totalSaved: 0,
  challengesCompleted: 0,
  badges: [],
  dreamFunds: DEFAULT_DREAM_FUNDS,
  lastHealingKitAt: null,
  version: 0,
  growthStage: 'baby',
  personality: 'unknown',
  intimacy: 0,
  dailyNeeds: { clarity: 50, connection: 50 },
  proactiveMessages: [],
  personalityAwakenedAt: null,
  lastActiveAt: null,
};

// ============================================================
// Server → Local state conversion
// ============================================================

function serverToLocal(data: Record<string, unknown>, version: number): BuddyState {
  // 🔧 Round 108 fix: API 返回 camelCase (dreamFunds, xpToNext, totalSaved, etc.),
  //   但旧代码读 snake_case (dream_funds, xp_to_next, total_saved) → undefined → fallback to defaults
  //   修复: 优先读 camelCase, fallback 到 snake_case (兼容旧 API)
  return {
    vitality: Number(data.vitality ?? DEFAULT_VITALITY),
    tokens: Number(data.tokens ?? DEFAULT_TOKENS),
    health: (data.health as BuddyHealth) ?? 'healthy',
    level: Number(data.level ?? 1),
    xp: Number(data.xp ?? 0),
    xpToNext: Number(data.xpToNext ?? data.xp_to_next ?? 100),
    streak: Number(data.streak ?? 0),
    totalSaved: Number(data.totalSaved ?? data.total_saved ?? 0),
    challengesCompleted: Number(data.challengesCompleted ?? data.challenges_completed ?? 0),
    badges: Array.isArray(data.badges) ? data.badges as string[] : [],
    dreamFunds: Array.isArray(data.dreamFunds) ? data.dreamFunds as DreamFund[] : (Array.isArray(data.dream_funds) ? data.dream_funds as DreamFund[] : DEFAULT_DREAM_FUNDS),
    lastHealingKitAt: ((data.lastHealingKitAt ?? data.last_healing_kit_at) as string | null) ?? null,
    version,
    growthStage: ((data.growthStage ?? data.growth_stage) as BuddyState['growthStage']) ?? 'baby',
    personality: (data.personality as BuddyState['personality']) ?? 'unknown',
    intimacy: Number(data.intimacy ?? 0),
    dailyNeeds: ((data.dailyNeeds ?? data.daily_needs) as BuddyState['dailyNeeds']) ?? { clarity: 50, connection: 50 },
    proactiveMessages: Array.isArray(data.proactiveMessages) ? data.proactiveMessages as BuddyState['proactiveMessages'] : (Array.isArray(data.proactive_messages) ? data.proactive_messages as BuddyState['proactiveMessages'] : []),
    personalityAwakenedAt: ((data.personalityAwakenedAt ?? data.personality_awakened_at) as string | null) ?? null,
    lastActiveAt: ((data.lastActiveAt ?? data.last_active_at) as string | null) ?? null,
  };
}

function localToServer(state: BuddyState): Record<string, unknown> {
  // 🔧 2026-07-15 (ARCH-10 P0-7 对抗式审查修复):
  //    只发送服务端允许 PUT 的字段 (timer drain/bonus 需要的字段)
  //    移除: totalSaved, challengesCompleted, badges, lastHealingKitAt,
  //          growthStage, personality, intimacy, dailyNeeds, proactiveMessages,
  //          personalityAwakenedAt, lastActiveAt, dreamFunds
  //    这些字段现在由服务端 RPC 独占管理, 客户端 PUT 会被忽略
  //    保留它们只浪费带宽 + 可能在未来引入 bug
  //    注意: lastDrainAt 不在 BuddyState 类型里 (timer 用 localStorage 存),
  //          服务端 PUT route 会用 new Date().toISOString() 作为 fallback
  return {
    vitality: state.vitality,
    tokens: state.tokens,
    health: state.health,
    level: state.level,
    xp: state.xp,
    xpToNext: state.xpToNext,
    streak: state.streak,
    version: state.version,
  };
}

// ============================================================
// Main hook
// ============================================================

export function useBuddyStateRQ(isDemo = false) {
  const queryClient = useQueryClient();
  const realtimeChannelRef = useRef<unknown>(null);
  const { user } = useAuth();
  // 🔧 batch73-a: 实例级唯一频道后缀 (useId 跨实例唯一; 去掉 React 19 的 «» 等非安全字符)
  const channelNonce = useId().replace(/[^a-zA-Z0-9]/g, '');

  // ============================================================
  // Query: Fetch buddy state from server
  // ============================================================
  const { data: buddyState, isLoading, error } = useQuery({
    queryKey: BUDDY_STATE_KEY,
    queryFn: async () => {
      if (isDemo) {
        return {
          vitality: 72,
          tokens: 50,
          health: 'healthy' as BuddyHealth,
          level: 3,
          xp: 120,
          xpToNext: 200,
          streak: 0,
          totalSaved: 0,
          challengesCompleted: 0,
          badges: [],
          dreamFunds: DEFAULT_DREAM_FUNDS,
          lastHealingKitAt: null,
          version: 0,
          growthStage: 'baby' as const,
          personality: 'unknown' as const,
          intimacy: 0,
          dailyNeeds: { clarity: 50, connection: 50 },
          proactiveMessages: [],
          personalityAwakenedAt: null,
          lastActiveAt: null,
        } as BuddyState;
      }

      const data = await apiFetch<BuddyStateResponse>('/api/buddy/state');
      if (!data.buddyState) {
        throw new Error('No buddy state returned');
      }
      return serverToLocal(data.buddyState, data.version ?? 1);
    },
    // 🔧 F2 fix (Round 101): Gate on user being authenticated.
    //   Old code: `enabled: !isDemo || true` → always true → fired 401 on cold load before login.
    //   New code: require user to be authenticated before fetching (unless demo mode).
    //   Demo mode bypasses the auth check (returns static data without hitting the API).
    enabled: isDemo || !!user,
    // 🔧 BUG-003 fix: Override the short global staleTime (30s) for buddy state.
    //   The global 30s staleTime means any component re-render after 30s triggers
    //   a background refetch. Tab switching causes re-renders (hidden/inert toggling),
    //   so switching tabs after 30s would fire a refetch that races with concurrent
    //   optimistic updates (timer drain, addTokens, dream fund mutations) → the
    //   refetch response (stale server data without the optimistic change) overwrites
    //   the optimistic update → Tokens/Mood/EXP visibly jump.
    //   Buddy state already gets pushed to the client via Supabase Realtime, so we
    //   don't need aggressive polling. A 5-minute staleTime is sufficient — Realtime
    //   invalidation is the primary freshness mechanism.
    staleTime: 5 * 60_000, // 5 min — Realtime handles freshness; avoid refetch races
  });
  const pushMutation = useMutation({
    mutationFn: async (newState: BuddyState) => {
      // 🔧 F3 note (Round 101): This PUT /api/buddy/state uses version CAS (optimistic locking).
      //   The ESLint rule symy/no-put-state-endpoints flags this as an F3 risk.
      //   Long-term fix: migrate to apply_buddy_state_delta RPC (handles versioning server-side).
      //   Short-term: the onMutate/onError/onSuccess handlers below correctly handle 409 by
      //   invalidating the query to refetch server state. This is the recommended recovery pattern.
      // eslint-disable-next-line symy/no-put-state-endpoints -- F3: version CAS with 409 refetch recovery (see note)
      const result = await apiFetch<BuddyStatePutResponse>('/api/buddy/state', {
        method: 'PUT',
        body: { buddyState: localToServer(newState) },
      });
      return result;
    },
    onMutate: async (newState: BuddyState) => {
      // Optimistic update — cancel outgoing refetches so they don't overwrite
      await queryClient.cancelQueries({ queryKey: BUDDY_STATE_KEY });

      // Snapshot previous value for rollback
      const previousState = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);

      // Optimistically update cache
      queryClient.setQueryData(BUDDY_STATE_KEY, newState);

      return { previousState };
    },
    onError: (err, _newState, context) => {
      // Rollback on error
      if (context?.previousState) {
        queryClient.setQueryData(BUDDY_STATE_KEY, context.previousState);
      }

      // On 409 conflict, refetch to get server state
      if (err instanceof ApiError && err.status === 409) {
        logger.info('[BuddyStateRQ] Version conflict (409), refetching server state');
        queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
      } else {
        logger.warn('[BuddyStateRQ] Push failed:', err);
      }
    },
    onSuccess: (data, newState) => {
      // 🔧 BUG-003 fix: Use functional updater to avoid clobbering concurrent changes.
      //   Old code: setQueryData(key, { ...newState, version }) — full replacement
      //   that overwrites any concurrent cache changes (Realtime refetch, timer
      //   drain, other mutations) that arrived between onMutate and onSuccess.
      //   New code: only update the version from the server response, preserving
      //   the current cache state.
      const newVersion = data.version ?? newState.version + 1;
      queryClient.setQueryData<BuddyState>(BUDDY_STATE_KEY, (current) => {
        if (!current) return { ...newState, version: newVersion };
        // Only advance the version if it's newer than what's already cached
        if (current.version >= newVersion) return current;
        return { ...current, version: newVersion };
      });
    },
  });

// ============================================================
// Supabase Realtime subscription — invalidate query on server UPDATE
// 🔧 Round 97 P1 fix: add user_id filter (was subscribing to ALL users' updates)
// 🔧 Round 97 P1 fix: re-subscribe when user changes (was only depending on isDemo)
// 🔧 P0-3 fix (2026-07-17): 加 invalidate dedup — forceRefresh 短窗口内 Realtime 触发的
//   invalidate 跳过 (避免 Saw it 后 9s 内 buddy/state 被 fetch 4 次)
// 🔧 batch73-a: 频道名带实例级唯一后缀 — 本 hook 有两个同挂载消费方 (page.tsx 应用级 +
//   设置面板 GuardProfileExportSetting)。supabase.channel(同名) 会复用已 joined 的频道,
//   再 .on('postgres_changes') 被 supabase-js 同步 throw ("cannot add ... after subscribe()"),
//   effect 抛错直抵 ErrorBoundary → 打开设置面板整页降级为空态+重试 (用户报障 09-13)。
//   订阅失败本身非致命 (Realtime 只做 invalidate 加速), 再包一层 try/catch 保面板可开。
// ============================================================
const lastManualInvalidateRef = useRef<number>(0);
useEffect(() => {
  if (isDemo || !user?.id) return;

  const supabase = createBrowserSupabaseClient();
  if (!supabase) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;

  try {
    const channel = supabase
      .channel(`buddy_state_rq:${user.id}:${channelNonce}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'buddy_state',
          filter: `user_id=eq.${user.id}`, // 🔧 Round 97: only listen to THIS user's updates
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // 🔧 P0-3 fix (2026-07-17): 如果在 forceRefresh 短窗口 (3s) 内, 跳过 Realtime invalidate
            //   forceRefresh 已经触发了一次 fetch, Realtime 再触发会重复请求
            const sinceManual = Date.now() - lastManualInvalidateRef.current;
            if (sinceManual < 3000) {
              logger.info(`[BuddyStateRQ] 📡 Realtime UPDATE skipped (manual invalidate ${sinceManual}ms ago)`);
              debounceTimer = null;
              return;
            }
            logger.info('[BuddyStateRQ] 📡 Realtime UPDATE — invalidating query');
            queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
            debounceTimer = null;
          }, 2000);
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    unsubscribe = () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  } catch (err) {
    // safe to ignore: Realtime 只影响跨设备同步速度, 订阅失败不阻塞 buddy state 展示
    logger.warn('[BuddyStateRQ] Realtime subscribe failed (non-fatal):', err instanceof Error ? err.message : String(err));
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe?.();
  };
}, [isDemo, queryClient, user?.id, channelNonce]);

  // ============================================================
  // User switch: clear cache when user changes (prevent cross-user data leak)
  // 🔧 Round 97 P1 fix: old buddy-sync had resetSyncState(), RQ needs removeQueries
  // ============================================================
  useEffect(() => {
    if (!user?.id) {
      // User logged out — clear all buddy state from cache
      queryClient.removeQueries({ queryKey: BUDDY_STATE_KEY });
    }
  }, [user?.id, queryClient]);

  // ============================================================
  // Timers — token drain + streak bonus (React Query compatible)
  // ============================================================
  useBuddyTimers({
    isLoaded: !isLoading,
    userId: user?.id,
  });

  // ============================================================
  // Actions — dream fund CRUD (with useMutation optimistic update + rollback)
  // 🔧 Round 124 audit fix (AUDIT-1 #2): 迁移 4 个 hand-rolled optimistic update closures
  //    到 useMutation (React Query 内置 optimistic update + rollback)
  //    旧代码: 手动 setQueryData + catch + setQueryData(prev) → 竞态条件
  //    新代码: useMutation onMutate/onError/onSettled → React Query 管理竞态
  // ============================================================

  const createDreamFundMutation = useMutation({
    mutationFn: async (fund: DreamFund) => {
      await apiFetchVoid('/api/buddy/dream-funds', {
        method: 'POST',
        body: { fund_id: fund.id, name: fund.name, target: fund.target, emoji: fund.emoji },
      });
      return fund.id;
    },
    onMutate: async (fund) => {
      await queryClient.cancelQueries({ queryKey: BUDDY_STATE_KEY });
      const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
      if (prev) {
        const newFund = { ...fund, current: 0 };
        const savingsIdx = prev.dreamFunds.findIndex(f => f.id === SAVINGS_FUND_ID);
        const newFunds = [...prev.dreamFunds];
        if (savingsIdx >= 0) {
          newFunds.splice(savingsIdx, 0, newFund);
        } else {
          newFunds.push(newFund);
        }
        queryClient.setQueryData(BUDDY_STATE_KEY, { ...prev, dreamFunds: newFunds });
      }
      return { prev };
    },
    onError: (_err, _fund, context) => {
      logger.warn('[BuddyStateRQ] Create dream fund failed — rolling back:', _err);
      if (context?.prev) {
        queryClient.setQueryData(BUDDY_STATE_KEY, context.prev);
      }
    },
    onSuccess: (_data, fund) => {
      symyEvents.dreamFundCreated({ name: fund.name, targetAmount: fund.target });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
    },
  });

  const createDreamFund = useCallback((fund: Omit<DreamFund, 'id'>) => {
    // 🔧 2026-07-21 audit fix (agent-4 #4): 旧代码在 mutationFn / onMutate / return 三处
    //    各调一次 generateDreamFundId() → 乐观 UI 用 ID-B, 服务端落 ID-A, 调用方拿 ID-C。
    //    refetch 后 React key 从 ID-B→ID-A 触发重挂 (闪烁/失焦), 且返回的 ID-C 不指向任何 fund。
    //    根因修复: 在此生成唯一 id, 透传给 mutate (进而 mutationFn + onMutate) 并返回同一个。
    const id = generateDreamFundId();
    createDreamFundMutation.mutate({ ...fund, id });
    return id;
  }, [createDreamFundMutation]);

  const updateDreamFundMutation = useMutation({
    mutationFn: async ({ fundId, updates }: { fundId: string; updates: Partial<Omit<DreamFund, 'id'>> }) => {
      await apiFetchVoid('/api/buddy/dream-funds', {
        method: 'PATCH',
        body: { fund_id: fundId, ...updates },
      });
    },
    onMutate: async ({ fundId, updates }) => {
      await queryClient.cancelQueries({ queryKey: BUDDY_STATE_KEY });
      const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
      if (prev) {
        queryClient.setQueryData(BUDDY_STATE_KEY, {
          ...prev,
          dreamFunds: prev.dreamFunds.map(f =>
            f.id === fundId
              ? { ...f, ...updates, current: Math.min(updates.target ?? f.target, updates.current ?? f.current) }
              : f
          ),
        });
      }
      return { prev };
    },
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    onError: (_err, { fundId }, context) => {
      logger.warn('[BuddyStateRQ] Update dream fund failed — rolling back:', _err);
      if (context?.prev) {
        queryClient.setQueryData(BUDDY_STATE_KEY, context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
    },
  });

  const updateDreamFund = useCallback((fundId: string, updates: Partial<Omit<DreamFund, 'id'>>) => {
    updateDreamFundMutation.mutate({ fundId, updates });
  }, [updateDreamFundMutation]);

  const deleteDreamFundMutation = useMutation({
    mutationFn: async (fundId: string) => {
      await apiFetchVoid('/api/buddy/dream-funds', {
        method: 'DELETE',
        body: { fund_id: fundId },
      });
    },
    onMutate: async (fundId) => {
      await queryClient.cancelQueries({ queryKey: BUDDY_STATE_KEY });
      const prev = queryClient.getQueryData<BuddyState>(BUDDY_STATE_KEY);
      if (prev) {
        // Optimistic update with redistribution
        const fundToDelete = prev.dreamFunds.find(f => f.id === fundId);
        const transferAmount = fundToDelete?.current || 0;
        const remainingFunds = prev.dreamFunds.filter(f => f.id !== fundId);
        // 🔧 Round 120 audit fix (AUDIT-1 P1 #8): 保留 savings fund
        const prevSavings = prev.dreamFunds.find(f => f.id === SAVINGS_FUND_ID);
        const newFunds = remainingFunds.length > 0
          ? remainingFunds
          : (prevSavings
              ? [prevSavings, ...DEFAULT_DREAM_FUNDS.filter(f => f.id !== SAVINGS_FUND_ID)]
              : DEFAULT_DREAM_FUNDS);

        if (transferAmount > 0) {
          let amountToDistribute = transferAmount;
          const updatedFunds = newFunds.map(f => {
            if (amountToDistribute <= 0) return f;
            const space = f.target - f.current;
            if (space > 0) {
              const fill = Math.min(space, amountToDistribute);
              amountToDistribute -= fill;
              return { ...f, current: f.current + fill };
            }
            return f;
          });
          queryClient.setQueryData(BUDDY_STATE_KEY, { ...prev, dreamFunds: updatedFunds });
        } else {
          queryClient.setQueryData(BUDDY_STATE_KEY, { ...prev, dreamFunds: newFunds });
        }
      }
      return { prev };
    },
    onError: (_err, _fundId, context) => {
      logger.warn('[BuddyStateRQ] Delete dream fund failed — rolling back:', _err);
      if (context?.prev) {
        queryClient.setQueryData(BUDDY_STATE_KEY, context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDDY_STATE_KEY });
    },
  });

  const deleteDreamFund = useCallback((fundId: string) => {
    if (fundId === SAVINGS_FUND_ID) return;
    deleteDreamFundMutation.mutate(fundId);
  }, [deleteDreamFundMutation]);

  // ============================================================
  // Actions — addTokens, revive, useHealingKit, forceRefresh, reorderDreamFunds
  // 🔧 Round 126 用户决策 7 (#4): 提取到 use-buddy-actions.ts
  // 🔧 P0-3 fix (2026-07-17): 把 lastManualInvalidateRef 传给 forceRefresh,
  //   让 Realtime dedup 短窗口能感知 manual invalidate 时间
  // ============================================================

  const { addTokens, revive, useHealingKit, forceRefresh: rawForceRefresh, reorderDreamFunds } = useBuddyActions(pushMutation);
  // 🔧 P0-3 fix: 包装 forceRefresh, 注入 manualInvalidateRef
  const forceRefresh = useCallback(() => {
    rawForceRefresh({ manualInvalidateRef: lastManualInvalidateRef });
  }, [rawForceRefresh]);

  // 🔧 Round 129 fix: 新用户 dream_funds 为空时, 自动创建默认基金 (含 Savings)
  //    migration 107 修复了 trigger, 但已注册但没 dream_funds 的用户需要前端补建
  const dreamFundsSeedRef = useRef(false);
  useEffect(() => {
    if (dreamFundsSeedRef.current) return;
    if (!buddyState || isLoading) return;
    if (buddyState.dreamFunds.length > 0) return;
    // dreamFunds 为空 — 自动创建默认基金
    dreamFundsSeedRef.current = true;
    logger.info('[BuddyStateRQ] dreamFunds empty — seeding default funds (incl. Savings)');
    DEFAULT_DREAM_FUNDS.forEach((fund) => {
      createDreamFund(fund);
    });
  }, [buddyState, isLoading, createDreamFund]);

  // ============================================================
  // Return
  // ============================================================

  return {
    buddyState: buddyState ?? DEMO_BUDDY_STATE_FALLBACK,
    addTokens,
    useHealingKit,
    revive,
    forceRefresh,
    isLoaded: !isLoading,
    createDreamFund,
    updateDreamFund,
    deleteDreamFund,
    reorderDreamFunds,
    syncError: error ? 'Sync error' : null,
  };
}
