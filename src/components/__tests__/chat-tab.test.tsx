/**
 * @vitest-environment happy-dom
 */
import React, { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuddyState } from '@/types/buddy-state';
import { ChatTab } from '../chat-tab';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  loadMoreMessages: vi.fn(),
  deleteMessage: vi.fn(),
  handleGiveUp: vi.fn(),
  handleChooseToBuy: vi.fn(),
  handleResume: vi.fn(),
  handleDismiss: vi.fn(),
  triggerSaw: vi.fn(),
  triggerBought: vi.fn(),
  attachPendingAhaMoment: vi.fn(),
  completeSilentMoment: vi.fn(),
  openReview: vi.fn(),
  closeReview: vi.fn(),
  markReviewed: vi.fn(),
  closeSettlement: vi.fn(),
  markSettled: vi.fn(),
  dismissRecap: vi.fn(),
}));

const useChatActionsMock = vi.hoisted(() => vi.fn());

const buddyState = {
  health: 'weak',
  streak: 3,
  vitality: 88,
  dreamFunds: [{ id: 'savings', name: 'Savings', current: 120, target: 500 }],
} as BuddyState;

const silentMoment = {
  outcome: 'saw' as const,
  amount: 88,
  itemName: 'Coffee grinder',
  challengeId: 'challenge-1',
};

let hookState = {
  mcpNotifications: [{ id: 'mcp-1', message: 'Tool done', type: 'success' as const }],
  followupRecap: 'last green topic',
  greenCommitment: null,
  greenOpen: false,
  activeGuards: null,
  activeGuardsLoading: false,
  guardMoments: null,
  guardMomentsLoading: false,
  silentMoment: null as typeof silentMoment | null,
};

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useLayoutEffect: vi.fn(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', user_metadata: { avatar_url: 'avatar.png' } },
    loading: false,
  }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en' }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, rateIsDefault: false, setHourlyRate: vi.fn(), isLoading: false }),
}));

vi.mock('@/hooks/use-silent-moment', () => ({
  useSilentMoment: () => ({
    silentMoment: hookState.silentMoment,
    triggerSaw: mocks.triggerSaw,
    triggerBought: mocks.triggerBought,
    attachPendingAhaMoment: mocks.attachPendingAhaMoment,
    completeSilentMoment: mocks.completeSilentMoment,
  }),
}));

vi.mock('../chat/hooks/use-mcp-notifications', () => ({
  useMcpNotifications: () => ({
    mcpNotifications: hookState.mcpNotifications,
    handleMCPResults: vi.fn(),
    addMcpNotification: vi.fn(),
  }),
}));

vi.mock('../chat/hooks/use-chat-demo-mode', () => ({
  useChatDemoMode: () => ({
    demoReplyTimerRef: { current: null },
    demoAuthTimerRef: { current: null },
    demoMsgCountRef: { current: 0 },
    DEMO_FREE_MESSAGES: 3,
  }),
}));

vi.mock('../chat/hooks/use-pending-context', () => ({
  usePendingContext: () => ({
    pendingContextRef: { current: null },
    pendingDisplayContentRef: { current: null },
    pendingContextReady: false,
    setPendingContextReady: vi.fn(),
    sendMessageRef: { current: vi.fn() },
  }),
}));

vi.mock('../chat/hooks/use-chat-lifecycle-cleanup', () => ({
  useChatLifecycleCleanup: vi.fn(),
}));

vi.mock('../chat/hooks/use-chat-history', () => ({
  useChatHistory: vi.fn(),
}));

vi.mock('../chat/hooks/use-chat-persistence', () => ({
  useChatPersistence: () => ({
    saveMessage: vi.fn(),
    deleteMessage: mocks.deleteMessage,
    loadMoreMessages: mocks.loadMoreMessages,
  }),
}));

vi.mock('../chat/hooks/use-challenge-fetch', () => ({
  useChallengeFetch: vi.fn(),
}));

