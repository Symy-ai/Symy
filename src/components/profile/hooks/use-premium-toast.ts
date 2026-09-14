'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 🔧 N40 fix: Premium 按钮点击反馈 toast (3s 自动消失)
 * (原为 profile-tab.tsx 内联逻辑 — File Split Wave 1 纯搬运, 行为零变化)
 * 原卸载 cleanup effect 同时清 avatar timer; 拆分后两 hook 各自清理, 行为一致。
 */
export function usePremiumToast() {
  const [premiumToast, setPremiumToast] = useState<string | null>(null);
  // P1-4 fix: showPremiumToastMsg 必须定义在 handleSaveHourlyRate 之前, 否则 useCallback deps 触发 TDZ
  const premiumToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPremiumToastMsg = useCallback((msg: string) => {
    setPremiumToast(msg);
    if (premiumToastTimerRef.current) clearTimeout(premiumToastTimerRef.current);
    premiumToastTimerRef.current = setTimeout(() => {
      setPremiumToast(null);
      premiumToastTimerRef.current = null;
    }, 3000);
  }, []);

  // R44-A-2: toast timer cleared on unmount (原与 avatar timer 同一个 cleanup effect)
  useEffect(() => {
    return () => {
      if (premiumToastTimerRef.current) clearTimeout(premiumToastTimerRef.current);
    };
  }, []);

  return { premiumToast, setPremiumToast, showPremiumToastMsg };
}
