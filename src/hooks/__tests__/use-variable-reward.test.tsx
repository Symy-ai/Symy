// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVariableReward, type RewardTier } from '../../hooks/use-variable-reward';

function fireReward(detail: unknown) {
  window.dispatchEvent(new CustomEvent('variable-reward', { detail }));
}

describe('useVariableReward', () => {
  it('starts without a reward', () => {
    const { result } = renderHook(() => useVariableReward());
    expect(result.current.variableReward).toBeNull();
  });

  it('ignores the basic tier even when bonuses exist', () => {
    const { result } = renderHook(() => useVariableReward());
    act(() => fireReward({ rewardTier: 'basic', bonusTokens: 20, bonusVitality: 10 }));
    expect(result.current.variableReward).toBeNull();
  });

  it('fills missing bonus values with zero', () => {
    const { result } = renderHook(() => useVariableReward());
    act(() => fireReward({ rewardTier: 'card' }));
    expect(result.current.variableReward).toEqual({
      rewardTier: 'card',
      bonusTokens: 0,
      bonusVitality: 0,
    });
  });

  it.each(['card', 'item', 'golden'] as RewardTier[])('stores the %s reward and bonuses', (rewardTier) => {
    const { result } = renderHook(() => useVariableReward());
    act(() => fireReward({ rewardTier, bonusTokens: 7, bonusVitality: 4 }));
    expect(result.current.variableReward).toEqual({
      rewardTier,
      bonusTokens: 7,
      bonusVitality: 4,
    });
  });

  it('clears an active reward', () => {
    const { result } = renderHook(() => useVariableReward());
    act(() => fireReward({ rewardTier: 'golden', bonusTokens: 9, bonusVitality: 8 }));
    act(() => result.current.clearVariableReward());
    expect(result.current.variableReward).toBeNull();
  });
});
