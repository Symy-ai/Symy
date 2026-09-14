'use client';

/**
 * Global Toast — Fixed top toast notification
 *
 * 提取自 src/app/page.tsx (Round 101 拆分)
 * 🔧 Task 5: 改用 useSyncExternalStore + toast store, 支持 success/info/error
 */

import { useSyncExternalStore } from 'react';
import { subscribeToast, getToast } from '@/lib/toast';

export function GlobalToast() {
  const toast = useSyncExternalStore(subscribeToast, getToast, getToast);
  if (!toast) return null;

  const bgClass =
    toast.type === 'success'
      ? 'bg-green-500/90 text-white border-green-300/50 shadow-green-500/20'
      : toast.type === 'error'
        ? 'bg-red-500/90 text-white border-red-300/50 shadow-red-500/20'
        : 'bg-gray-800/90 dark:bg-gray-700/90 text-white border-gray-500/50';

  return (
    <div
      data-symy-toast="true"
      // 🔧 P1 fix: z-[200] → z-[500] — share-card-modal 也用 z-[200], portal 后渲染会盖住 toast
      //    toast 必须在所有 modal/portal 之上, 保证用户能看到反馈
      className={`fixed top-12 left-1/2 -translate-x-1/2 z-[500] px-6 py-3.5 rounded-2xl text-sm font-bold shadow-2xl backdrop-blur-md border-2 animate-in slide-in-from-top fade-in duration-300 max-w-[90vw] text-center ${bgClass}`}
    >
      {toast.message}
    </div>
  );
}
