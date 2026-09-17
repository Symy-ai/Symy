// @vitest-environment happy-dom

/**
 * VariableRewardOverlay tests (batch78-b — testgap v9 §十五.2 chat lifecycle 补盲, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - onChallengeCompleted 链上恰好触发一次: page.tsx 的真实契约是 onComplete →
 *    clearVariableReward() (卸载 overlay) + 派发 'variable-reward-complete' 事件 →
 *    use-challenge-actions 的 triggerComplete 触发 onChallengeCompleted (SilentMoment)。
 *    Harness 复刻该契约, 断言自动关闭 (4s) 与手动点击两条路径都恰好一次,
 *    且推进到 use-challenge-actions 的 10s 安全兜底窗口后仍是一次 (D2 兜底双调
 *    下游的风险由 overlay 卸载时 clearTimeout 消除)。
 *  - 提前卸载: closeTimer 被清理, onComplete 永不触发
 *  - rewardTier null / 'basic': 零渲染, 零回调
 *  - 渲染内容: golden 档标题/副标题 (tokens/vitality 插值) 正确
 */

import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { VariableRewardOverlay } from '../variable-reward-overlay';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = values?.defaultValue ?? key;
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          if (name !== 'defaultValue') result = result.replace(`{${name}}`, String(value));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

type Tier = 'basic' | 'card' | 'item' | 'golden' | null;

/**
 * 复刻 page.tsx:781-791 的接线 — onComplete 里 clearVariableReward() (条件渲染卸载
 * overlay) + dispatchEvent('variable-reward-complete')。onComplete / 事件各计数一次。
 */
function Harness({ tier, onComplete }: { tier: Tier; onComplete: () => void }) {
  const [show, setShow] = useState(true);
  if (!show) return null;
  return (
    <VariableRewardOverlay
      rewardTier={tier}
      bonusTokens={120}
      bonusVitality={30}
      onComplete={() => {
        onComplete();
        window.dispatchEvent(new CustomEvent('variable-reward-complete'));
        setShow(false);
      }}
    />
  );
}

function mountChain(tier: Tier) {
  const onComplete = vi.fn();
  let eventCount = 0;
  const counter = () => eventCount += 1;
  window.addEventListener('variable-reward-complete', counter);
  const { container, unmount } = render(<Harness tier={tier} onComplete={onComplete} />);
  return {
    onComplete,
    eventCount: () => eventCount,
    root: () => container.firstElementChild as HTMLElement,
    unmount: () => {
      window.removeEventListener('variable-reward-complete', counter);
      unmount();
    },
  };
}

const TIER_WINDOW_GUARD_MS = 10_000; // use-challenge-actions 安全兜底窗口

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VariableRewardOverlay — onChallengeCompleted 链上恰好一次', () => {
  it('自动关闭 (4s): onComplete + variable-reward-complete 恰好各一次, 推进到 10s 兜底窗口后仍是一次', () => {
    const chain = mountChain('golden');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(chain.onComplete).toHaveBeenCalledTimes(1);
    expect(chain.eventCount()).toBe(1);
    expect(chain.root()).toBeNull(); // 契约卸载: overlay 消失

    // D2 兜底窗口: 即使 use-challenge-actions 的 10s setTimeout 到点,
    // overlay 侧也不会再产生第二次事件/回调 (timer 已随卸载清理)
    act(() => {
      vi.advanceTimersByTime(TIER_WINDOW_GUARD_MS);
    });
    expect(chain.onComplete).toHaveBeenCalledTimes(1);
    expect(chain.eventCount()).toBe(1);
    chain.unmount();
  });

  it('手动点击关闭: onComplete 恰好一次, 4s closeTimer 不再补第二次', () => {
    const chain = mountChain('golden');

    act(() => {
      fireEvent.click(chain.root());
    });
    expect(chain.onComplete).toHaveBeenCalledTimes(1);
    expect(chain.eventCount()).toBe(1);
    expect(chain.root()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(TIER_WINDOW_GUARD_MS);
    });
    expect(chain.onComplete).toHaveBeenCalledTimes(1);
    expect(chain.eventCount()).toBe(1);
    chain.unmount();
  });

  it('连续快速点击: 第一次点击即卸载, 不会叠加多次触发', () => {
    const chain = mountChain('item');

    act(() => {
      fireEvent.click(chain.root());
      // overlay 已随契约卸载, 之后 root 为 null, 无法再点 — 等价于仅一次
    });
    expect(chain.root()).toBeNull();
    expect(chain.onComplete).toHaveBeenCalledTimes(1);
    chain.unmount();
  });
});

describe('VariableRewardOverlay — 生命周期边界', () => {
  it('提前卸载: closeTimer 清理, onComplete 永不触发 (挂直 overlay, 无 Harness 契约)', () => {
    const onComplete = vi.fn();
    const { unmount } = render(
      <VariableRewardOverlay rewardTier="golden" bonusTokens={1} bonusVitality={1} onComplete={onComplete} />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(TIER_WINDOW_GUARD_MS);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('rewardTier null / basic: 零渲染, 推进 10s 也无回调', () => {
    for (const tier of [null, 'basic'] as Tier[]) {
      const chain = mountChain(tier);
      expect(chain.root()).toBeNull();
      act(() => {
        vi.advanceTimersByTime(TIER_WINDOW_GUARD_MS);
      });
      expect(chain.onComplete).not.toHaveBeenCalled();
      expect(chain.eventCount()).toBe(0);
      chain.unmount();
    }
  });
});

describe('VariableRewardOverlay — 渲染内容', () => {
  it('golden 档: 标题 GOLDEN SEEING + 副标题 tokens/vitality 插值', () => {
    const chain = mountChain('golden');
    const root = chain.root();
    expect(root).not.toBeNull();
    // 标题逐字 stagger 渲染, 空格被替换成 \u00A0 — 归一化后断言
    const text = root.textContent.replace(/\u00A0/g, ' ');
    expect(text).toContain('GOLDEN SEEING');
    expect(text).toContain('+120 tokens · +30 vitality');
    chain.unmount();
  });

  it('card 档: 副标题只有 tokens (无 vitality)', () => {
    const chain = mountChain('card');
    expect(chain.root().textContent).toContain('+120 tokens');
    expect(chain.root().textContent).not.toContain('vitality');
    chain.unmount();
  });
});
