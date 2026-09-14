/**
 * usePrevious — Track the previous value of a variable across renders.
 *
 * 🔧 ARCH fix (Round 54 R54-Bug10 — 10+ 手动 prev-value ref):
 *    旧代码: 每个组件手动 useRef + useEffect 记录前值, 容易忘记更新或比较错误
 *    (BUG-259, BUG-325)。
 *    根因修复: 提取共享 hook, 一行调用替代 3 行模板。
 *
 * 复杂度转移: 业务代码不再需要手动管理 prev ref, 架构层统一处理。
 *
 * @example
 * ```tsx
 * const [count, setCount] = useState(0);
 * const prevCount = usePrevious(count);
 * // prevCount is undefined on first render, then the previous value
 * ```
 */

'use client';

import { useEffect, useRef } from 'react';

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  // eslint-disable-next-line react-hooks/refs -- reading ref in render is the core use-previous pattern
  return ref.current;
}
