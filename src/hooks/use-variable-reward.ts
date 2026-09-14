/**
 * P1-1 Variable Reward Hook (Round 92)
 *
 * 监听 'variable-reward' CustomEvent, 管理 overlay state
 * 提取自 page.tsx 避免 >810 行
 */

'use client';

import { useState, useEffect } from 'react';

export type RewardTier = 'basic' | 'card' | 'item' | 'golden';

export interface VariableRewardData {
  rewardTier: RewardTier;
  bonusTokens: number;
  bonusVitality: number;
}

export function useVariableReward() {
  const [variableReward, setVariableReward] = useState<VariableRewardData | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<VariableRewardData> | undefined;
      if (detail?.rewardTier && detail.rewardTier !== 'basic') {
        setVariableReward({
          rewardTier: detail.rewardTier,
          bonusTokens: detail.bonusTokens ?? 0,
          bonusVitality: detail.bonusVitality ?? 0,
        });
      }
    };
    window.addEventListener('variable-reward', handler);
    return () => window.removeEventListener('variable-reward', handler);
  }, []);

  const clearVariableReward = () => setVariableReward(null);

  return { variableReward, clearVariableReward };
}
