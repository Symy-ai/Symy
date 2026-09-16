/**
 * useHealingKit tests (batch77-c — testgap v9 §十五.2 中高盲区补测, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - 点击头像 → 详情 modal 打开 + Pet Symy 触发
 *  - Round 3 C4 服务端强制分支: onUseHealingKit 返回 success / already_used / error / rejection
 *  - 与 limit-window 同窗口口径: 凌晨 4 点 healing day 边界 (5 个边界组合)
 *  - in-flight 防重 (ref 同步守卫): 连点只发一次
 *  - BUG-131: pulse timer 注册进共享 pulseTimerRefs, 600ms 后自清; 卸载后同样不泄漏
 *  - demo 分支 (+3 pleasure, 不调服务端) 与 onUseHealingKit 缺省 fallback 分支
 */
// @vitest-environment happy-dom

import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useHealingKit } from '../use-healing-kit';
import type { BuddyState } from '@/types/buddy-state';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const DICT: Record<string, string> = {
        'buddy.healingKitUsed': 'HEALING_USED',
        'buddy.usedToday': 'USED_TODAY',
        'buddy.healingKitFailed': 'HEALING_FAILED',
      };
      return DICT[key] ?? key;
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';

function makeBuddyState(lastHealingKitAt: string | null): BuddyState {
  return {
    vitality: 80,
    tokens: 100,
    health: 'healthy',
    level: 3,
    xp: 40,
    xpToNext: 100,
    streak: 2,
    dreamFunds: [],
    badges: [],
    totalSaved: 50,
    challengesCompleted: 4,
    lastHealingKitAt,
    version: 1,
    growthStage: 'adult',
    personality: 'sage',
    intimacy: 10,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
  };
}