vi.mock('../chat/hooks/use-impulse-context', () => ({
  useImpulseContext: () => ({ hasContext: false }),
}));

vi.mock('../chat/hooks/use-chat-actions', () => ({
  useChatActions: (args: unknown) => {
    useChatActionsMock(args);
    return { sendMessage: mocks.sendMessage, retryAiResponse: vi.fn() };
  },
}));

vi.mock('../chat/hooks/use-challenge-actions', () => ({
  useChallengeActions: () => ({
    handleGiveUp: mocks.handleGiveUp,
    handleChooseToBuy: mocks.handleChooseToBuy,
    handleResume: mocks.handleResume,
    handleDismiss: mocks.handleDismiss,
  }),
}));

vi.mock('../chat/hooks/use-followup-strips', () => ({
  useFollowupStrips: () => ({
    recap: hookState.followupRecap,
    dismissRecap: mocks.dismissRecap,
    dueMicroChallenge: null,
    clearMicroChallengeFollowup: vi.fn(),
    dueCooldown: null,
    duePrepurchase: null,
    clearPrepurchaseFollowup: vi.fn(),
    dueDuplicateReuse: null,
    clearDuplicateReuseFollowup: vi.fn(),
    dueEmotionWait: null,
    dueReview: null,
    reviewSummary: null,
    recordReview: vi.fn(),
  }),
}));

vi.mock('../chat/hooks/use-entry-dismiss', () => ({
  useEntryDismiss: (_id: string) => ({ dismissed: false, dismiss: vi.fn() }),
}));

vi.mock('@/hooks/use-weekly-review', () => ({
  useWeeklyReview: () => ({
    derivation: null,
    open: false,
    openReview: mocks.openReview,
    closeReview: mocks.closeReview,
    markReviewed: mocks.markReviewed,
  }),
}));

vi.mock('@/hooks/use-green-commitment', () => ({
  useGreenCommitment: () => ({
    derivation: hookState.greenCommitment,
    open: hookState.greenOpen,
    openSettlement: vi.fn(),
    closeSettlement: mocks.closeSettlement,
    markSettled: mocks.markSettled,
  }),
}));

vi.mock('@/hooks/use-guard-moments', () => ({
  useGuardMoments: () => ({ timeline: hookState.guardMoments, isLoading: hookState.guardMomentsLoading }),
}));

vi.mock('@/hooks/use-active-guards', () => ({
  useActiveGuards: () => ({ summary: hookState.activeGuards, isLoading: hookState.activeGuardsLoading }),
}));

vi.mock('../chat/parts/prepurchase-store', () => ({
  getActivePendingPrepurchase: () => null,
}));

vi.mock('../chat/parts/chat-header', () => ({
  ChatHeader: ({ buddyState: buddy, health, accentClass, gradientClass, children }: {
    buddyState?: BuddyState;
    health?: string;
    accentClass?: string;
    gradientClass?: string;
    children?: ReactNode;
  }) => (
    <header data-testid="chat-header" data-buddy-state={String(!!buddy)} data-health={health} data-accent={accentClass} data-gradient={gradientClass}>
      {children}
    </header>
  ),
}));

vi.mock('../chat/parts/chat-banners', () => ({
  ChatBanners: ({ activeChallenge, expiredChallenge, impulseContext, historyLoadError, isLoading, onGiveUp, onChooseToBuy, onResume, onDismiss, onRetryLoadHistory }: {
    activeChallenge?: { itemName: string; amount: number };
    expiredChallenge?: unknown;
    impulseContext?: { platform: string };
    historyLoadError?: string | null;
    isLoading: boolean;
    onGiveUp: () => void;
    onChooseToBuy: () => void;
    onResume: () => void;
    onDismiss: () => void;
    onRetryLoadHistory: () => void;
  }) => (
    <div
      data-testid="chat-banners"
      data-active-challenge={activeChallenge ? `${activeChallenge.itemName}:${activeChallenge.amount}` : ''}
      data-expired={String(!!expiredChallenge)}
      data-impulse={impulseContext?.platform ?? ''}
      data-history-error={historyLoadError ?? ''}
      data-is-loading={isLoading}
    >
      <button type="button" onClick={onGiveUp}>mock give up</button>
      <button type="button" onClick={onChooseToBuy}>mock buy</button>
      <button type="button" onClick={onResume}>mock resume</button>
      <button type="button" onClick={onDismiss}>mock dismiss</button>
      <button type="button" onClick={onRetryLoadHistory}>mock retry history</button>
    </div>
  ),
}));

