'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { isCollectiveStats } from '@/lib/platform-aggregate';

export function useCollectiveDefenseStats(isDemo: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ['defense-collective-stats'],
    queryFn: async () => {
      const value = await apiFetch<unknown>('/api/defense/collective');
      if (!isCollectiveStats(value)) throw new Error('Invalid collective defense stats');
      return value;
    },
    enabled: !isDemo,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    collectiveStats: isDemo ? null : data ?? null,
    isLoading: !isDemo && isLoading,
  };
}
