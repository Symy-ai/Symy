/**
 * React Query Provider — wraps the app with QueryClient.
 *
 * 🔧 Round 95: Replaces Dexie + buddy-sync with React Query for buddy state.
 *    React Query handles: caching, dedup, retry, optimistic updates, background refetch.
 *    Supabase Realtime handles: cross-device sync (invalidates query on UPDATE).
 */

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Buddy state is real-time via Supabase Realtime, so stale time can be short.
            // React Query will use cached data while refetching in background.
            staleTime: 30_000, // 30s — short because Realtime pushes updates
            gcTime: 5 * 60_000, // 5 min — keep cache for 5 min after unmount
            retry: 2,
            // 🔧 P0-3 fix (2026-07-17): 关闭全局 refetchOnWindowFocus
            //   - buddy/state 已有 Realtime 推送, 不需要 window focus refetch
            //   - chat/history, challenge/active 等也不需要 focus 时刷新 (用户回到 tab 时
            //     看到旧数据 OK, 主动操作会触发新 fetch)
            //   - 单个 query 需要时可以自己开启 refetchOnWindowFocus: true
            refetchOnWindowFocus: false,
            refetchOnReconnect: true, // Re-fetch when network reconnects
          },
          mutations: {
            retry: 0, // Don't auto-retry mutations (user can retry manually)
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
