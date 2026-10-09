// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'chat.topicPlaza.openLabel': '打开话题广场',
    'chat.topicPlaza.title': '想聊什么?',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { TopicPlazaPopover } from '../topic-plaza-popover';

/**
 * topic-plaza-popover.tsx (52行) — 折叠态广场弹层 (batch55-a)。
 *
 * 锁定:
 * - 💡 按钮切换: 初始无面板; 点击开; 再点关
 * - 面板 z-20 (低于 overlay 层级锚) + chips 九条
 * - 选 chip → 面板收起 + onQuickReply 透传
 */
describe('TopicPlazaPopover 折叠广场', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  const btn = () => screen.getByRole('button', { name: '打开话题广场' });

  it('💡 切换: 初始无; 点击开 (aria-expanded); 再点关', () => {
    render(<TopicPlazaPopover onQuickReply={vi.fn()} />);
    expect(screen.queryByText('想聊什么?')).toBeNull();
    expect(btn().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn());
    expect(screen.getByText('想聊什么?')).toBeTruthy();
    expect(btn().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn());
    expect(screen.queryByText('想聊什么?')).toBeNull();
  });

  it('面板 z-20 层级锚 + 九 chips', () => {
    render(<TopicPlazaPopover onQuickReply={vi.fn()} />);
    fireEvent.click(btn());
    const panel = document.querySelector('.z-20') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.querySelectorAll('button')).toHaveLength(9); // chips 复用
  });

  it('选 chip → 面板收起 + onQuickReply 透传', () => {
    const onQuickReply = vi.fn();
    render(<TopicPlazaPopover onQuickReply={onQuickReply} />);
    fireEvent.click(btn());
    const chip = screen.getAllByRole('button')[0];
    fireEvent.click(chip);
    expect(onQuickReply).toHaveBeenCalledWith(chip.textContent);
    expect(screen.queryByText('想聊什么?')).toBeNull(); // 收起
  });
});
