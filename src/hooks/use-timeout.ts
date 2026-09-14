/**
 * useTimeout — Declarative setTimeout with automatic cleanup.
 *
 * 🔧 ARCH fix (Round 54 R54-Bug5 — 30+ 手动 timer ref + cleanup):
 *    旧代码: 每个组件手动 useRef + useEffect cleanup, 容易忘记 cleanup (BUG-149, R44-A-2, R44-A-4)。
 *    根因修复: 提取共享 hook, 内置 cleanup, 组件卸载时自动 clearTimeout。
 *
 * 复杂度转移: 业务代码不再需要手动管理 timer ref + cleanup, 架构层统一处理。
 *
 * @example
 * ```tsx
 * const { set, clear } = useTimeout();
 *
 * const handleClick = () => {
 *   set(() => setShowToast(false), 3000); // 自动 cleanup
 * };
 * ```
 */

'use client';

import { logger } from '@/lib/logger';

import { useCallback, useEffect, useRef } from 'react';

export interface UseTimeoutReturn {
  /** Set a timeout. Returns the timer id. Previous timeout is cleared. */
  set: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  /** Clear the current timeout. */
  clear: () => void;
  /** Whether a timeout is currently pending. */
  isPending: () => boolean;
}

export function useTimeout(): UseTimeoutReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const set = useCallback((callback: () => void, delayMs: number) => {
    // Clear any existing timer before setting a new one
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // 🔧 ARCH fix (Round 55 REVIEW-A-4): 验证 delayMs — 负数/NaN/Infinity 立即执行 (掩盖上游 bug)
    //    旧代码: setTimeout(cb, -1) 在浏览器中立即执行, 掩盖了上游传入非法值的 bug。
    //    根因修复: 非法 delayMs 时 fallback 到 0 并 warn (让上游 bug 可见)。
    const safeDelay = (typeof delayMs === 'number' && Number.isFinite(delayMs) && delayMs >= 0) ? delayMs : 0;
    if (safeDelay !== delayMs) {
      // 🔧 ARCH fix (Round 65 ESLint): 移除 eslint-disable-next-line no-console (该规则未启用, 触发 unused directive warning)
      logger.warn(`[useTimeout] Invalid delayMs: ${delayMs}, using 0`);
    }
    const tid = setTimeout(() => {
      timerRef.current = null;
      callback();
    }, safeDelay);
    timerRef.current = tid;
    return tid;
  }, []);

  const isPending = useCallback(() => timerRef.current !== null, []);

  return { set, clear, isPending };
}
