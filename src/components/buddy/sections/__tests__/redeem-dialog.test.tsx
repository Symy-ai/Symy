// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string; n?: number; type?: string; cost?: number }) => {
  const map: Record<string, string> = {
    'buddy.challengeLimitReached': "今天的次数已用完",
    'butterfly.gachaLimitReached': '今日次数已到',
    'buddy.redeemPrompt': '用代币换一次?',
    'buddy.tokensLeft': '剩 {n} 枚',
    'buddy.redeemNotEnough': '代币不够了, 完成更多挑战来赚代币。',
    'buddy.seeIt': '看它',
    'buddy.gacha': '假如',
  };
  let v = map[key] ?? opts?.defaultValue ?? key;
  if (opts) {
    if (opts.n !== undefined) v = v.replace('{n}', String(opts.n));
    if (opts.type !== undefined) v = v.replace('{type}', String(opts.type));
    if (opts.cost !== undefined) v = v.replace('{cost}', String(opts.cost));
  }
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { RedeemDialog } from '../redeem-dialog';

/**
 * redeem-dialog.tsx (67行) — 代币兑换对话框 (Wave 1 搬运件)。
 *
 * 锁定:
 * - redeemType 双标题 (see_it=挑战限额 / 假如=gacha 限额)
 * - 兑换门: see_it 门槛 20 / what_if 50; tokens 不够 → disabled + 不够提示
 * - redeeming → 按钮 '...' + disabled
 * - 遮罩点击 onClose; 内容区不冒泡
 */
describe('RedeemDialog 代币兑换', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('redeemType 双标题', () => {
    const { unmount } = render(<RedeemDialog redeemType="see_it" animatedTokens={30} tokens={30} redeeming={false} onRedeem={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('今天的次数已用完')).toBeTruthy();
    unmount();
    render(<RedeemDialog redeemType="gacha" animatedTokens={60} tokens={60} redeeming={false} onRedeem={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('今日次数已到')).toBeTruthy();
  });

  it('兑换门: see_it 20 / what_if 50 (不够 → disabled+提示)', () => {
    const { unmount: _u1 } = render(<RedeemDialog redeemType="see_it" animatedTokens={19} tokens={19} redeeming={false} onRedeem={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Redeem/ })[0]).toHaveProperty('disabled', true);
    expect(screen.getByText('代币不够了, 完成更多挑战来赚代币。')).toBeTruthy();
    cleanup(); // 段间强隔离 (unmount 后 DOM 残留陷阱)
    // gacha 门槛 50: 20 不够
    render(<RedeemDialog redeemType="gacha" animatedTokens={20} tokens={20} redeeming={false} onRedeem={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Redeem/ })[0]).toHaveProperty('disabled', true);
    cleanup(); // 段间强隔离
    // 20 够 see_it (disabled 属性断言经getAttribute 防类型收窄歧义)
    render(<RedeemDialog redeemType="see_it" animatedTokens={20} tokens={20} redeeming={false} onRedeem={vi.fn()} onClose={vi.fn()} />);
    const enough = screen.getAllByRole('button', { name: /Redeem/ }).at(-1) as HTMLButtonElement;
    expect(enough.getAttribute('disabled')).toBeNull(); // 可点
    expect(screen.queryByText('代币不够了, 完成更多挑战来赚代币。')).toBeNull();
  });

  it('animatedTokens 展示 + redeeming 态', () => {
    const { unmount } = render(<RedeemDialog redeemType="see_it" animatedTokens={42} tokens={42} redeeming={false} onRedeem={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('42')).toBeTruthy(); // 滚动动画值展示
    expect(screen.getByText('剩 42 枚')).toBeTruthy();
    unmount();
    render(<RedeemDialog redeemType="see_it" animatedTokens={42} tokens={42} redeeming onRedeem={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('...')).toBeTruthy(); // redeeming 按钮
    expect(screen.getByText('...')).toHaveProperty('disabled', true);
  });

  it('遮罩点击 onClose; 内容区不冒泡', () => {
    const onClose = vi.fn();
    render(<RedeemDialog redeemType="see_it" animatedTokens={30} tokens={30} redeeming={false} onRedeem={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('用代币换一次?')); // 内容区
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement); // 遮罩
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
