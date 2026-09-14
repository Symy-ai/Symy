/**
 * useButterflyLoadingStages — Round 121 audit fix (AUDIT-7 Step 2)
 *
 * 🔧 提取自 butterfly-tab.tsx:215-270 (loading 阶段轮播 + 计时器)
 *
 * isLoading=true 时:
 * - 每 8s 切换阶段文案 (stageIndex 0-4 循环)
 * - 每 1s 更新已用时间 (elapsedSec)
 * isLoading=false 时: 重置 state + 清理 timers
 */

import { useState, useEffect, useRef } from 'react';

export interface ButterflyLoadingStages {
  /** 当前阶段索引 (0-4, 每 8s 切换) */
  stageIndex: number;
  /** 已用秒数 (每 1s 更新) */
  elapsedSec: number;
}

export function useButterflyLoadingStages(isLoading: boolean): ButterflyLoadingStages {
  const [stageIndex, setStageIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const loadingStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setStageIndex(0);
      setElapsedSec(0);
      loadingStartRef.current = null;
      return;
    }
    loadingStartRef.current = Date.now();
    setStageIndex(0);
    setElapsedSec(0);

    const stageTimer = setInterval(() => {
      setStageIndex(i => (i + 1) % 5);
    }, 8000);

    const elapsedTimer = setInterval(() => {
      if (loadingStartRef.current) {
        setElapsedSec(Math.floor((Date.now() - loadingStartRef.current) / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(stageTimer);
      clearInterval(elapsedTimer);
    };
  }, [isLoading]);

  return { stageIndex, elapsedSec };
}
