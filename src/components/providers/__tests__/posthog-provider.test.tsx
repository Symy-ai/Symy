// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/posthog', () => ({ initPostHog: initMock }));

import { SymyAnalyticsProvider } from '../posthog-provider';

/**
 * posthog-provider.tsx (20行) — 分析初始化壳。
 *
 * 锁定:
 * - mount 时 initPostHog 一次 (空 deps)
 * - children 透传 (无包装 DOM)
 */
describe('SymyAnalyticsProvider', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('mount → initPostHog 一次; children 透传', () => {
    render(
      <SymyAnalyticsProvider>
        <p>内容</p>
      </SymyAnalyticsProvider>,
    );
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('内容')).toBeTruthy();
    // 无包装 DOM: 容器首子即 P (无额外 provider 元素)
    expect(document.body.children[0].children[0].tagName).toBe('P');
  });

  it('重渲染不再 init (空 deps 锚)', () => {
    const { rerender } = render(
      <SymyAnalyticsProvider>
        <span key="a">A</span>
      </SymyAnalyticsProvider>,
    );
    rerender(
      <SymyAnalyticsProvider>
        <span key="b">B</span>
      </SymyAnalyticsProvider>,
    );
    expect(initMock).toHaveBeenCalledTimes(1);
  });
});
