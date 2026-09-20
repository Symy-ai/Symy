/**
 * useBuddyActions tests (batch84-b — testgap v9 长尾补测第四批, buddy 动作 hooks)
 *
 * 覆盖 (断言与现状对齐):
 *  - addTokens: 无缓存 state 短路; 三档 vitality/xp 增益 (survival+2/+10, growth+5/+20,
 *    pleasure+3/+15); 升级链 (newXp≥xpToNext → xp 取余数, xpToNext×1.3 向下取整, level+1);
 *    非升级路径; vitality 封顶 100; pleasure 置 lastHealingKitAt
 *  - revive: vitality+30 封顶 + health 派生 + totalSaved 累加; 成功派发 depositMade(source:'revive');
 *    失败静默不派发; 无缓存短路
 *  - useHealingKit: POST 成功 'success' / 409 'already_used' / 其他 'error'
 *  - forceRefresh: invalidateQueries(BUDDY_STATE_KEY) + manualInvalidateRef 写时间戳
 *  - reorderDreamFunds: newOrder 重排 + missing 补尾 + 逐项 PATCH sort_order;
 *    PATCH 失败仅 warn 不抛; 未知 id 过滤; 无缓存短路
 */
// @vitest-environment happy-dom

import { cleanup, renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    constructor(public status: number, message?: string) {
      super(message ?? `API error ${status}`);
      this.name = 'ApiError';
    }
  }
  return { ApiError, apiFetch: vi.fn(), apiFetchVoid: vi.fn() };
});
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/posthog', () => ({ symyEvents: { depositMade: vi.fn() } }));
// 仅需 BUDDY_STATE_KEY 常量 — mock 掉 557 行主体避免拉起 supabase 依赖链 (值与源码一致)
vi.mock('../use-buddy-state-rq', () => ({ BUDDY_STATE_KEY: ['buddy-state'] as const }));

import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';
import { symyEvents } from '@/lib/posthog';
import { DEFAULT_STATE, type BuddyState } from '../buddy-state-helpers';
import { useBuddyActions } from '../use-buddy-actions';

const mockedApiFetch = vi.mocked(apiFetch);
const mockedApiFetchVoid = vi.mocked(apiFetchVoid);
const mockedDepositMade = vi.mocked(symyEvents.depositMade);

function baseState(over: Partial<BuddyState> = {}): BuddyState {
  return {
    ...DEFAULT_STATE,
    vitality: 80,
    tokens: 100,
    health: 'thriving',
    level: 3,
    xp: 90,
    xpToNext: 100,
    totalSaved: 500,
    lastHealingKitAt: null,
    dreamFunds: [
      { id: 'df-1', name: 'A', target: 100, current: 10, emoji: '🅰' },
      { id: 'df-2', name: 'B', target: 100, current: 20, emoji: '🅱' },
      { id: 'df-3', name: 'C', target: 100, current: 30, emoji: '🇨' },
    ],
    ...over,
  };
}

const pushMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
};

function setup(preset?: BuddyState) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (preset) {
    queryClient.setQueryData(['buddy-state'], preset);
  }
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const utils = renderHook(() => useBuddyActions(pushMutation), { wrapper: Wrapper });
  return { queryClient, ...utils };
}

const getState = (queryClient: QueryClient) =>
  queryClient.getQueryData<BuddyState>(['buddy-state']);

