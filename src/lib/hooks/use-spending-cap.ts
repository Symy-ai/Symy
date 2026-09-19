'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { SpendingCapState } from '@/lib/spending-cap-tracker';

export interface SpendingCapResponse {
  state: SpendingCapState | null;
  setting: { capCents: number; periodStart: string; warningPct: number };
  events: Array<{ amountCents: number; category: string; timestamp: string }>;
  categories: Array<{ category: string; amountCents: number }>;
  daysLeft: number;
}

export const SPENDING_CAP_KEY = ['spending-cap'] as const;

/**
 * draft 金额 → 分。钳制非负：负 draft（服务端回填脏数据等旁路）不得上送负 capCents。
 */
export function toCapCents(draft: string): number {
  return Math.max(0, Math.round((Number(draft) || 0) * 100));
}

function fetchSpendingCap(): Promise<SpendingCapResponse> {
  return apiFetch<SpendingCapResponse>('/api/buddy/spending-cap');
}


export function useSpendingCap(enabled = true) {
  const query = useQuery({
    queryKey: SPENDING_CAP_KEY,
    queryFn: fetchSpendingCap,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  return query;
}

export function useSpendingCapForm() {
  const [draft, setDraft] = useState('');
  const setAmount = useCallback((value: string) => {
    setDraft(value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'));
  }, []);
  return { draft, setAmount };
}
