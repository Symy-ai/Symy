// @vitest-environment happy-dom
// green-first-note + followup-bubble — 两个小组件渲染契约（此前 0 测试）
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GreenFirstNote } from '../green-first-note';
import { FollowupBubble } from '../followup-bubble';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'chat.products.greenFirstNote' ? '为你把绿色选项排在了前面 🌱' : key),
  }),
}));

describe('GreenFirstNote — 绿色引导语', () => {
  it('渲染 i18n 文案 + 叶子图标 aria-hidden', () => {
    const { container } = render(<GreenFirstNote />);
    expect(screen.getByText('为你把绿色选项排在了前面 🌱')).toBeTruthy();
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });
});

describe('FollowupBubble — 追问气泡', () => {
  const base = {
    testId: 'fb-1',
    question: '还想看看别的吗',
    primaryAction: { label: '好呀', testId: 'fb-yes', onSelect: vi.fn() },
    secondaryAction: { label: '先不了', testId: 'fb-no', onSelect: vi.fn() },
  };

  it('容器 testId + 问题文案 + 两按钮', () => {
    render(<FollowupBubble {...base} />);
    expect(document.querySelector('[data-testid="fb-1"]')).not.toBeNull();
    expect(screen.getByText(/还想看看别的吗/)).toBeTruthy();
    expect(screen.getByText('好呀')).toBeTruthy();
    expect(screen.getByText('先不了')).toBeTruthy();
  });

  it('主/次按钮 onSelect 触发', () => {
    render(<FollowupBubble {...base} />);
    fireEvent.click(screen.getByText('好呀'));
    expect(base.primaryAction.onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('先不了'));
    expect(base.secondaryAction.onSelect).toHaveBeenCalledTimes(1);
  });
});
