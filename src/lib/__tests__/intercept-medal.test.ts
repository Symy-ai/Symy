/**
 * @vitest-environment happy-dom
 *
 * Tests for intercept-medal.ts — 拦截勋章事件总线 (batch71-b, testgap v5 中危盲区补测)
 *
 * 报告出处: wool-report-testgap §十.3 — 自带 resetInterceptMedalDedupe 测试辅助
 * 却无测试文件, "补测成本最低"。风险面: 金额守卫 (savedCents) + 60s 去重时间边界。
 *
 * 断言对齐现状:
 *   - savedCents 非/0/负/Infinity → 静默不派发 (金额守卫)
 *   - 同 key (itemTitle:savedCents) 60s 内只派发一次; 恰好 60s 边界放行 (< 60_000)
 *   - 被去重的调用不刷新窗口计时
 *   - window 未定义 (SSR) → no-op 不抛
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  INTERCEPT_MEDAL_EVENT,
  dispatchInterceptMedal,
  resetInterceptMedalDedupe,
} from '@/lib/intercept-medal';
import type { InterceptMedalData } from '@/types/intercept-medal';

const BASE_TIME = 1_750_000_000_000;
let nowMs = BASE_TIME;

const validData = (over: Partial<InterceptMedalData> = {}): InterceptMedalData => ({
  itemTitle: 'streaming camera',
  savedCents: 12900,
  ...over,
});

describe('dispatchInterceptMedal — 金额守卫', () => {
  let handler: ReturnType<typeof vi.fn>;
  let listener: EventListener;

  beforeEach(() => {
    nowMs = BASE_TIME;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    handler = vi.fn();
    listener = handler as unknown as EventListener;
    window.addEventListener(INTERCEPT_MEDAL_EVENT, listener);
    resetInterceptMedalDedupe();
  });

  afterEach(() => {
    window.removeEventListener(INTERCEPT_MEDAL_EVENT, listener);
    vi.restoreAllMocks();
    resetInterceptMedalDedupe();
  });

  it('合法金额正常派发, event type 与 detail 原样透传', () => {
    const data = validData({ reason: { kind: 'impulse' }, greenSaved: true });
    dispatchInterceptMedal(data);

    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0] as CustomEvent<InterceptMedalData>;
    expect(evt.type).toBe(INTERCEPT_MEDAL_EVENT);
    expect(evt.detail).toEqual(data);
  });

  it('savedCents = NaN → 不派发 (NaN 是 number, isFinite 守卫拦)', () => {
    dispatchInterceptMedal(validData({ savedCents: NaN }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('savedCents = 0 / 负数 / Infinity → 不派发', () => {
    dispatchInterceptMedal(validData({ savedCents: 0 }));
    dispatchInterceptMedal(validData({ savedCents: -1 }));
    dispatchInterceptMedal(validData({ savedCents: Infinity }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('data 为 null/undefined → 不抛不派发', () => {
    expect(() =>
      dispatchInterceptMedal(null as unknown as InterceptMedalData),
    ).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('window 未定义 (SSR) → no-op 不抛', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(() => dispatchInterceptMedal(validData())).not.toThrow();
    } finally {
      // unstubAllGlobals 恢复 happy-dom 原生 window, 供后续用例监听
      vi.unstubAllGlobals();
    }
  });
});

describe('dispatchInterceptMedal — 60s 去重窗口', () => {
  let handler: ReturnType<typeof vi.fn>;
  let listener: EventListener;

  beforeEach(() => {
    nowMs = BASE_TIME;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    handler = vi.fn();
    listener = handler as unknown as EventListener;
    window.addEventListener(INTERCEPT_MEDAL_EVENT, listener);
    resetInterceptMedalDedupe();
  });

  afterEach(() => {
    window.removeEventListener(INTERCEPT_MEDAL_EVENT, listener);
    vi.restoreAllMocks();
    resetInterceptMedalDedupe();
  });

  it('同 key (itemTitle:savedCents) 窗口内二次派发被去重', () => {
    dispatchInterceptMedal(validData());
    nowMs += 30_000;
    dispatchInterceptMedal(validData());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('不同 itemTitle 或不同金额 = 不同 key, 窗口内均放行', () => {
    dispatchInterceptMedal(validData());
    dispatchInterceptMedal(validData({ itemTitle: 'noise-cancelling headphones' }));
    dispatchInterceptMedal(validData({ savedCents: 9900 }));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('恰好 60_000ms 后同 key 再次派发 → 放行 (边界: < 60s 才去重)', () => {
    dispatchInterceptMedal(validData());
    nowMs += 60_000;
    dispatchInterceptMedal(validData());
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('被去重的调用不刷新窗口 — t0 派发, t30s 压制, t61s 放行', () => {
    dispatchInterceptMedal(validData());
    nowMs += 30_000;
    dispatchInterceptMedal(validData());
    expect(handler).toHaveBeenCalledTimes(1);
    nowMs += 31_000; // 距上次【成功】派发 61s, 距被压制调用仅 31s
    dispatchInterceptMedal(validData());
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('resetInterceptMedalDedupe 后同 key 立即派发 → 放行', () => {
    dispatchInterceptMedal(validData());
    resetInterceptMedalDedupe();
    dispatchInterceptMedal(validData());
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
