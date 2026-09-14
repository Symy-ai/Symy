// @vitest-environment happy-dom

/**
 * ChatRecap 组件渲染测试 — zh/en 文案、继续聊回调传续接 prompt、关闭回调。
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatRecap } from '../chat-recap';
import type { ChatRecapTopic } from '@/lib/chat-recap-topic';

let mockLocale: 'zh' | 'en' = 'zh';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      ({
        'chat.recapPrefix': 'MOCK_PREFIX',
        'chat.recapContinue': 'MOCK_CONTINUE',
        'chat.recapDismiss': 'MOCK_DISMISS',
      })[key] ?? opts?.defaultValue ?? key,
    locale: mockLocale,
  }),
}));

const topic: ChatRecapTopic = {
  kind: 'green_alt',
  summaryZh: '「象牙」的绿色替代',
  summaryEn: 'greener alternatives to "ivory"',
  continuePromptZh: '我们上次聊到「象牙」的替代方案，这次想继续看看有哪些选择',
  continuePromptEn: 'Last time we talked about greener alternatives to "ivory"',
  messageId: 'h2',
};

describe('ChatRecap', () => {
  it('渲染回顾条: zh 摘要 + 继续聊 + 关闭按钮', () => {
    render(<ChatRecap topic={topic} onContinue={() => {}} onDismiss={() => {}} />);
    expect(screen.getByTestId('chat-recap')).toBeTruthy();
    expect(screen.getByText(/「象牙」的绿色替代/)).toBeTruthy();
    expect(screen.getByText('MOCK_CONTINUE')).toBeTruthy();
  });

  it('点继续聊 → onContinue 收到 zh 续接 prompt + onDismiss 调用 (由父级触发)', () => {
    const onContinue = vi.fn();
    render(<ChatRecap topic={topic} onContinue={onContinue} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText('MOCK_CONTINUE'));
    expect(onContinue).toHaveBeenCalledWith(topic.continuePromptZh);
  });

  it('en locale → 渲染 en 摘要, 继续聊传 en 续接 prompt', () => {
    mockLocale = 'en';
    const onContinue = vi.fn();
    render(<ChatRecap topic={topic} onContinue={onContinue} onDismiss={() => {}} />);
    expect(screen.getByText(/greener alternatives to "ivory"/)).toBeTruthy();
    fireEvent.click(screen.getByText('MOCK_CONTINUE'));
    expect(onContinue).toHaveBeenCalledWith(topic.continuePromptEn);
    mockLocale = 'zh';
  });

  it('点关闭 → onDismiss 调用, 不触发 onContinue', () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(<ChatRecap topic={topic} onContinue={onContinue} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('MOCK_DISMISS'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
