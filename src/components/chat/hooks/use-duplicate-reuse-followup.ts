'use client';

import { useEffect, useRef, useState } from 'react';
import { getDueReuseConfirmation } from '../parts/duplicate-purchase-store';
import type { DuplicatePrecheckCardData } from '@/types/duplicate-purchase';

// 🔧 R1030: due → dueRecord — 与其余五 followup hook 命名同型 (R1026 观察项收编)
export function useDuplicateReuseFollowup({ isDemo, historyReady }: { isDemo: boolean; historyReady: boolean }) {
  const [dueRecord, setDueRecord] = useState<{ card: DuplicatePrecheckCardData; decisionId: string } | null>(null);
  const derived = useRef(false);
  useEffect(() => {
    if (derived.current || isDemo || !historyReady) return;
    derived.current = true;
    setDueRecord(getDueReuseConfirmation());
  }, [isDemo, historyReady]);
  return { dueRecord, clear: () => setDueRecord(null) };
}