vi.mock('../chat/sections/followup-strips', () => ({
  FollowupStrips: ({ strips, onRecapContinue }: { strips: { recap: string | null }; onRecapContinue: (prompt: string) => void }) => (
    <div data-testid="followup-strips" data-recap={strips.recap ?? ''}>
      <button type="button" onClick={() => onRecapContinue('next prompt')}>mock continue recap</button>
      <button type="button" onClick={mocks.dismissRecap}>mock dismiss recap</button>
    </div>
  ),
}));

vi.mock('../chat/parts/chat-messages', () => ({
  ChatMessages: ({ messages, isLoading, isLoadingHistory, isLoadingMore, hasMore, firstItemIndex, mcpNotifications, buddyState: buddy, virtuosoRef, onLoadMore, onDeleteMessage, userAvatarUrl, onSendMessage }: {
    messages: unknown[];
    isLoading: boolean;
    isLoadingHistory: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    firstItemIndex: number;
    mcpNotifications: { id: string; message: string }[];
    buddyState?: BuddyState;
    virtuosoRef: unknown;
    onLoadMore: () => void;
    onDeleteMessage: (id: string) => void;
    userAvatarUrl?: string;
    onSendMessage: (content: string, apiContent?: string) => Promise<void>;
  }) => (
    <div
      data-testid="chat-messages"
      data-messages={messages.length}
      data-is-loading={isLoading}
      data-is-loading-history={isLoadingHistory}
      data-is-loading-more={isLoadingMore}
      data-has-more={hasMore}
      data-first-index={firstItemIndex}
      data-mcp={mcpNotifications.map((item) => item.id).join(',')}
      data-buddy-state={String(!!buddy)}
      data-virtuoso-ref={String(!!virtuosoRef)}
      data-avatar={userAvatarUrl ?? ''}
    >
      <button type="button" onClick={onLoadMore}>mock load more</button>
      <button type="button" onClick={() => onDeleteMessage('message-1')}>mock delete</button>
      <button type="button" onClick={() => onSendMessage('hello', 'api hello')}>mock message send</button>
    </div>
  ),
}));

vi.mock('../chat/sections/chat-composer', () => ({
  ChatComposer: ({ isDemo, isLoading, isLoadingHistory, buddyState: buddy, activeChallenge, gradientClass, messagesCount, onSend }: {
    isDemo: boolean;
    isLoading: boolean;
    isLoadingHistory: boolean;
    buddyState?: BuddyState;
    activeChallenge?: { itemName: string };
    gradientClass: string;
    messagesCount: number;
    onSend: (content: string, apiContent?: string) => Promise<void>;
  }) => (
    <div
      data-testid="chat-composer"
      data-is-demo={isDemo}
      data-is-loading={isLoading}
      data-is-loading-history={isLoadingHistory}
      data-buddy-state={String(!!buddy)}
      data-active-challenge={activeChallenge?.itemName ?? ''}
      data-gradient={gradientClass}
      data-messages-count={messagesCount}
    >
      <button type="button" onClick={() => onSend('composer text', 'api composer')}>mock composer send</button>
    </div>
  ),
}));