describe('useBuddyActions', () => {
  beforeEach(() => {
    pushMutation.mutate.mockReset();
    pushMutation.mutateAsync.mockReset();
    mockedApiFetch.mockReset();
    mockedApiFetchVoid.mockReset();
    mockedDepositMade.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('addTokens', () => {
    it('缓存无 state → 短路, 不触发 pushMutation', () => {
      const { result } = setup();
      act(() => result.current.addTokens(10, 'survival'));
      expect(pushMutation.mutate).not.toHaveBeenCalled();
    });

    it.each([
      ['survival', 2, 10] as const,
      ['growth', 5, 20] as const,
      ['pleasure', 3, 15] as const,
    ])('%s: tokens+amount, vitality+%i, xp+%i', (reason, vitalityBoost, xpBoost) => {
      // addTokens 经 pushMutation.mutate 下发新 state (缓存写入在 use-buddy-state-rq 的
      // mutation onSuccess), 本 hook 不直接写 queryClient — 断言 mutate 参数
      const { result } = setup(baseState({ xp: 10, xpToNext: 100 }));
      act(() => result.current.addTokens(10, reason));
      const next = pushMutation.mutate.mock.calls[0][0] as BuddyState;
      expect(next.tokens).toBe(110);
      expect(next.vitality).toBe(80 + vitalityBoost);
      expect(next.xp).toBe(10 + xpBoost);
      expect(next.level).toBe(3);
    });

    it('升级链: newXp≥xpToNext → xp 取余数, xpToNext×1.3 向下取整, level+1', () => {
      const { result } = setup(baseState({ xp: 95, xpToNext: 100, level: 3 }));
      act(() => result.current.addTokens(10, 'growth')); // 95+20=115 ≥ 100
      const next = pushMutation.mutate.mock.calls[0][0] as BuddyState;
      expect(next.xp).toBe(15); // 115-100
      expect(next.xpToNext).toBe(130); // floor(100*1.3)
      expect(next.level).toBe(4);
      expect(next.health).toBe('thriving'); // 派生自新 vitality
    });

    it('非升级: xp 累加, xpToNext/level 不变', () => {
      const { result } = setup(baseState({ xp: 10, xpToNext: 100 }));
      act(() => result.current.addTokens(10, 'survival'));
      const next = pushMutation.mutate.mock.calls[0][0] as BuddyState;
      expect(next.xp).toBe(20);
      expect(next.xpToNext).toBe(100);
      expect(next.level).toBe(3);
    });

    it('vitality 封顶 100', () => {
      const { result } = setup(baseState({ vitality: 98 }));
      act(() => result.current.addTokens(10, 'growth')); // 98+5 → 100
      expect((pushMutation.mutate.mock.calls[0][0] as BuddyState).vitality).toBe(100);
    });

    it('pleasure: 额外置 lastHealingKitAt (现状语义); 其他档保留 prev 值', () => {
      const { result } = setup(baseState());
      act(() => result.current.addTokens(10, 'pleasure'));
      expect((pushMutation.mutate.mock.calls[0][0] as BuddyState).lastHealingKitAt).not.toBeNull();

      // mock 掉 mutate → queryClient 缓存仍为 baseState (lastHealingKitAt=null)
      // → survival 保留 prev 值 = null, 不主动设置 (钉现状)
      act(() => result.current.addTokens(10, 'survival'));
      const second = pushMutation.mutate.mock.calls[1][0] as BuddyState;
      expect(second.lastHealingKitAt).toBeNull();
    });
  });

  describe('revive', () => {
    it('成功: vitality+30 封顶, health 派生, totalSaved 累加, 派发 depositMade(source:revive)', async () => {
      pushMutation.mutateAsync.mockResolvedValue(undefined);
      const { result } = setup(baseState({ vitality: 80, totalSaved: 500 }));
      await act(async () => {
        await result.current.revive(50);
      });
      const next = pushMutation.mutateAsync.mock.calls[0][0] as BuddyState;
      expect(next.vitality).toBe(100); // min(100, 80+30)
      expect(next.health).toBe('thriving');
      expect(next.totalSaved).toBe(550);
      expect(pushMutation.mutateAsync).toHaveBeenCalledTimes(1);
      expect(mockedDepositMade).toHaveBeenCalledWith({ amount: 50, source: 'revive' });
    });

    it('失败: 静默吞掉 (React Query onError 回滚), 不派发事件, 不抛', async () => {
      pushMutation.mutateAsync.mockRejectedValue(new Error('rollback'));
      const { result } = setup(baseState());
      await act(async () => {
        await result.current.revive(50);
      });
      expect(mockedDepositMade).not.toHaveBeenCalled();
    });

    it('缓存无 state → 短路', async () => {
      const { result } = setup();
      await act(async () => {
        await result.current.revive(50);
      });
      expect(pushMutation.mutateAsync).not.toHaveBeenCalled();
      expect(mockedDepositMade).not.toHaveBeenCalled();
    });
  });

  describe('useHealingKit', () => {
    it('POST /api/buddy/healing-kit 成功 → "success"', async () => {
      mockedApiFetch.mockResolvedValue({});
      const { result } = setup();
      await act(async () => {
        expect(await result.current.useHealingKit()).toBe('success');
      });
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/buddy/healing-kit', { method: 'POST' });
    });

    it('409 → "already_used"', async () => {
      mockedApiFetch.mockRejectedValue(new ApiError(409, 'already used today'));
      const { result } = setup();
      await act(async () => {
        expect(await result.current.useHealingKit()).toBe('already_used');
      });
    });

    it('其他错误 → "error"', async () => {
      mockedApiFetch.mockRejectedValue(new ApiError(500, 'boom'));
      const { result } = setup();
      await act(async () => {
        expect(await result.current.useHealingKit()).toBe('error');
      });
    });
  });

  describe('forceRefresh', () => {
    it('invalidateQueries(BUDDY_STATE_KEY) + manualInvalidateRef 写入时间戳', () => {
      const { queryClient, result } = setup();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
      const manualRef = { current: 0 };
      act(() => result.current.forceRefresh({ manualInvalidateRef: manualRef }));
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['buddy-state'] });
      expect(manualRef.current).toBeGreaterThan(0);
    });

    it('无 opts → 只 invalidate, 不炸', () => {
      const { queryClient, result } = setup();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
      act(() => result.current.forceRefresh());
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('reorderDreamFunds', () => {
    it('newOrder 重排 + missing 补尾 + 逐项 PATCH sort_order', async () => {
      mockedApiFetchVoid.mockResolvedValue(undefined);
      const { queryClient, result } = setup(baseState());
      await act(async () => {
        await result.current.reorderDreamFunds(['df-3', 'df-1']);
      });
      expect(getState(queryClient)?.dreamFunds.map(f => f.id)).toEqual(['df-3', 'df-1', 'df-2']);
      expect(mockedApiFetchVoid).toHaveBeenNthCalledWith(1, '/api/buddy/dream-funds', {
        method: 'PATCH',
        body: { fund_id: 'df-3', sort_order: 0 },
      });
      expect(mockedApiFetchVoid).toHaveBeenNthCalledWith(2, '/api/buddy/dream-funds', {
        method: 'PATCH',
        body: { fund_id: 'df-1', sort_order: 1 },
      });
    });

    it('newOrder 含已删 id → PATCH 只发送已知 id 且序号连续', async () => {
      mockedApiFetchVoid.mockResolvedValue(undefined);
      const { queryClient, result } = setup(baseState());
      await act(async () => {
        await result.current.reorderDreamFunds(['df-x', 'df-2']);
      });
      expect(getState(queryClient)?.dreamFunds.map(f => f.id)).toEqual(['df-2', 'df-1', 'df-3']);
      expect(mockedApiFetchVoid).toHaveBeenCalledTimes(1);
      expect(mockedApiFetchVoid).toHaveBeenNthCalledWith(1, '/api/buddy/dream-funds', {
        method: 'PATCH',
        body: { fund_id: 'df-2', sort_order: 0 },
      });
    });

    it('newOrder 全未知 → 不发 PATCH', async () => {
      mockedApiFetchVoid.mockResolvedValue(undefined);
      const { queryClient, result } = setup(baseState());
      await act(async () => {
        await result.current.reorderDreamFunds(['df-x', 'df-y']);
      });
      expect(getState(queryClient)?.dreamFunds.map(f => f.id)).toEqual(['df-1', 'df-2', 'df-3']);
      expect(mockedApiFetchVoid).not.toHaveBeenCalled();
    });

    it('正常重排保持逐项 PATCH 不变', async () => {
      mockedApiFetchVoid.mockResolvedValue(undefined);
      const { queryClient, result } = setup(baseState());
      await act(async () => {
        await result.current.reorderDreamFunds(['df-3', 'df-1', 'df-2']);
      });
      expect(getState(queryClient)?.dreamFunds.map(f => f.id)).toEqual(['df-3', 'df-1', 'df-2']);
      for (const [index, fundId] of ['df-3', 'df-1', 'df-2'].entries()) {
        expect(mockedApiFetchVoid).toHaveBeenNthCalledWith(index + 1, '/api/buddy/dream-funds', {
          method: 'PATCH',
          body: { fund_id: fundId, sort_order: index },
        });
      }
    });

    it('PATCH 失败 → warn 不抛, 本地顺序已生效', async () => {
      mockedApiFetchVoid.mockRejectedValue(new Error('patch down'));
      const { queryClient, result } = setup(baseState());
      await act(async () => {
        await result.current.reorderDreamFunds(['df-2', 'df-1', 'df-3']);
      });
      expect(getState(queryClient)?.dreamFunds.map(f => f.id)).toEqual(['df-2', 'df-1', 'df-3']);
    });

    it('缓存无 state → 短路零 PATCH', async () => {
      const { result } = setup();
      await act(async () => {
        await result.current.reorderDreamFunds(['df-1']);
      });
      expect(mockedApiFetchVoid).not.toHaveBeenCalled();
    });
  });
});
