// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="btn" onClick={onClick}>{children}</button>
  ),
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { ResultDisplay } from '../result-display';

/**
 * result-display.tsx (134行) — admin API 结果展示 (三态 + 展开复制)。
 *
 * 锁定:
 * - idle → null
 * - 三态 Badge (成功/失败/执行中)
 * - error 文案展示
 * - duration 格式 (<1000ms / 秒一位小数); loading 无 duration
 * - 展开响应 JSON / 收起切换
 */
describe('ResultDisplay 结果展示', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('idle → null', () => {
    const { container } = render(<ResultDisplay result={{ action: 'x', status: 'idle' }} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('success → 成功 Badge + action 名', () => {
    render(<ResultDisplay result={{ action: 'list_models', status: 'success' }} />);
    expect(screen.getByText('list_models')).toBeTruthy();
    expect(screen.getByText('成功')).toBeTruthy();
  });

  it('error → 失败 Badge + error 文案', () => {
    render(<ResultDisplay result={{ action: 'x', status: 'error', error: 'boom 出错' }} />);
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getByText(/boom 出错/)).toBeTruthy();
  });

  it('loading → 执行中 Badge, 无 duration 展示', () => {
    render(<ResultDisplay result={{ action: 'x', status: 'loading', duration: 999 }} />);
    expect(screen.getByText('执行中')).toBeTruthy();
    expect(screen.queryByText(/999ms/)).toBeNull();
  });

  it('duration 格式: <1000ms 直显; ≥1000 秒一位小数', () => {
    render(<ResultDisplay result={{ action: 'x', status: 'success', duration: 250 }} />);
    expect(screen.getByText('250ms')).toBeTruthy();
    cleanup();
    render(<ResultDisplay result={{ action: 'x', status: 'success', duration: 2340 }} />);
    expect(screen.getByText('2.3s')).toBeTruthy();
  });

  it('展开响应 → JSON 预览; 再点收起', () => {
    render(<ResultDisplay result={{ action: 'x', status: 'success', response: { ok: true, n: 1 } }} />);
    const toggle = screen.getByTestId('btn');
    expect(screen.queryByText(/"ok": true/)).toBeNull(); // 初始收起
    fireEvent.click(toggle);
    expect(screen.getByText(/"ok": true/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText(/"ok": true/)).toBeNull();
  });
});
