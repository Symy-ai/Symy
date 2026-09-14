/**
 * useImpulseAlert — Extracted from page.tsx
 *
 * 🔧 ARCH fix (2026-07-21): Extracted impulse alert logic from page.tsx (810 lines)
 *    to reduce component complexity and enable independent testing.
 *
 * Manages the visual feedback (shaking, app status) when an impulse alert fires.
 * Tracks timers in a ref array for proper cleanup on unmount.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { getImpulseLevel } from '@/lib/impulse-detector';

// 🔧 ARCH fix (2026-07-21): Use type-only import to avoid layering violation
// (hooks should not import from @/components/ — architecture guard enforces this)
type AppStatus = 'stable' | 'alert' | 'success';

export function useImpulseAlert(isDemoRef: React.MutableRefObject<boolean>) {
  const [appStatus, setAppStatus] = useState<AppStatus>('stable');
  const [shaking, setShaking] = useState(false);
  const impulseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      impulseTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const handleImpulseAlert = useCallback((score: number) => {
    // PM-NEW-81: demo mode skip alert (only real notifications trigger)
    if (isDemoRef.current) {
      return;
    }
    const level = getImpulseLevel(score);
    if (level === 'alert') {
      setAppStatus('alert');
      setShaking(true);
      const t1 = setTimeout(() => {
        setShaking(false);
        // BUG-153 fix: timer 触发后从数组中移除
        impulseTimeoutsRef.current = impulseTimeoutsRef.current.filter(t => t !== t1);
      }, 3000);
      impulseTimeoutsRef.current.push(t1);
    } else if (level === 'success') {
      setAppStatus('success');
      const t2 = setTimeout(() => {
        setAppStatus('stable');
        // BUG-153 fix: timer 触发后从数组中移除
        impulseTimeoutsRef.current = impulseTimeoutsRef.current.filter(t => t !== t2);
      }, 3000);
      impulseTimeoutsRef.current.push(t2);
    } else {
      setAppStatus('stable');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDemoRef is a stable ref
  }, []);

  return { appStatus, setAppStatus, shaking, handleImpulseAlert };
}
