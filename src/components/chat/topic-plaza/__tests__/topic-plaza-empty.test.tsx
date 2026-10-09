// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => (key === 'chat.topicPlaza.title' ? '想聊什么? 小象都接得住' : key);
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { TopicPlazaEmpty } from '../topic-plaza-empty';

/**
 * topic-plaza-empty.tsx (28行) — 空态话题广场 (batch55-a)。
 *
 * 锁定:
 * - testid 容器 + 标题
 * - 复用 TopicPlazaChips (真组件, 九 chip)
 * - onQuickReply 透传
 */
describe('TopicPlazaEmpty 空态广场', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('容器 testid+标题', () => {
    render(<TopicPlazaEmpty onQuickReply={vi.fn()} />);
    expect(screen.getByTestId('topic-plaza-empty')).toBeTruthy();
    expect(screen.getByText('想聊什么? 小象都接得住')).toBeTruthy();
  });

  it('复用 TopicPlazaChips: 九 chip 渲染', () => {
    render(<TopicPlazaEmpty onQuickReply={vi.fn()} />);
    expect(screen.getByTestId('topic-plaza-chips')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(9);
  });

  it('onQuickReply 透传 (点 chip 触发)', () => {
    const onQuickReply = vi.fn();
    render(<TopicPlazaEmpty onQuickReply={onQuickReply} />);
    const first = screen.getAllByRole('button')[0];
    fireEvent.click(first);
    expect(onQuickReply).toHaveBeenCalledWith(first.textContent);
  });
});
