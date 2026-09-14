'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * 🔧 P1-3 fix (2026-07-20): 数字滚动动画 hook
 *
 * 让数字从旧值平滑滚动到新值, 而非直接跳变.
 * 用于 Token 显示、生命小时数、复利金额等.
 *
 * 用法:
 *   const animatedTokens = useAnimatedNumber(buddyState.tokens);
 *   <span>{animatedTokens}</span>
 *
 * 效果: tokens 从 50 → 55 时, 显示 50→51→52→53→54→55 (每步 30ms)
 */

export function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === target) return;

    const start = performance.now();
    const diff = target - prev;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(prev + diff * eased);
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}
