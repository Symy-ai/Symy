// @vitest-environment happy-dom

/**
 * topic-plaza — 空态广场 / 折叠态 💡 弹层渲染 (batch55-a)
 *
 * 覆盖: chip 组渲染与点击发送、弹层开合、ChatInput 空态出广场/有历史出 💡
 * (含无 buddyState/noData 情况不叠报错)。文案直接读实际词典, 防测试内漂移。
 */

import React, { type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import zhMessages from '@/i18n/messages/zh.json';
import enMessages from '@/i18n/messages/en.json';
import { TopicPlazaChips, TOPIC_PLAZA_CHIP_IDS } from '../topic-plaza-chips';
import { TopicPlazaPopover } from '../topic-plaza-popover';
import { ChatInput } from '../../parts/chat-input';

const localeMock = vi.hoisted(() => ({ locale: 'zh' as 'zh' | 'en' }));

// SmartPromptChips 是独立的守卫态 chip 组, 不在本次断言面内
vi.mock('@/components/chat/smart-prompt-chips', () => ({
  SmartPromptChips: () => null,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: localeMock.locale,
    t: (key: string) => {
      const dict = localeMock.locale === 'zh' ? zhMessages : enMessages;
      const parts = key.split('.');
      let node: unknown = dict;
      for (const part of parts) {
        node = (node as Record<string, unknown>)?.[part];
      }
      return typeof node === 'string' ? node : key;
    },
  }),
}));

function chipTexts(): string[] {
  const dict = localeMock.locale === 'zh' ? zhMessages : enMessages;
  const items = (dict.chat as Record<string, unknown>).topicPlaza as { items: Record<string, string> };
  return TOPIC_PLAZA_CHIP_IDS.map((id) => items.items[id]);
}

describe('TopicPlazaChips', () => {
  it.each(['zh', 'en'] as const)('renders every chip and sends its text on click (%s)', (locale) => {
    localeMock.locale = locale;
    const onQuickReply = vi.fn();
    render(<TopicPlazaChips onQuickReply={onQuickReply} />);

    for (const text of chipTexts()) {
      expect(screen.getByText(text).closest('button')).not.toBeNull();
    }
    const first = chipTexts()[0];
    fireEvent.click(screen.getByText(first));
    expect(onQuickReply).toHaveBeenCalledWith(first);
  });
});

describe('TopicPlazaPopover', () => {
  it('starts folded, opens on 💡, and closes + sends after picking a chip', () => {
    localeMock.locale = 'zh';
    const onQuickReply = vi.fn();
    render(<TopicPlazaPopover onQuickReply={onQuickReply} />);

    // 折叠态: 面板不渲染, 只有 💡 入口
    expect(screen.queryByTestId('topic-plaza-chips')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '话题广场' }));

    const first = chipTexts()[0];
    expect(screen.getByText(first)).toBeTruthy();
    fireEvent.click(screen.getByText(first));
    expect(onQuickReply).toHaveBeenCalledWith(first);
    // 选完即收起
    expect(screen.queryByTestId('topic-plaza-chips')).toBeNull();
  });
});

describe('ChatInput topic plaza wiring', () => {
  function renderChatInput(messagesCount: number) {
    render(
      <ChatInput
        input=""
        inputRef={{ current: null } as unknown as RefObject<HTMLInputElement>}
        isComposingRef={{ current: false }}
        isDemo={false}
        isLoading={false}
        isLoadingHistory={false}
        gradientClass="from-emerald-500/20 to-emerald-500/5"
        messagesCount={messagesCount}
        onInputChange={() => {}}
        onCompositionStart={() => {}}
        onCompositionEnd={() => {}}
        onKeyDown={() => {}}
        onSendClick={() => {}}
        onQuickReply={() => {}}
      />,
    );
  }

  it('empty state (no buddy state / no history) renders the full plaza without errors', () => {
    localeMock.locale = 'zh';
    renderChatInput(0);
    expect(screen.getByTestId('topic-plaza-empty')).toBeTruthy();
    for (const text of chipTexts()) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // 空态不出现折叠入口 (广场已经全量展示)
    expect(screen.queryByTestId('topic-plaza-popover')).toBeNull();
  });

  it('with history, plaza folds into the 💡 popover entry', () => {
    localeMock.locale = 'en';
    renderChatInput(5);
    expect(screen.queryByTestId('topic-plaza-empty')).toBeNull();
    expect(screen.getByTestId('topic-plaza-popover')).toBeTruthy();
  });

  it('active challenge suppresses the plaza entirely (challenge UI owns the composer)', () => {
    localeMock.locale = 'zh';
    render(
      <ChatInput
        input=""
        inputRef={{ current: null } as unknown as RefObject<HTMLInputElement>}
        isComposingRef={{ current: false }}
        isDemo={false}
        isLoading={false}
        isLoadingHistory={false}
        activeChallenge={{ itemName: 'shoes', amount: 10 }}
        gradientClass="from-emerald-500/20 to-emerald-500/5"
        messagesCount={0}
        onInputChange={() => {}}
        onCompositionStart={() => {}}
        onCompositionEnd={() => {}}
        onKeyDown={() => {}}
        onSendClick={() => {}}
        onQuickReply={() => {}}
      />,
    );
    expect(screen.queryByTestId('topic-plaza-empty')).toBeNull();
    expect(screen.queryByTestId('topic-plaza-popover')).toBeNull();
  });
});
