'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface CollectiveDefenseStats {
  hours: number;
  guards: number;
}

function isCollectiveDefenseStats(value: unknown): value is CollectiveDefenseStats {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CollectiveDefenseStats).hours === 'number' &&
    typeof (value as CollectiveDefenseStats).guards === 'number'
  );
}

export function useCollectiveDefenseStats(isDemo: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ['defense-collective-stats'],
    queryFn: async () => {
      const value = await apiFetch<unknown>('/api/defense/collective');
      if (!isCollectiveDefenseStats(value)) throw new Error('Invalid collective defense stats');
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
