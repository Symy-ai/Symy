// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FollowupAnsweredBubble, FollowupBubble } from '../followup-bubble';

/**
 * followup-bubble.tsx (65行) — 回访条双件 (问题态/已答态)。
 *
 * 锁定:
 * - 问题态: testid 容器 + 🐘 问句 + 双按钮各自 testid/onSelect
 * - 已答态: testid 容器 + 🐘 答案串, 零按钮
 */
describe('FollowupBubble 问题态', () => {
  afterEach(() => cleanup());

  const props = {
    testId: 'strip-x',
    question: '上次的选择后来怎么样了?',
    primaryAction: { label: '我做到了', testId: 'strip-x-yes', onSelect: vi.fn() },
    secondaryAction: { label: '没做到', testId: 'strip-x-no', onSelect: vi.fn() },
  };

  it('容器 testid + 🐘 问句', () => {
    render(<FollowupBubble {...props} />);
    expect(screen.getByTestId('strip-x').textContent).toContain('上次的选择后来怎么样了?');
    expect(screen.getByTestId('strip-x').textContent).toContain('🐘');
  });

  it('双按钮: 各自 testid + onSelect 独立触发', () => {
    render(<FollowupBubble {...props} />);
    fireEvent.click(screen.getByTestId('strip-x-yes'));
    expect(props.primaryAction.onSelect).toHaveBeenCalledTimes(1);
    expect(props.secondaryAction.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('strip-x-no'));
    expect(props.secondaryAction.onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('FollowupAnsweredBubble 已答态', () => {
  afterEach(() => cleanup());

  it('容器 testid + 🐘 答案; 零按钮', () => {
    render(<FollowupAnsweredBubble testId="strip-x-done" answer="恭喜! 又守住了一次 🎉" />);
    const el = screen.getByTestId('strip-x-done');
    expect(el.textContent).toContain('🐘');
    expect(el.textContent).toContain('恭喜! 又守住了一次 🎉');
    expect(el.querySelectorAll('button')).toHaveLength(0); // 已答态无操作
  });
});
