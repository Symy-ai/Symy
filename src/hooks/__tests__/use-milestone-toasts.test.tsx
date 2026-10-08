// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMilestoneToasts } from '@/hooks/use-milestone-toasts';
import type { BuddyState } from '@/types/buddy-state';

const t = vi.hoisted(() => vi.fn((key: string) => key));
const onToast = vi.hoisted(() => vi.fn());

const baseState: BuddyState = {
  vitality: 100,
  tokens: 0,
  health: 'thriving',
  level: 1,
  xp: 0,
  xpToNext: 100,
  streak: 0,
  dreamFunds: [],
  badges: [],
  totalSaved: 0,
  challengesCompleted: 0,
  lastHealingKitAt: null,
  version: 1,
  growthStage: 'baby',
  personality: 'unknown',
  intimacy: 0,
  dailyNeeds: { clarity: 0, connection: 0 },
  proactiveMessages: [],
  personalityAwakenedAt: null,
  lastActiveAt: null,
};

const options = (buddyState: BuddyState | null, isDemo = false) => ({
  isDemo,
  buddyState,
  onToast,
  t,
});

describe('useMilestoneToasts', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('triggers the 5k saved milestone once', () => {
    const { rerender } = renderHook(props => useMilestoneToasts(options(props)), {
      initialProps: { ...baseState, totalSaved: 4999 },
    });
    rerender({ ...baseState, totalSaved: 5000 });
    rerender({ ...baseState, totalSaved: 6000 });

    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith({ message: 'milestone.saved5k', type: 'success' });
  });

  it('prefers the higher 10k milestone', () => {
    const { rerender } = renderHook(props => useMilestoneToasts(options(props)), {
      initialProps: { ...baseState, totalSaved: 0 },
    });
    rerender({ ...baseState, totalSaved: 10000 });

    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith({ message: 'milestone.saved10k', type: 'success' });
  });

  it('triggers the streak milestone plus its invitation prompt', () => {
    const { rerender } = renderHook(props => useMilestoneToasts(options(props)), {
      initialProps: { ...baseState, streak: 6 },
    });
    rerender({ ...baseState, streak: 7 });

    expect(onToast).toHaveBeenCalledWith({ message: 'milestone.streak7', type: 'success' });
    expect(onToast).toHaveBeenCalledWith({ message: 'milestone.invitePrompt', type: 'info' });
    expect(onToast).toHaveBeenCalledTimes(2);
  });

  it('does not repeat an already-shown threshold', () => {
    const { rerender } = renderHook(props => useMilestoneToasts(options(props)), {
      initialProps: { ...baseState, challengesCompleted: 50 },
    });
    onToast.mockClear();
    rerender({ ...baseState, challengesCompleted: 51 });

    expect(onToast).not.toHaveBeenCalled();
  });

  it('celebrates a newly completed dream fund once', () => {
    const { rerender } = renderHook(props => useMilestoneToasts(options(props)), {
      initialProps: { ...baseState, dreamFunds: [{ id: 'f-1', name: 'MacBook', target: 100, current: 10, emoji: '💻' }] },
    });
    rerender({ ...baseState, dreamFunds: [{ id: 'f-1', name: 'MacBook', target: 100, current: 100, emoji: '💻' }] });
    rerender({ ...baseState, dreamFunds: [{ id: 'f-1', name: 'MacBook', target: 100, current: 120, emoji: '💻' }] });

    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith({ message: 'milestone.dreamFundCompleted', type: 'success' });
  });

  it('does not emit toasts in demo mode or without state', () => {
    const { rerender } = renderHook(props => useMilestoneToasts(options(props.state, props.isDemo)), {
      initialProps: { state: baseState, isDemo: false },
    });
    rerender({ state: { ...baseState, totalSaved: 5000 }, isDemo: true });
    rerender({ state: null as unknown as typeof baseState, isDemo: false });

    expect(onToast).not.toHaveBeenCalled();
  });
});
