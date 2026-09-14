'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

export interface GreenAltAdoptionCount {
  /** 本季采纳绿色替代总次数 (仅次数, 无金额) */
  total: number;
}

/**
 * 本季绿色替代采纳次数 — profile 绿色影响第 4 张指标卡数据源。
 * 失败静默降级为 0 (非关键展示路径, 不拖垮整个 dashboard)。
 */
export function useGreenAltAdoption(): GreenAltAdoptionCount {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- one-shot decorative read; absence tolerated (degrades to 0), mirrors use-green-impact exception
        const data = await apiFetch<{ total?: number }>('/api/green-alt/adoption');
        if (!cancelled && data && Number.isFinite(Number(data.total))) {
          setTotal(Math.max(0, Math.floor(Number(data.total))));
        }
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就显示 0, 不报错
        logger.warn('[useGreenAltAdoption] fetch failed:', err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { total };
}