type HealingKitArgs = Parameters<typeof useHealingKit>[0];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useHealingKit', () => {
  const renderHealing = (overrides: Partial<HealingKitArgs> & { lastHealingKitAt?: string | null } = {}) => {
    const pulseTimerRefs = { current: [] as ReturnType<typeof setTimeout>[] };
    const { lastHealingKitAt, ...rest } = overrides;
    const props = {
      isDemo: false,
      onUseHealingKit: undefined,
      onAddTokens: vi.fn(),
      onToast: vi.fn(),
      onBuddyStateRefresh: vi.fn(),
      setShowCompanionDetail: vi.fn(),
      ...rest,
      buddyState: makeBuddyState(lastHealingKitAt ?? null),
      pulseTimerRefs,
    };
    const view = renderHook(() => useHealingKit(props));
    return { ...view, props, pulseTimerRefs };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('点击: 详情 modal 打开; 成功路径 → success toast + onBuddyStateRefresh + pulse 600ms 自清', async () => {
    const onUseHealingKit = vi.fn().mockResolvedValue('success');
    const { result, props, pulseTimerRefs } = renderHealing({ onUseHealingKit });

    act(() => {
      result.current.handleCompanionClick();
    });
    expect(props.setShowCompanionDetail).toHaveBeenCalledWith(true);
    expect(result.current.healingPulse).toBe(true);
    // pulse timer 注册进共享 refs (BUG-131: 由 BuddyTab 壳统一清理的通道)
    expect(pulseTimerRefs.current).toHaveLength(1);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(1);
    expect(props.onToast).toHaveBeenCalledWith('HEALING_USED', 'success');
    expect(props.onBuddyStateRefresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.healingPulse).toBe(false);
    expect(pulseTimerRefs.current).toHaveLength(0);
  });

  it('already_used → info toast (USED_TODAY), 不 refresh; finally 释放 in-flight 后可再点', async () => {
    const onUseHealingKit = vi.fn().mockResolvedValue('already_used');
    const { result, props } = renderHealing({ onUseHealingKit });

    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(props.onToast).toHaveBeenCalledWith('USED_TODAY', 'info');
    expect(props.onBuddyStateRefresh).not.toHaveBeenCalled();

    // in-flight 已释放 (ref 守卫复位) → 再点会再次发请求
    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(2);
  });

  it("error 返回 → 现状静默 (无 toast 无 refresh), in-flight 释放可重试", async () => {
    const onUseHealingKit = vi.fn().mockResolvedValue('error');
    const { result, props } = renderHealing({ onUseHealingKit });

    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(1);
    expect(props.onToast).not.toHaveBeenCalled();
    expect(props.onBuddyStateRefresh).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(2);
  });

  it('rejection → logger.warn + HEALING_FAILED info toast, 不崩不 refresh', async () => {
    const onUseHealingKit = vi.fn().mockRejectedValue(new Error('network down'));
    const { result, props } = renderHealing({ onUseHealingKit });

    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(props.onToast).toHaveBeenCalledWith('HEALING_FAILED', 'info');
    expect(props.onBuddyStateRefresh).not.toHaveBeenCalled();
  });

  it('in-flight 防重 (ref 同步守卫): 未渲染完的连点只发一次 API', async () => {
    const d = deferred<'success' | 'already_used' | 'error'>();
    const onUseHealingKit = vi.fn().mockReturnValue(d.promise);
    const { result, props } = renderHealing({ onUseHealingKit });

    // 两次同步 click 都看到 healingKitInFlightRef — 第二次被吞
    act(() => {
      result.current.handleCompanionClick();
      result.current.handleCompanionClick();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve('success');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(1);
    expect(props.onToast).toHaveBeenCalledTimes(1);

    // 释放后再点可正常触发
    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUseHealingKit).toHaveBeenCalledTimes(2);
  });

  it('双击防重前先过期检查: 今日已用 (lastHealingKitAt 在当前 healing day) → 只弹 USED_TODAY, 无 pulse 无 API', () => {
    const onUseHealingKit = vi.fn().mockResolvedValue('success');
    // now = 12:00 UTC → 当前 healing day 从今天 04:00 开始
    const { result, props, pulseTimerRefs } = renderHealing({
      onUseHealingKit,
      lastHealingKitAt: '2026-09-17T05:00:00Z',
    });

    act(() => {
      result.current.handleCompanionClick();
    });
    // modal 仍打开 (Round 105: modal 与抚摸解耦)
    expect(props.setShowCompanionDetail).toHaveBeenCalledWith(true);
    expect(props.onToast).toHaveBeenCalledWith('USED_TODAY', 'info');
    expect(onUseHealingKit).not.toHaveBeenCalled();
    expect(props.onAddTokens).not.toHaveBeenCalled();
    expect(result.current.healingPulse).toBe(false);
    expect(pulseTimerRefs.current).toHaveLength(0);
  });

  it('窗口口径与 limit-window 一致: 凌晨 4 点重置 (5 个边界组合)', async () => {
    const CASES: Array<{ now: string; last: string; usedToday: boolean; label: string }> = [
      // now 12:00 → dayStart = 今天 04:00
      { now: '2026-09-17T12:00:00Z', last: '2026-09-17T05:00:00Z', usedToday: true, label: '今天 05:00 ≥ 04:00 → 已用' },
      { now: '2026-09-17T12:00:00Z', last: '2026-09-17T03:59:00Z', usedToday: false, label: '今天 03:59 属昨日 healing day → 未用' },
      { now: '2026-09-17T12:00:00Z', last: '2026-09-16T23:00:00Z', usedToday: false, label: '昨天 23:00 → 未用' },
      // now 03:00 (<4) → dayStart = 昨天 04:00
      { now: '2026-09-17T03:00:00Z', last: '2026-09-16T05:00:00Z', usedToday: true, label: '凌晨 3 点视角: 昨天 05:00 ≥ 昨天 04:00 → 已用' },
      { now: '2026-09-17T03:00:00Z', last: '2026-09-16T03:00:00Z', usedToday: false, label: '凌晨 3 点视角: 昨天 03:00 < 昨天 04:00 → 未用' },
    ];
    for (const c of CASES) {
      vi.setSystemTime(new Date(c.now));
      const onUseHealingKit = vi.fn().mockResolvedValue('success');
      const { result, props } = renderHealing({ onUseHealingKit, lastHealingKitAt: c.last });

      await act(async () => {
        result.current.handleCompanionClick();
        await Promise.resolve();
        await Promise.resolve();
      });
      if (c.usedToday) {
        expect(onUseHealingKit, c.label).not.toHaveBeenCalled();
        expect(props.onToast, c.label).toHaveBeenCalledWith('USED_TODAY', 'info');
      } else {
        expect(onUseHealingKit, c.label).toHaveBeenCalledTimes(1);
        expect(props.onToast, c.label).not.toHaveBeenCalledWith('USED_TODAY', 'info');
      }
    }
  });

  it('demo 分支: 始终可用 (忽略 lastHealingKitAt), +3 pleasure tokens, 不调服务端', () => {
    const onUseHealingKit = vi.fn();
    const onAddTokens = vi.fn();
    const { result, props } = renderHealing({
      isDemo: true,
      onUseHealingKit,
      onAddTokens,
      lastHealingKitAt: '2026-09-17T05:00:00Z', // 若非 demo 会判已用
    });

    act(() => {
      result.current.handleCompanionClick();
    });
    expect(onAddTokens).toHaveBeenCalledWith(3, 'pleasure');
    expect(onUseHealingKit).not.toHaveBeenCalled();
    expect(props.onToast).not.toHaveBeenCalled(); // demo 分支无 toast
    expect(result.current.healingPulse).toBe(true);
  });

  it('onUseHealingKit 缺省 → fallback +3 pleasure + success toast; in-flight 同步释放可再点', async () => {
    const onAddTokens = vi.fn();
    const { result, props } = renderHealing({ onUseHealingKit: undefined, onAddTokens });

    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
    });
    expect(onAddTokens).toHaveBeenCalledTimes(1);
    expect(onAddTokens).toHaveBeenCalledWith(3, 'pleasure');
    expect(props.onToast).toHaveBeenCalledWith('HEALING_USED', 'success');

    // fallback 路径同步释放 in-flight → 第二次点击照常触发
    await act(async () => {
      result.current.handleCompanionClick();
      await Promise.resolve();
    });
    expect(onAddTokens).toHaveBeenCalledTimes(2);
  });

  it('BUG-131: 卸载后 pulse timer 仍会自清 pulseTimerRefs, 不残留泄漏', () => {
    const { result, pulseTimerRefs, unmount } = renderHealing({ onUseHealingKit: vi.fn().mockResolvedValue('success') });

    act(() => {
      result.current.handleCompanionClick();
    });
    expect(pulseTimerRefs.current).toHaveLength(1);

    unmount();
    // 计时器到期回调自身把 id 从共享 refs 过滤掉 (即使组件已卸载)
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(pulseTimerRefs.current).toHaveLength(0);
  });
});
