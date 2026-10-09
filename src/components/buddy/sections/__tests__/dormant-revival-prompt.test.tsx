// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'buddy.companionLostPower': '小象沉睡了',
    'buddy.depositToReviveDesc': '存入一笔守护金, 唤醒你的伙伴',
    'buddy.reviveCompanion': '唤醒小象',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { DormantRevivalPrompt } from '../dormant-revival-prompt';

/**
 * dormant-revival-prompt.tsx (32行) — 沉睡复活提示 (Wave 1 搬运件)。
 *
 * 锁定:
 * - 三文案 (沉睡标题/描述/唤醒按钮)
 * - MoonStar 图标
 * - onRevive 点击
 */
describe('DormantRevivalPrompt 沉睡复活', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('三文案渲染', () => {
    render(<DormantRevivalPrompt onRevive={vi.fn()} />);
    expect(screen.getByText('小象沉睡了').className).toContain('text-emerald-400');
    expect(screen.getByText('存入一笔守护金, 唤醒你的伙伴')).toBeTruthy();
    expect(screen.getByRole('button', { name: '唤醒小象' })).toBeTruthy();
  });

  it('MoonStar 图标 + onRevive', () => {
    const onRevive = vi.fn();
    render(<DormantRevivalPrompt onRevive={onRevive} />);
    expect(document.querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onRevive).toHaveBeenCalledTimes(1);
  });
});