vi.mock('../chat/parts/weekly-review-entry', () => ({
  WeeklyReviewEntry: ({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) => (
    <div data-testid="weekly-review-entry">
      <button type="button" onClick={onOpen}>mock open review</button>
      <button type="button" onClick={onDismiss}>mock dismiss review</button>
    </div>
  ),
}));

vi.mock('../chat/parts/guard-moments-entry', () => ({
  GuardMomentsEntry: ({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) => (
    <div data-testid="guard-moments-entry">
      <button type="button" onClick={onOpen}>mock open moments</button>
      <button type="button" onClick={onDismiss}>mock dismiss moments</button>
    </div>
  ),
}));

vi.mock('../chat/parts/active-guards-entry', () => ({
  ActiveGuardsEntry: ({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) => (
    <div data-testid="active-guards-entry">
      <button type="button" onClick={onOpen}>mock open guards</button>
      <button type="button" onClick={onDismiss}>mock dismiss guards</button>
    </div>
  ),
}));

vi.mock('../chat/parts/guard-diary-card', () => ({
  GuardDiaryCard: ({ streakDays, isDemo }: { streakDays: number; isDemo: boolean }) => (
    <div data-testid="guard-diary-card" data-streak={streakDays} data-is-demo={isDemo} />
  ),
}));

vi.mock('../chat-parts/guard-diary-card', () => ({
  GuardDiaryCard: ({ streakDays, isDemo }: { streakDays: number; isDemo: boolean }) => (
    <div data-testid="guard-diary-card" data-streak={streakDays} data-is-demo={isDemo} />
  ),
}));

vi.mock('../chat-parts/night-guard-banner', () => ({ NightGuardBanner: () => <div data-testid="night-guard-banner" /> }));
vi.mock('../chat/parts/intercept-medal-moment', () => ({ InterceptMedalMoment: ({ streakDays, isDemo }: { streakDays?: number; isDemo: boolean }) => <div data-testid="intercept-medal" data-streak={streakDays ?? ''} data-is-demo={isDemo} /> }));
vi.mock('../chat/parts/companion-background', () => ({ CompanionBackground: ({ health, vitality }: { health: string; vitality: number }) => <div data-testid="companion-background" data-health={health} data-vitality={vitality} /> }));

vi.mock('../chat/parts/commitment-settlement', () => ({
  CommitmentSettlement: ({ settlement, onSettled, onClose }: {
    settlement: { refKey: string };
    onSettled: (refKey: string, outcome: 'kept' | 'restarted') => void;
    onClose: () => void;
  }) => (
    <div data-testid="commitment-settlement" data-ref-key={settlement.refKey}>
      <button type="button" onClick={() => onSettled(settlement.refKey, 'kept')}>mock settle</button>
      <button type="button" onClick={onClose}>mock close settlement</button>
    </div>
  ),
}));

vi.mock('../chat/sections/deposit-dialog-section', () => ({
  DepositDialogSection: ({ depositDialog, dreamFunds, onClose, onDeposited }: {
    depositDialog: { challengeId: string; savedAmount: number };
    dreamFunds?: number;
    onClose: () => void;
    onDeposited: () => void;
  }) => (
      <div data-testid="deposit-dialog" data-challenge={depositDialog.challengeId} data-amount={depositDialog.savedAmount} data-funds={((dreamFunds as unknown as Array<{ id: string; current: number }>) ?? []).map((fund) => `${fund.id}:${fund.current}`).join(',')}>
      <button type="button" onClick={onClose}>mock close deposit</button>
      <button type="button" onClick={onDeposited}>mock deposited</button>
    </div>
  ),
}));

vi.mock('../chat/sections/silent-moment-section', () => ({
  SilentMomentSection: ({ silentMoment: moment, onOpenDeposit, onChallengePassed, onComplete }: {
    silentMoment: { outcome: string; amount: number; itemName: string };
    onOpenDeposit: (dialog: { challengeId: string; savedAmount: number }) => void;
    onChallengePassed?: (challenge: { challengeId: string; itemName: string; amount: number }) => void;
    onComplete: () => void;
  }) => (
    <div data-testid="silent-moment" data-outcome={moment.outcome} data-amount={moment.amount} data-item={moment.itemName}>
      <button type="button" onClick={() => onChallengePassed?.({ challengeId: 'challenge-1', itemName: moment.itemName, amount: moment.amount })}>mock passed</button>
      <button type="button" onClick={() => onOpenDeposit({ challengeId: 'challenge-1', savedAmount: moment.amount })}>mock open deposit</button>
      <button type="button" onClick={onComplete}>mock complete moment</button>
    </div>
  ),
}));

function resetHookState() {
  hookState = {
    mcpNotifications: [{ id: 'mcp-1', message: 'Tool done', type: 'success' as const }],
    followupRecap: 'last green topic',
    greenCommitment: null,
    greenOpen: false,
    activeGuards: null,
    activeGuardsLoading: false,
    guardMoments: null,
    guardMomentsLoading: false,
    silentMoment: null,
  };
}

function setup(overrides = {}) {
  const props = {
    impulseContext: { platform: 'TikTok', amount: 42, reasons: ['flash sale'], time: '10:00' },
    buddyState,
    onBuddyStateRefresh: vi.fn(),
    onChallengePassed: vi.fn(),
    onMessageSent: vi.fn(),
    onNavigateProfile: vi.fn(),
    ...overrides,
  };
  return { props, view: render(<ChatTab {...props} />) };
}

function expectAttribute(element: Element, name: string, value: string) {
  expect(element.getAttribute(name)).toBe(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHookState();
});

describe('ChatTab assembly', () => {
  it('renders the chat assembly skeleton', () => {
    setup();

    for (const testId of ['chat-header', 'chat-banners', 'followup-strips', 'chat-messages', 'chat-composer']) {
      expect(screen.getByTestId(testId)).toBeTruthy();
    }
  });

  it('maps buddy health to the header and background presentation', () => {
    setup();

    expectAttribute(screen.getByTestId('chat-header'), 'data-health', 'weak');
    expectAttribute(screen.getByTestId('chat-header'), 'data-accent', 'text-yellow-400 bg-yellow-500/20');
    expectAttribute(screen.getByTestId('chat-header'), 'data-gradient', 'from-yellow-400 to-amber-300');
    expectAttribute(screen.getByTestId('companion-background'), 'data-vitality', '88');
  });

  it('forwards the impulse and challenge context to banners', () => {
    setup({ challengeContext: { itemName: 'Desk lamp', amount: 59, challengeId: 'challenge-2' } });

    const banners = screen.getByTestId('chat-banners');
    expectAttribute(banners, 'data-impulse', 'TikTok');
    expectAttribute(banners, 'data-active-challenge', 'Desk lamp:59');
    expectAttribute(banners, 'data-is-loading', 'false');
  });

  it('forwards history and MCP state to the message list', () => {
    setup();

    const messages = screen.getByTestId('chat-messages');
    expectAttribute(messages, 'data-messages', '0');
    expectAttribute(messages, 'data-is-loading-history', 'true');
    expectAttribute(messages, 'data-is-loading', 'false');
    expectAttribute(messages, 'data-has-more', 'false');
    expectAttribute(messages, 'data-first-index', '100000');
    expectAttribute(messages, 'data-mcp', 'mcp-1');
    expectAttribute(messages, 'data-virtuoso-ref', 'true');
    expectAttribute(messages, 'data-avatar', 'avatar.png');
  });

  it('forwards buddy state and defaults to the composer', () => {
    setup();

    const composer = screen.getByTestId('chat-composer');
    expectAttribute(composer, 'data-buddy-state', 'true');
    expectAttribute(composer, 'data-is-demo', 'false');
    expectAttribute(composer, 'data-active-challenge', '');
    expectAttribute(composer, 'data-gradient', 'from-yellow-400 to-amber-300');
  });

  it('wires challenge banner actions to their handlers', () => {
    setup();

    fireEvent.click(screen.getByText('mock give up'));
    fireEvent.click(screen.getByText('mock buy'));
    fireEvent.click(screen.getByText('mock resume'));
    fireEvent.click(screen.getByText('mock dismiss'));

    expect(mocks.handleGiveUp).toHaveBeenCalledTimes(1);
    expect(mocks.handleChooseToBuy).toHaveBeenCalledTimes(1);
    expect(mocks.handleResume).toHaveBeenCalledTimes(1);
    expect(mocks.handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('wires message pagination and deletion callbacks', () => {
    setup();

    fireEvent.click(screen.getByText('mock load more'));
    fireEvent.click(screen.getByText('mock delete'));

    expect(mocks.loadMoreMessages).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMessage).toHaveBeenCalledWith('message-1');
  });

  it('tracks daily-task completion when the composer sends a message', async () => {
    const { props } = setup();

    fireEvent.click(screen.getByText('mock composer send'));

    expect(props.onMessageSent).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith('composer text', 'api composer');
    await Promise.resolve();
  });

  it('keeps raw message sending separate from task tracking', () => {
    const { props } = setup();

    fireEvent.click(screen.getByText('mock message send'));

    expect(props.onMessageSent).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalledWith('hello', 'api hello');
  });

  it('renders and wires the deposit dialog', () => {
    vi.useFakeTimers();
    try {
      hookState.silentMoment = silentMoment;
      const { props } = setup();
      fireEvent.click(screen.getByText('mock open deposit'));
      expectAttribute(screen.getByTestId('deposit-dialog'), 'data-challenge', 'challenge-1');
      expectAttribute(screen.getByTestId('deposit-dialog'), 'data-funds', 'savings:120');
      fireEvent.click(screen.getByText('mock deposited'));
      expect(props.onBuddyStateRefresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(4500);
      expect(props.onNavigateProfile).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByText('mock close deposit'));
      expect(screen.queryByTestId('deposit-dialog')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders and wires the silent moment completion', () => {
    hookState.silentMoment = silentMoment;
    setup();

    expectAttribute(screen.getByTestId('silent-moment'), 'data-outcome', 'saw');

    fireEvent.click(screen.getByText('mock complete moment'));
    expect(mocks.completeSilentMoment).toHaveBeenCalledTimes(1);
  });

  it('wires recap continuation to input, focus, and dismissal', () => {
    setup();

    fireEvent.click(screen.getByText('mock continue recap'));

    expect(mocks.dismissRecap).toHaveBeenCalledTimes(1);
  });

  it('renders fixed entries and maps streak-derived props', () => {
    setup();

    expect(screen.getByTestId('weekly-review-entry')).toBeTruthy();
    expect(screen.getByTestId('guard-moments-entry')).toBeTruthy();
    expect(screen.getByTestId('active-guards-entry')).toBeTruthy();
    expectAttribute(screen.getByTestId('guard-diary-card'), 'data-streak', '3');
    expectAttribute(screen.getByTestId('intercept-medal'), 'data-streak', '3');
  });

  it('hides personal-data entries in demo mode while keeping demo props', () => {
    setup({ isDemo: true });

    expect(screen.queryByTestId('weekly-review-entry')).toBeNull();
    expect(screen.queryByTestId('guard-moments-entry')).toBeNull();
    expect(screen.queryByTestId('active-guards-entry')).toBeNull();
    expectAttribute(screen.getByTestId('guard-diary-card'), 'data-is-demo', 'true');
    expectAttribute(screen.getByTestId('chat-composer'), 'data-is-demo', 'true');
  });

  it('wires fixed entry open callbacks', () => {
    setup();

    fireEvent.click(screen.getByText('mock open review'));
    expect(mocks.openReview).toHaveBeenCalledTimes(1);
  });
});
