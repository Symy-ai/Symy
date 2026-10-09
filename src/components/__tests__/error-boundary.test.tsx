// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'errorBoundary.somethingWentWrong': '出了点问题',
    'errorBoundary.unexpectedError': '意外错误',
    'common.tryAgain': '再试一次',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { ErrorBoundary } from '../error-boundary';

function Bomb({ shouldThrow, onMount }: { shouldThrow?: boolean; onMount?: () => void }) {
  onMount?.();
  if (shouldThrow) throw new Error('kaboom-测试崩溃');
  return <div data-testid="ok">正常内容</div>;
}

/**
 * error-boundary.tsx (79行) — 全局错误边界 (Bug #14 + BUG-119 重挂载)。
 *
 * 锁定:
 * - 子组件抛错 → 捕获渲染 fallback UI (error.message 展示)
 * - 自定义 fallback 优先
 * - 再试一次 → resetKey+1 强制重挂载 (BUG-119: 恢复后子组件重建)
 * - 正常态透传 children
 */
describe('ErrorBoundary 错误边界', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('正常态透传 children', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeTruthy();
  });

  it('子组件抛错 → fallback UI + error.message', () => {
    // 抑制 React 控制台错误噪音
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('出了点问题')).toBeTruthy();
    expect(screen.getByText(/kaboom-测试崩溃/)).toBeTruthy();
    expect(screen.queryByTestId('ok')).toBeNull();
    spy.mockRestore();
  });

  it('自定义 fallback 优先', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div data-testid="custom">自定义兜底</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(screen.queryByText('出了点问题')).toBeNull();
    spy.mockRestore();
  });

  it('再试一次 → 重挂载 children (BUG-119: onMount 计数验证)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let mounts = 0;
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow onMount={() => { mounts++; }} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/kaboom/)).toBeTruthy();
    // 先换健康 children, 再点再试一次 → resetKey+1 → 健康版重挂载
    rerender(
      <ErrorBoundary>
        <Bomb onMount={() => { mounts++; }} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('再试一次'));
    expect(screen.getByTestId('ok')).toBeTruthy();
    expect(mounts).toBeGreaterThanOrEqual(2); // 首次炸 + 恢复链重挂载
    spy.mockRestore();
  });
});
