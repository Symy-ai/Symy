// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/types/chat-message';
import { useChatDemoMode } from '../use-chat-demo-mode';

const messages = {
  en: {
    streak: '7 days of you holding the gate — Symy is so proud 🐘✨',
    projectorUser: 'I almost bought a $89 mini projector on TikTok just now... but I stopped myself!',
    projectorAssistant: '$89 = 4.5 hours of your life, and you paused before paying. That money could sail toward Iceland instead. Symy trumpets! 🐘🎉',
    lateNightUser: 'Just late night scrolling... I almost clicked buy but then I thought about my Iceland trip fund',
    lateNightAssistant: "Late-night scrolling put it in your head — and you still paused. That's $89 sailing toward Iceland. One guarded choice at a time 🐘",
  },
  zh: {
    streak: '你已经连续 7 天守住了这扇门，Symy 真为你骄傲 🐘✨',
    projectorUser: '我刚才差点在 TikTok 买下 89 美元的迷你投影仪……不过我停下来了！',
    projectorAssistant: '89 美元约等于你 4.5 小时的生命，而你在付款前停了下来。这笔钱可以继续驶向冰岛之旅。Symy 为你欢呼！🐘🎉',
    lateNightUser: '只是深夜刷着视频……我差点点击购买，后来想起了我的冰岛旅行基金',
    lateNightAssistant: '深夜视频把这个念头放进你脑海里——你还是停下来了。这 89 美元正在驶向冰岛。一次一个被守护的选择 🐘',
  },
} as const;

const historyKeys = ['streak', 'projectorUser', 'projectorAssistant', 'lateNightUser', 'lateNightAssistant'] as const;

function makeArgs(locale: keyof typeof messages, setMessagesSync = vi.fn()) {
  const t = vi.fn((key: string) => {
    const messageKey = key.split('.').pop() as keyof (typeof messages)[typeof locale];
    return messages[locale][messageKey] ?? key;
  });

  return {
    args: {
      isDemo: true,
      messages: [] as ChatMessage[],
      setMessagesSync,
      setIsLoadingHistory: vi.fn(),
      t,
    },
    setMessagesSync,
  };
}

describe('useChatDemoMode', () => {
  it.each(['en', 'zh'] as const)('prefills demo history in %s', (locale) => {
    const { args, setMessagesSync } = makeArgs(locale);

    renderHook(() => useChatDemoMode(args));

    const history = apply(setMessagesSync.mock.calls[0][0], [] as ChatMessage[]);
    expect(history.map((message) => message.content)).toEqual(historyKeys.map((key) => messages[locale][key]));
    expect(history[0].id).toBe('demo-1');
  });

  it('does not duplicate history when t changes before the messages prop updates', () => {
    const setMessagesSync = vi.fn();
    const initialProps = makeArgs('en', setMessagesSync);
    const { rerender } = renderHook(({ args }) => useChatDemoMode(args), { initialProps });

    rerender(makeArgs('zh', setMessagesSync));

    const firstHistory = apply(setMessagesSync.mock.calls[0][0], [] as ChatMessage[]);
    const secondUpdater = setMessagesSync.mock.calls[1][0];
    expect(apply(secondUpdater, firstHistory)).toBe(firstHistory);
  });
});

function apply(
  updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  prev: ChatMessage[],
): ChatMessage[] {
  return typeof updater === 'function' ? updater(prev) : updater;
}
