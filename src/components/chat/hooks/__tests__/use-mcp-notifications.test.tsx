/**
 * Tests for useMcpNotifications — 拦截勋章派发流 (绿色转向)
 *
 * 测试矩阵:
 *   - complete_challenge (passed, savedAmount>0, 非 failed) → 派发 INTERCEPT_MEDAL_EVENT
 *     detail = { itemTitle, savedCents (元→分), date }
 *   - complete_challenge status='failed' (用户买了) → 不派发
 *   - complete_challenge alreadyCompleted (AI 重试重复结算) → 不派发
 *   - record_impulse (买了, impulse_damage) → 不派发 (勋章只属于"没买")
 *   - lib: dispatchInterceptMedal 60s 去重 (同一勋章只派发一次)
 *   - lib: savedCents <= 0 / NaN → 不派发
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMcpNotifications, type McpToolResult } from '../use-mcp-notifications';
import { handleToolEvent, type HandleToolEventParams } from '../consume-ai-stream';
import {
  INTERCEPT_MEDAL_EVENT,
  dispatchInterceptMedal,
  resetInterceptMedalDedupe,
} from '@/lib/intercept-medal';
import type { InterceptMedalData } from '@/types/intercept-medal';

const t = (key: string, values?: Record<string, string | number> & { defaultValue?: string }) =>
  values?.defaultValue ?? key;
const nextId = (prefix: string) => `${prefix}-1`;

function setupListener(captured: InterceptMedalData[]) {
  const handler = (e: Event) => captured.push((e as CustomEvent<InterceptMedalData>).detail);
  window.addEventListener(INTERCEPT_MEDAL_EVENT, handler);
  return () => window.removeEventListener(INTERCEPT_MEDAL_EVENT, handler);
}

describe('useMcpNotifications — intercept medal dispatch', () => {
  let removeListener: () => void;
  let captured: InterceptMedalData[];

  beforeEach(() => {
    resetInterceptMedalDedupe();
    captured = [];
    removeListener = setupListener(captured);
  });

  afterEach(() => {
    removeListener();
  });

  it('dispatches medal on complete_challenge passed (savedAmount → savedCents)', () => {
    const { result } = renderHook(() => useMcpNotifications({ nextId, t }));

    const results: McpToolResult[] = [
      {
        name: 'complete_challenge',
        success: true,
        message: 'Challenge completed!',
        result: {
          challengeId: 'c1',
          savedAmount: 89,
          itemName: 'Air Fryer',
          tokenReward: 4,
          badgeAwarded: null,
        },
      },
    ];
    act(() => result.current.handleMCPResults(results));

    expect(captured).toHaveLength(1);
    expect(captured[0].itemTitle).toBe('Air Fryer');
    expect(captured[0].savedCents).toBe(8900);
    expect(typeof captured[0].date).toBe('string');
  });

  it('does NOT dispatch on failed status (user bought)', () => {
    const { result } = renderHook(() => useMcpNotifications({ nextId, t }));

    act(() =>
      result.current.handleMCPResults([
        {
          name: 'complete_challenge',
          success: true,
          message: 'Challenge failed',
          result: { savedAmount: 89, itemName: 'Air Fryer', status: 'failed', rewardApplied: false },
        },
      ]),
    );

    expect(captured).toHaveLength(0);
  });

  it('does NOT dispatch on alreadyCompleted duplicate settlement', () => {
    const { result } = renderHook(() => useMcpNotifications({ nextId, t }));

    act(() =>
      result.current.handleMCPResults([
        {
          name: 'complete_challenge',
          success: true,
          message: 'already completed',
          result: { challengePassed: true, savedAmount: 89, itemName: 'Air Fryer', alreadyCompleted: true },
        },
      ]),
    );

    expect(captured).toHaveLength(0);
  });

  it('does NOT dispatch on record_impulse (bought ≠ intercepted)', () => {
    const { result } = renderHook(() => useMcpNotifications({ nextId, t }));

    act(() =>
      result.current.handleMCPResults([
        {
          name: 'record_impulse',
          success: true,
          message: 'Purchase recorded',
          result: { amount: 89, platform: 'tiktok_shop', impulseScore: 75, vitalityPenalty: -8 },
        },
      ]),
    );

    expect(captured).toHaveLength(0);
    // record_impulse 通知本身不受影响
    expect(result.current.mcpNotifications.length).toBe(1);
  });
});

describe('handleToolEvent — streaming medal dispatch (SSE tool_call/tool_result 去重)', () => {
  let removeListener: () => void;
  let captured: InterceptMedalData[];

  beforeEach(() => {
    resetInterceptMedalDedupe();
    captured = [];
    removeListener = setupListener(captured);
  });

  afterEach(() => {
    removeListener();
  });

  function makeParams(overrides?: Partial<HandleToolEventParams>): HandleToolEventParams {
    // `as` 断言 + locale 兜底: 兼容 handleToolEvent 参数是否含必填 locale 的两个版本
    // (并行开发的 🐘 人设转型在未暂存改动中给 HandleToolEventParams 加了 locale: string)
    return {
      activeChallenge: { itemName: 'Air Fryer', amount: 89, challengeId: 'c1' },
      t,
      locale: 'en',
      setActiveChallenge: vi.fn(),
      addMcpNotification: vi.fn(),
      justCompletedChallengeRef: { current: false },
      ...overrides,
    } as HandleToolEventParams;
  }

  it('dispatches on tool_result only (not tool_call) for non-buy complete_challenge', () => {
    const params = makeParams();
    handleToolEvent({ type: 'tool_call', tool: 'complete_challenge' }, params);
    expect(captured).toHaveLength(0);

    handleToolEvent({ type: 'tool_result', tool: 'complete_challenge' }, params);
    expect(captured).toHaveLength(1);
    expect(captured[0].itemTitle).toBe('Air Fryer');
    expect(captured[0].savedCents).toBe(8900);
  });

  it('does NOT dispatch on buy path (justBoughtChallengeRef)', () => {
    const params = makeParams({ justBoughtChallengeRef: { current: true } });
    handleToolEvent({ type: 'tool_result', tool: 'complete_challenge' }, params);
    expect(captured).toHaveLength(0);
  });

  it('does NOT dispatch for other tools', () => {
    const params = makeParams();
    handleToolEvent({ type: 'tool_result', tool: 'add_tokens' }, params);
    expect(captured).toHaveLength(0);
  });
});

describe('dispatchInterceptMedal — dedupe & guards', () => {
  let removeListener: () => void;
  let captured: InterceptMedalData[];

  beforeEach(() => {
    resetInterceptMedalDedupe();
    captured = [];
    removeListener = setupListener(captured);
  });

  afterEach(() => {
    removeListener();
  });

  it('dedupes same medal within window (SSE + direct-complete double dispatch)', () => {
    const medal = { itemTitle: 'Air Fryer', savedCents: 8900, date: '2026-09-05T10:00:00Z' };
    dispatchInterceptMedal(medal);
    dispatchInterceptMedal({ ...medal });
    expect(captured).toHaveLength(1);
  });

  it('dispatches again for a different medal (different item/amount)', () => {
    dispatchInterceptMedal({ itemTitle: 'Air Fryer', savedCents: 8900, date: 'x' });
    dispatchInterceptMedal({ itemTitle: 'Sneakers', savedCents: 12900, date: 'y' });
    expect(captured).toHaveLength(2);
  });

  it('ignores invalid savedCents (<= 0 / NaN)', () => {
    dispatchInterceptMedal({ itemTitle: 'x', savedCents: 0, date: 'x' });
    dispatchInterceptMedal({ itemTitle: 'x', savedCents: Number.NaN, date: 'x' });
    expect(captured).toHaveLength(0);
  });
});
