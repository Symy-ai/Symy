// @vitest-environment happy-dom
// SilentMomentOverlay — 挑战后沉默时刻仪式（此前 0 测试）
// 红线: 无按钮无交互纯仪式; saw/bought 双结果文案; 2秒后onComplete。
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// mock 真实 i18n key 形态（silentMomentSawLine1 等, defaultValue 直通）
const t = (key: string, opts?: Record<string, unknown>) => {
  if (opts && 'defaultValue' in opts) return String(opts.defaultValue);
  return key;
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t, locale: 'zh' }),
}));

import { SilentMomentOverlay } from '../silent-moment-overlay';

describe('SilentMomentOverlay — 沉默时刻仪式', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function renderOverlay(outcome: 'saw' | 'bought', onComplete = vi.fn()) {
    render(
      <SilentMomentOverlay
        outcome={outcome}
        amount={88}
        hoursOfLife={3.5}
        onComplete={onComplete}
      />,
    );
    return onComplete;
  }

  it('挂载即渲染 (portal 到 body)', () => {
    renderOverlay('saw');
    expect(document.body.textContent).toBeTruthy();
  });

  it('saw 结果走 saw 文案路径 (sr-only 描述区分)', () => {
    renderOverlay('saw');
    expect(document.body.textContent).toContain('seeing settle');
  });

  it('bought 结果走 bought 文案路径', () => {
    renderOverlay('bought');
    expect(document.body.textContent).toContain('choosing settle');
  });

  it('打字机推进后 saw 首行渐显', () => {
    renderOverlay('saw');
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.body.textContent).toContain('You saw');
  });

  it('无交互元素红线: 全程零 button', () => {
    renderOverlay('saw');
    expect(document.body.querySelectorAll('button').length).toBe(0);
  });

  it('打字完成后停留+淡出 → onComplete 恰好一次', () => {
    const onComplete = renderOverlay('saw');
    // 逐拍快进 (打字机链式 setTimeout 需逐步驱动): 45ms×135拍 ≈ 6s 全链
    act(() => { for (let i = 0; i < 140; i++) vi.advanceTimersByTime(45); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('快进不充分时 onComplete 不提前', () => {
    const onComplete = renderOverlay('saw');
    act(() => { for (let i = 0; i < 10; i++) vi.advanceTimersByTime(45); });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
