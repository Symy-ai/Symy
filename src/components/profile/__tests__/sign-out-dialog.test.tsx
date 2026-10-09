// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'profile.signOut': '退出登录',
    'profile.signOutConfirmDesc': '退出吗? 你的数据都安全, 随时可以回来。',
    'profile.displayNameCancel': '取消',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { SignOutConfirmDialog } from '../sign-out-dialog';

/**
 * sign-out-dialog.tsx (73行) — 退出确认弹窗 (P2-14)。
 *
 * 锁定:
 * - open=false → null
 * - 双按钮回调 (取消/确认)
 * - 遮罩点击=取消; 内容区点击不冒泡
 * - z-index 用 Z_INDEX.MODAL_HIGH (PM-P1-2 规范锚)
 */
describe('SignOutConfirmDialog 退出确认', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('open=false → null', () => {
    const { container } = render(<SignOutConfirmDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('双按钮: 取消 → onCancel / 确认 → onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<SignOutConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByText('退出登录').pop() as HTMLElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('遮罩点击=取消; 内容区点击不冒泡', () => {
    const onCancel = vi.fn();
    render(<SignOutConfirmDialog open onConfirm={vi.fn()} onCancel={onCancel} />);
    // 遮罩 (portal 到 body 的最外层)
    const overlay = document.body.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // 内容区点击不触发
    fireEvent.click(screen.getByText('退出吗? 你的数据都安全, 随时可以回来。'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('z-index = Z_INDEX.MODAL_HIGH (PM-P1-2 规范锚)', async () => {
    const { Z_INDEX } = await import('@/lib/z-index');
    render(<SignOutConfirmDialog open onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const overlay = document.body.querySelector('.fixed.inset-0') as HTMLElement;
    expect(overlay.style.zIndex).toBe(String(Z_INDEX.MODAL_HIGH));
  });
});
