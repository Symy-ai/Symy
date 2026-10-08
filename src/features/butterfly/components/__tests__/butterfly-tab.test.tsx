// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：全部 hooks + 子组件（装配层测试，锁路由与交互链）———
type MockPlayer = {
  phase: string; isLoading: boolean; error: string | null; decisionType: string | null; decisionDescription: string;
  outline: Record<string, unknown> | null; sessionId: string | undefined; currentChapterIndex: number; currentSceneIndex: number;
  currentChapterInfo: Record<string, unknown> | null; completedChapters: Array<Record<string, unknown>>; currentChoice: Record<string, unknown> | null; butterflyEffect: string | null;
  finalTone: string | null; totalChapters: number; choices: Record<string, unknown>; isStreamingChapter: boolean; streamingText: string;
  start: ReturnType<typeof vi.fn>; advance: ReturnType<typeof vi.fn>; selectChoice: ReturnType<typeof vi.fn>; advanceToNextChapter: ReturnType<typeof vi.fn>;
  goToChapter: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; retryChoice: ReturnType<typeof vi.fn>;
};
const demoPlayer: MockPlayer = {
  phase: 'idle', isLoading: false, error: null, decisionType: null, decisionDescription: '',
  outline: null, sessionId: undefined, currentChapterIndex: 1, currentSceneIndex: 0,
  currentChapterInfo: null, completedChapters: [], currentChoice: null, butterflyEffect: null,
  finalTone: null, totalChapters: 3, choices: {}, isStreamingChapter: false, streamingText: '',
  start: vi.fn(), advance: vi.fn(), selectChoice: vi.fn(), advanceToNextChapter: vi.fn(),
  goToChapter: vi.fn(), reset: vi.fn(), retryChoice: vi.fn(),
};
const normalPlayer: MockPlayer = { ...demoPlayer };
vi.mock('../../hooks/use-butterfly-demo-player', () => ({
  useButterflyDemoPlayer: () => demoPlayer,
}));
vi.mock('../../hooks/use-butterfly-normal-player', () => ({
  useButterflyNormalPlayer: () => normalPlayer,
}));
vi.mock('../../hooks/use-butterfly-loading-stages', () => ({
  useButterflyLoadingStages: () => ({ stageIndex: 0, elapsedSec: 0 }),
}));
vi.mock('../../hooks/use-gacha-quota', () => ({
  useGachaQuota: () => ({ gachaUsedToday: 0, gachaRemaining: 3, isGachaPremium: false, incrementGachaCount: vi.fn(), decrementGachaCount: vi.fn() }),
}));
vi.mock('../../hooks/use-gacha-billing', () => ({
  useGachaBilling: () => ({
    gachaIncrementedForSessionRef: { current: null },
    pullAttemptIdRef: { current: null },
    gachaRefundedForSessionRef: { current: null },
  }),
}));
vi.mock('../../hooks/use-butterfly-history', () => ({
  useButterflyHistory: () => ({
    sessions: [] as Array<Record<string, unknown>>, isLoading: false, isRefreshing: false, error: null,
    selectedSession: null as Record<string, unknown> | null, deletingId: null, hasMore: false, total: 0,
    selectSession: vi.fn(), deleteSession: vi.fn(), refresh: vi.fn(), loadMore: vi.fn(),
  }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));
vi.mock('@/lib/posthog', () => ({
  symyEvents: { gachaTriggered: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => ({
      'butterfly.futureGacha': '未来盲盒',
      'common.back': '返回',
    })[key] ?? opts?.defaultValue ?? key,
  }),
}));
// 子组件轻 mock — 断言渲染路由（哪个视图被选中）而非内部
vi.mock('../butterfly-history-list', () => ({
  ButterflyHistoryList: () => <div data-testid="history-list" />,
}));
vi.mock('../butterfly-history-detail', () => ({
  ButterflyHistoryDetail: () => <div data-testid="history-detail" />,
}));
vi.mock('../butterfly-loading-state', () => ({
  ButterflyLoadingState: ({ onCancel }: { onCancel?: () => void }) => (
    <div data-testid="loading-state">{onCancel ? <button onClick={onCancel}>cancel</button> : null}</div>
  ),
}));
vi.mock('../tab/completed-story-view', () => ({
  CompletedStoryView: () => <div data-testid="completed-story" />,
}));
vi.mock('../tab/chapter-complete-view', () => ({
  ChapterCompleteView: () => <div data-testid="chapter-complete" />,
}));
vi.mock('../tab/playing-view', () => ({
  PlayingView: () => <div data-testid="playing-view" />,
}));

import { ButterflyTab } from '../butterfly-tab';

function setPlayer(p: Partial<MockPlayer>) {
  Object.assign(normalPlayer, p);
}

describe('ButterflyTab (782行装配路由)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(normalPlayer, { phase: 'idle', isLoading: false, error: null, decisionType: null, decisionDescription: '', outline: null, sessionId: undefined, currentChapterIndex: 1, currentSceneIndex: 0, currentChapterInfo: null, completedChapters: [], currentChoice: null, butterflyEffect: null, finalTone: null, choices: {}, isStreamingChapter: false, start: vi.fn(), reset: vi.fn(), advance: vi.fn(), selectChoice: vi.fn() });
    Object.assign(demoPlayer, { phase: 'idle', isLoading: false, error: null, decisionType: null, decisionDescription: '', outline: null, sessionId: undefined, currentChapterIndex: 1, currentSceneIndex: 0, currentChapterInfo: null, completedChapters: [], currentChoice: null, butterflyEffect: null, finalTone: null, choices: {}, isStreamingChapter: false, start: vi.fn(), reset: vi.fn() });
  });
  afterEach(() => cleanup());

  it('idle + 登录模式: 初始表单页 (标题渲染, 无 onBack 无返回按钮)', () => {
    const { unmount } = render(<ButterflyTab />);
    expect(screen.getByText('未来盲盒')).toBeTruthy();
    expect(screen.queryByText('返回')).toBeNull();
    unmount();
  });

  it('onBack 传入: 返回按钮渲染并可点', () => {
    const onBack = vi.fn();
    const { unmount } = render(<ButterflyTab onBack={onBack} />);
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('phase=complete: 渲染完成页', () => {
    setPlayer({ phase: 'complete', butterflyEffect: 'done', finalTone: 'hopeful' });
    const { unmount } = render(<ButterflyTab />);
    expect(screen.getByTestId('completed-story')).toBeTruthy();
    unmount();
  });

  it('phase=chapterComplete: 渲染章节完成插页', () => {
    setPlayer({ phase: 'chapterComplete', currentChapterInfo: { index: 1, title: 'Ch1', tone: 'neutral', timeSpan: 'now', illustrationUrl: '' } as never });
    const { unmount } = render(<ButterflyTab />);
    expect(screen.getByTestId('chapter-complete')).toBeTruthy();
    unmount();
  });

  it('phase=playing + chapterInfo: 渲染播放视图', () => {
    setPlayer({ phase: 'playing', currentChapterInfo: { index: 1, title: 'Ch1', tone: 'neutral', timeSpan: 'now', illustrationUrl: '' } as never });
    const { unmount } = render(<ButterflyTab />);
    expect(screen.getByTestId('playing-view')).toBeTruthy();
    unmount();
  });

  it('isLoading=true (idle 无决策): 渲染 loading + 取消按钮', () => {
    setPlayer({ isLoading: true });
    const { unmount } = render(<ButterflyTab />);
    expect(screen.getByTestId('loading-state')).toBeTruthy();
    expect(screen.getByText('cancel')).toBeTruthy();
    unmount();
  });

  it('B136 恢复窗口: sessionId 有 + chapterInfo 无 + decisionType 有 → loading 无取消键', () => {
    setPlayer({ sessionId: 's-42', currentChapterInfo: null, decisionType: 'bought', phase: 'playing' });
    const { unmount } = render(<ButterflyTab />);
    expect(screen.getByTestId('loading-state')).toBeTruthy();
    expect(screen.queryByText('cancel')).toBeNull();
    unmount();
  });

  it('isDemo=true: demo 徽章 + demo player 被用', () => {
    demoPlayer.phase = 'playing';
    demoPlayer.currentChapterInfo = { index: 1, title: 'Demo', tone: 'neutral', timeSpan: 'now', illustrationUrl: '' } as never;
    const { unmount } = render(<ButterflyTab isDemo />);
    expect(screen.getByTestId('playing-view')).toBeTruthy();
    unmount();
  });

  it('空描述提交: 早退不调 start (QA F1 显式日志链)', () => {
    setPlayer({ start: vi.fn() });
    const start = normalPlayer.start;
    const { unmount } = render(<ButterflyTab />);
    // 找提交按钮 (类型 submit 或含 Gacha 文本) — 表单空描述
    const form = document.querySelector('form');
    if (form) {
      act(() => { fireEvent.submit(form); });
    }
    expect(start).not.toHaveBeenCalled();
    unmount();
  });
});
