'use client';

import { useEffect, useRef, useState } from 'react';
import { getDueReuseConfirmation } from '../parts/duplicate-purchase-store';
import type { DuplicatePrecheckCardData } from '@/types/duplicate-purchase';

export function useDuplicateReuseFollowup({ isDemo, historyReady }: { isDemo: boolean; historyReady: boolean }) {
  const [due, setDue] = useState<{ card: DuplicatePrecheckCardData; decisionId: string } | null>(null);
  const derived = useRef(false);
  useEffect(() => {
    if (derived.current || isDemo || !historyReady) return;
    derived.current = true;
    setDue(getDueReuseConfirmation());
  }, [isDemo, historyReady]);
  return { due, clear: () => setDue(null) };
}
