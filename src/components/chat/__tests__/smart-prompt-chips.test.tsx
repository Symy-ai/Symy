// @vitest-environment happy-dom

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartPromptChips } from '../smart-prompt-chips';

const baseHealthEvent = {
  id: 'evt-1',
  eventType: 'challenge_completed',
  vitalityChange: 1,
  newVitality: 100,
  tokenChange: 0,
  triggerSource: 'test',
  triggerId: null,
  description: 'Guarded a purchase',
  metadata: {},
  createdAt: new Date().toISOString(),
};

function createBuddyState(overrides: Record<string, unknown> = {}) {
  return {
    vitality: 100,
    tokens: 0,
    health: 'healthy' as const,
    level: 1,
    xp: 0,
    xpToNext: 100,
    streak: 3,
    dreamFunds: [],
    badges: [],
    totalSaved: 0,
    challengesCompleted: 1,
    lastHealingKitAt: null,
    version: 1,
    growthStage: 'baby' as const,
    personality: 'unknown' as const,
    intimacy: 0,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: new Date().toISOString(),
    ...overrides,
  };
}

const messagesMock = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'zh',
  value: {
    en: {
      'chat.smartPrompt.badgeGoal': 'Help me finish 「{goal}」',
      'chat.smartPrompt.recentIntercepts': 'What did I guard in the last 7 days?',
      'chat.smartPrompt.heatmap': 'Show me my guard heatmap',
      'chat.smartPrompt.fallback': 'What do you want to save today?',
      'chat.smartPrompt.afterIntercept': 'Can you help me find a greener alternative for that?',
    },
    zh: {
      'chat.smartPrompt.badgeGoal': '帮我完成「{goal}」',
      'chat.smartPrompt.recentIntercepts': '我最近 7 天守护过什么？',
      'chat.smartPrompt.heatmap': '看看我的守护热力图',
      'chat.smartPrompt.fallback': '今天想守护什么？',
      'chat.smartPrompt.afterIntercept': '刚才那个能帮我找绿色替代吗？',
    },
  } as Record<'en' | 'zh', Record<string, string>>,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: messagesMock.locale,
    t: (key: string, params?: Record<string, string>) => {
      const template = messagesMock.value[messagesMock.locale][key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
    },
  }),
}));

const badgesMock = vi.hoisted(() => ({
  ALL_BADGES: [
    { id: 'bg-1', name: 'Green Guardian Rookie', description: '', icon: '', criteria: { type: 'streak', count: 3 } as const },
  ],
}));

vi.mock('@/lib/badge-constants', () => badgesMock);

const badgeGoalMock = vi.hoisted(() => {
  const getBadgeGoal = vi.fn(() => null) as unknown as {
    (): string | null;
    mockReturnValue: (value: string | null) => void;
  };
  return { getBadgeGoal };
});

vi.mock('@/lib/badge-goal', () => badgeGoalMock);

describe('SmartPromptChips', () => {
  beforeEach(() => {
    const storage: Record<string, string> = {};
    const sessionStorageMock = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
      clear: () => { Object.keys(storage).forEach(key => delete storage[key]); },
    };
    Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, configurable: true });
    badgeGoalMock.getBadgeGoal.mockReturnValue(null);
  });

  it('shows badgeGoal chip text when unfinished badge goal exists', () => {
    badgeGoalMock.getBadgeGoal.mockReturnValue('bg-1');
    const quickReply = vi.fn();
    render(
      <SmartPromptChips
        hasSentMessage={false}
        buddyState={createBuddyState({ streak: 1 })}
        healthEvents={[]}
        hasHadInterceptInSession={false}
        onQuickReply={quickReply}
      />,
    );

    expect(screen.getByText('Help me finish 「Green Guardian Rookie」')).toBeTruthy();
    fireEvent.click(screen.getByText('Help me finish 「Green Guardian Rookie」'));
    expect(quickReply).toHaveBeenCalledWith('Help me finish 「Green Guardian Rookie」');
  });

  it('shows recent intercepts chip text when there are intercept events in last 7 days', () => {
    badgeGoalMock.getBadgeGoal.mockReturnValue(null);
    const event = {
      ...baseHealthEvent,
      createdAt: new Date().toISOString(),
    };

    render(
      <SmartPromptChips
        hasSentMessage={false}
        buddyState={createBuddyState({ streak: 1 })}
        healthEvents={[event]}
        hasHadInterceptInSession={false}
        onQuickReply={vi.fn()}
      />,
    );

    expect(screen.getByText('What did I guard in the last 7 days?')).toBeTruthy();
  });

  it('shows heatmap chip text when streak >= 3 and no badge goal or recent intercepts', () => {
    badgeGoalMock.getBadgeGoal.mockReturnValue(null);
    render(
      <SmartPromptChips
        hasSentMessage={false}
        buddyState={createBuddyState({ streak: 4 })}
        healthEvents={[]}
        hasHadInterceptInSession={false}
        onQuickReply={vi.fn()}
      />,
    );

    expect(screen.getByText('Show me my guard heatmap')).toBeTruthy();
  });

  it('shows fallback chip text when no badge goal, no recent intercepts, and streak < 3', () => {
    badgeGoalMock.getBadgeGoal.mockReturnValue(null);
    render(
      <SmartPromptChips
        hasSentMessage={false}
        buddyState={createBuddyState({ streak: 0 })}
        healthEvents={[]}
        hasHadInterceptInSession={false}
        onQuickReply={vi.fn()}
      />,
    );

    expect(screen.getByText('What do you want to save today?')).toBeTruthy();
  });

  it('hides chips after first message sent (sessionStorage flag)', () => {
    badgeGoalMock.getBadgeGoal.mockReturnValue(null);
    window.sessionStorage.setItem('symy-chat-first-message-sent', 'true');

    render(
      <SmartPromptChips
        hasSentMessage={true}
        buddyState={createBuddyState({ streak: 0 })}
        healthEvents={[]}
        hasHadInterceptInSession={false}
        onQuickReply={vi.fn()}
      />,
    );

    expect(screen.queryByText('What do you want to save today?')).toBeNull();
  });
});
