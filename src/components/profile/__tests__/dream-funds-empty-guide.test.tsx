// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'buddy.dreamFundsEmpty': '添加你的第一个梦想',
    'buddy.dreamFundsEmptyDesc': "不花的钱会朝着梦想生长。",
    'buddy.dreamFundAdd': '添加一笔 →',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));
vi.mock('@/components/buddy/dream-fund-editor', () => ({
  DreamFundEditor: vi.fn((props: {
    open: boolean;
    mode?: string;
    initialValues?: { name: string; target: number; emoji: string } | null;
    onCreate?: (f: { name: string; target: number; emoji: string }) => void;
    onClose?: () => void;
  }) => {
    if (!props.open) return null;
    return (
      <div data-testid="editor-mock">
        <span data-testid="editor-mode">{props.mode ?? 'create'}</span>
        {props.initialValues && <span data-testid="editor-prefill">{props.initialValues.name}|{props.initialValues.target}|{props.initialValues.emoji}</span>}
        <button data-testid="editor-create" onClick={() => props.onCreate?.({ name: '新建', target: 100, emoji: '🎯' })}>mock-create</button>
        <button data-testid="editor-close" onClick={() => props.onClose?.()}>mock-close</button>
      </div>
    );
  }),
}));

import { DreamFundEmptyGuide } from '../dream-funds-empty-guide';

/**
 * dream-funds-empty-guide.tsx (88行) — T-2 首次引导。
 *
 * 锁定:
 * - 守卫: isDemo / 有 funds → null
 * - 四建议 chips
 * - chip 点击 → 编辑器开+预填
 * - Add a fund → 编辑器开+无预填
 * - onCreate 链: current 归 0 + 编辑器关闭
 */
describe('DreamFundEmptyGuide 空态引导', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('守卫: isDemo / 有 funds → null', () => {
    const { container } = render(<DreamFundEmptyGuide isDemo dreamFunds={undefined} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    const c2 = render(
      <DreamFundEmptyGuide
        isDemo={false}
        dreamFunds={[{ id: 'f1', name: 'x', target: 1, current: 0, emoji: '🏠' } as never]}
      />,
    );
    expect(c2.container.innerHTML).toBe('');
  });

  it('空态: 四建议 chips + 添加按钮', () => {
    render(<DreamFundEmptyGuide isDemo={false} dreamFunds={undefined} />);
    expect(screen.getByText(/🏠 House down payment/)).toBeTruthy();
    expect(screen.getByText(/🚨 Emergency fund/)).toBeTruthy();
    expect(screen.getByText(/✈️ Dream vacation/)).toBeTruthy();
    expect(screen.getByText(/💻 New laptop/)).toBeTruthy();
    expect(screen.getByText('添加一笔 →')).toBeTruthy();
  });

  it('chip 点击 → 编辑器开+预填建议值', () => {
    render(<DreamFundEmptyGuide isDemo={false} dreamFunds={undefined} />);
    expect(screen.queryByTestId('editor-mock')).toBeNull();
    fireEvent.click(screen.getByText(/🏠 House down payment/));
    expect(screen.getByTestId('editor-mode').textContent).toBe('create');
    expect(screen.getByTestId('editor-prefill').textContent).toBe('House down payment ($50,000)|50000|🏠');
  });

  it('Add a fund → 编辑器开+无预填', () => {
    render(<DreamFundEmptyGuide isDemo={false} dreamFunds={undefined} />);
    fireEvent.click(screen.getByText('添加一笔 →'));
    expect(screen.getByTestId('editor-mock')).toBeTruthy();
    expect(screen.queryByTestId('editor-prefill')).toBeNull();
  });

  it('onCreate 链: current 归 0 + 编辑器关闭', () => {
    const onCreate = vi.fn();
    render(<DreamFundEmptyGuide isDemo={false} dreamFunds={undefined} onCreateDreamFund={onCreate} />);
    fireEvent.click(screen.getByText('添加一笔 →'));
    fireEvent.click(screen.getByTestId('editor-create'));
    expect(onCreate).toHaveBeenCalledWith({ name: '新建', target: 100, current: 0, emoji: '🎯' });
    expect(screen.queryByTestId('editor-mock')).toBeNull();
  });
});
