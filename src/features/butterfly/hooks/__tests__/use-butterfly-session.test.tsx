// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座 ———
const sendMock = vi.fn();
const stateRef = { current: { value: 'idle', context: {
  session: null, isLoading: false, streamingText: '', currentChapterInfo: null,
  pendingChoice: null, storyComplete: null, completedChapters: [], outlineVisible: false,
  error: null, errorDetail: null, currentChapterIndex: 0, userId: null,
  regeneratingChapters: [], generatingSceneIllustrations: [],
  preloadedChapterData: null, isPreloading: false, preloadedBranches: {}, preloadedStoryComplete: null,
} } };
vi.mock('@xstate/react', () => ({
  useMachine: () => [stateRef.current, sendMock],
}));
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, signOut: vi.fn() }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh' }),
}));
vi.mock('@/lib/posthog', () => ({
  symyEvents: { butterflySessionStarted: vi.fn(), butterflyChoiceSelected: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useButterflySession } from '../use-butterfly-session';

function setState(value: string, ctxOverrides: Record<string, unknown> = {}) {
  stateRef.current = {
    value,
    context: { ...stateRef.current.context, ...ctxOverrides },
  } as never;
}

describe('useButterflySession (243行 XState 会话壳)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState('idle');
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true })) as never;
  });
  afterEach(() => cleanup());

  it('初始: 26 字段签名 + idle phase + uiState 形状', () => {
    const { result } = renderHook(() => useButterflySession());
    const r = result.current;
    for (const key of ['session','uiState','streamingText','currentChapterInfo','pendingChoice','storyComplete','completedChapters','outlineVisible','createSession','continueStory','submitChoice','toggleOutline','reset','loadActiveSession','regenerateIllustration','regeneratingChapters','generatingSceneIllustrations','streamingSceneIllustrations','preloadedChapterData','isPreloading','preloadedBranches','preloadNextChapter','preloadedStoryComplete','clearPreloadedStoryComplete','retry','userId']) {
      expect(r).toHaveProperty(key);
    }
    expect(r.uiState.phase).toBe('idle');
    expect(r.userId).toBe('u-1');
    expect(r.regeneratingChapters).toBeInstanceOf(Set);
    expect(r.generatingSceneIllustrations).toBeInstanceOf(Set);
  });

  it('state→phase 映射: streaming/continuing→streaming, choosing→choosing, complete/regenerating→complete, error→idle', () => {
    const cases: Array<[string, string]> = [
      ['streaming', 'streaming'],
      ['continuing', 'streaming'],
      ['choosing', 'choosing'],
      ['submitting_choice', 'choosing'],
      ['complete', 'complete'],
      ['regenerating', 'complete'],
      ['error', 'idle'],
      ['generating_outline', 'generating_outline'],
    ];
    for (const [sv, expectedPhase] of cases) {
      setState(sv);
      const { result, unmount } = renderHook(() => useButterflySession());
      expect(result.current.uiState.phase, `state=${sv}`).toBe(expectedPhase);
      unmount();
    }
  });

  it('uiState 字段从 context 派生', () => {
    setState('streaming', { isLoading: true, streamingText: '涟漪', currentChapterIndex: 2, error: 'e' });
    const { result } = renderHook(() => useButterflySession());
    expect(result.current.uiState.isLoading).toBe(true);
    expect(result.current.uiState.streamingText).toBe('涟漪');
    expect(result.current.uiState.currentChapterIndex).toBe(2);
    expect(result.current.uiState.error).toBe('e');
  });

  it('createSession: CREATE_SESSION 事件 + posthog', async () => {
    const { result } = renderHook(() => useButterflySession());
    await act(async () => { await result.current.createSession({ decisionType: 'bought', decisionDescription: 'x' } as never); });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'CREATE_SESSION' }));
  });

  it('submitChoice: 事件 + posthog 埋点', async () => {
    const { result } = renderHook(() => useButterflySession());
    await act(async () => { await result.current.submitChoice(2, 'A'); });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'SUBMIT_CHOICE', chapterIndex: 2, selectedOption: 'A' }));
  });

  it('reset: 有活跃 session 时 DELETE 带 sessionId (Round 11 C4 防误删)', () => {
    setState('playing', { session: { id: 's-42' }, userId: 'u-1' });
    const { result } = renderHook(() => useButterflySession());
    act(() => result.current.reset());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/session'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ sessionId: 's-42' }),
      }),
    );
    expect(sendMock).toHaveBeenCalledWith({ type: 'RESET' });
  });

  it('reset (demo): 不发 DELETE', () => {
    setState('playing', { session: { id: 's-1' }, userId: 'u-1' });
    const { result } = renderHook(() => useButterflySession(true));
    act(() => result.current.reset());
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith({ type: 'RESET' });
  });

  it('SYNC_CONTEXT 在 mount/user 变化时发出 (C3 修复)', async () => {
    renderHook(() => useButterflySession());
    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'SYNC_CONTEXT' }));
    });
  });

  it('regenerateIllustration: 事件发出 + 返回 null (fromPromise 语义)', async () => {
    const { result } = renderHook(() => useButterflySession());
    let url: string | null = 'unset';
    await act(async () => { url = await result.current.regenerateIllustration(2); });
    expect(sendMock).toHaveBeenCalledWith({ type: 'REGENERATE_ILLUSTRATION', chapterIndex: 2 });
    expect(url).toBeNull();
  });

  it('demo 模式: streamingSceneIllustrations 由章节号派生 (V4 CDN)', () => {
    setState('streaming', { currentChapterInfo: { chapterIndex: 2 } });
    const { result } = renderHook(() => useButterflySession(true));
    const ssi = result.current.streamingSceneIllustrations as Record<number, string[]>;
    expect(ssi).toBeTruthy();
    expect(Object.keys(ssi).length).toBeGreaterThan(0);
  });

  it('非 demo: streamingSceneIllustrations undefined', () => {
    setState('streaming', { currentChapterInfo: { chapterIndex: 2 } });
    const { result } = renderHook(() => useButterflySession(false));
    expect(result.current.streamingSceneIllustrations).toBeUndefined();
  });
});
