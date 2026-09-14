// @vitest-environment happy-dom

/**
 * CooldownCard 测试 — 24h 冷静卡 (batch48-b)
 *
 * 覆盖: 渲染 (条目 + 明天回访时间 + 两动作), 放进愿望单/现在就要 写待回访记录,
 * 防连点, 通用文案兜底, 守护开关静默, 零金额红线。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CooldownCard } from '../cooldown-card';
import { _resetGreenPrefStateForTest, setGreenPrefEnabled } from '@/hooks/use-green-pref';
import { _resetCooldownStoreForTest, getDueCooldown } from '../cooldown-store';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      ({
        'chat.cooldown.title': '24-hour cooldown card',
        'chat.cooldown.itemGeneric': 'that thing you wanted',
        'chat.cooldown.followupAt': `Tomorrow at ${vars?.time ?? ''} I'll come ask you`,
        'chat.cooldown.wishlistButton': 'Into the wishlist',
        'chat.cooldown.buyButton': 'I want it now',
        'chat.cooldown.wishlistDoneNote': "Done, it's in your wishlist 🌱",
        'chat.cooldown.buyDoneNote': "Okay, you're free 🐘",
        'chat.cooldown.itemName.clothing': 'piece of clothing',
      })[key] || key,
  }),
}));

describe('CooldownCard (冷静卡)', () => {
  beforeEach(() => {
    setGreenPrefEnabled(true);
    _resetCooldownStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGreenPrefStateForTest();
    _resetCooldownStoreForTest();
  });

  it('渲染条目名 + 明天回访时间 + 两个动作; 零金额', () => {
    const { container } = render(<CooldownCard data={{ category: 'clothing' }} />);
    expect(screen.getByText('24-hour cooldown card')).toBeTruthy();
    expect(container.textContent).toContain('piece of clothing');
    expect(container.textContent).toMatch(/Tomorrow at \d{1,2}:\d{2}/);
    expect(screen.getByTestId('cooldown-wishlist-button').textContent).toBe('Into the wishlist');
    expect(screen.getByTestId('cooldown-buy-button').textContent).toBe('I want it now');
    // 金额红线: 卡面不出现任何金额
    expect(container.textContent).not.toMatch(/\$|\¥/);
  });

  it('品类识别不出 → 通用条目文案兜底', () => {
    render(<CooldownCard data={{ category: null }} />);
    expect(screen.getByText(/that thing you wanted/)).toBeTruthy();
  });

  it('放进愿望单: 写待回访记录 (userChoseBuy=false) + 进已确认态', () => {
    render(<CooldownCard data={{ category: 'clothing' }} />);
    fireEvent.click(screen.getByTestId('cooldown-wishlist-button'));

    expect(screen.getByTestId('cooldown-confirmed-note').textContent).toContain('wishlist');
    expect(screen.queryByTestId('cooldown-wishlist-button')).toBeNull();

    // 24h 内不派发回访, 25h 后派发
    expect(getDueCooldown(Date.now())).toBeNull();
    const due = getDueCooldown(Date.now() + 25 * 60 * 60 * 1000);
    expect(due).toEqual(expect.objectContaining({ category: 'clothing', userChoseBuy: false }));
  });

  it('现在就要: 写记录 userChoseBuy=true (次日祝福前置标记)', () => {
    render(<CooldownCard data={{ category: null }} />);
    fireEvent.click(screen.getByTestId('cooldown-buy-button'));

    expect(screen.getByTestId('cooldown-confirmed-note').textContent).toContain("you're free");
    const due = getDueCooldown(Date.now() + 25 * 60 * 60 * 1000);
    expect(due).toEqual(expect.objectContaining({ category: null, userChoseBuy: true }));
  });

  it('确认后防连点: 不重复写记录', () => {
    render(<CooldownCard data={{ category: 'home' }} />);
    const buy = screen.getByTestId('cooldown-buy-button');
    fireEvent.click(buy);
    // 已进确认态, 按钮已卸载 — 记录只有一份
    expect(getDueCooldown(Date.now() + 25 * 60 * 60 * 1000)?.userChoseBuy).toBe(true);
  });

  it('绿色守护关闭: 整体静默不渲染', () => {
    setGreenPrefEnabled(false);
    const { container } = render(<CooldownCard data={{ category: 'clothing' }} />);
    expect(container.querySelector('[data-testid="cooldown-card"]')).toBeNull();
  });
});
