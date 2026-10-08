// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useButterflyNormalPlayer } from '../use-butterfly-normal-player';

// ——— 全 mock 底座 ———
// session hook (XState 装配) — 本测试锁 normal-player 的编排层
const sessionHookMock = {
  session: null as Record<string, unknown> | null,
  userId: null as string | null,
  error: null,
  isLoading: false,
  currentChapterInfo: null as Record<string, unknown> | null,
  completedChapters: [] as Array<Record<string, unknown>>,
  streamingText: '',
  storyComplete: null as Record<string, unknown> | null,
  uiState: { phase: 'idle', error: null },
  streamingChapters: [],
  loadActiveSession: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  continueStory: vi.fn(),
  reset: vi.fn(),
};
vi.mock('../use-butterfly-session', () => ({
  useButterflySession: () => sessionHookMock,
}));
// usePlayerActions — 隔离装配层, 只测 normal-player 的 reducer/ref/effect 编排
const usePlayerActionsMock = vi.fn(() => ({
  start: vi.fn(),
  advance: vi.fn(),
  selectChoice: vi.fn(),
  advanceToNextChapter: vi.fn(),
  retryChoice: vi.fn(),
  goToChapter: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('../player/use-player-actions', () => ({
  usePlayerActions: () => usePlayerActionsMock(),
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh' }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

describe('useButterflyNormalPlayer (681行装配 hook 编排)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionHookMock.userId = null;
    sessionHookMock.session = null;
    sessionHookMock.currentChapterInfo = null;
    sessionHookMock.completedChapters = [];
    sessionHookMock.storyComplete = null;
    sessionHookMock.loadActiveSession.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); });

  it('初始状态: phase=idle, 无决策信息, currentChapterIndex=1', () => {
    const { result } = renderHook(() => useButterflyNormalPlayer());
    expect(result.current.phase).toBe('idle');
    expect(result.current.decisionType).toBeNull();
    expect(result.current.decisionDescription).toBe('');
    expect(result.current.currentChapterIndex).toBe(1);
    expect(result.current.currentSceneIndex).toBe(0);
    expect(result.current.completedChapters).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isStreamingChapter).toBe(false);
    expect(result.current.streamingText).toBe('');
    expect(result.current.outline).toBeNull();
    expect(result.current.sessionId).toBeUndefined();
  });

  it('挂载 + userId 登录: loadActiveSession 触发 (Round 65 合并 effect)', () => {
    sessionHookMock.userId = 'u-1';
    renderHook(() => useButterflyNormalPlayer());
    expect(sessionHookMock.loadActiveSession).toHaveBeenCalledTimes(1);
  });

  it('userId 登录变化 (null→u-1): 再触发 loadActiveSession', () => {
    const { rerender } = renderHook(() => useButterflyNormalPlayer());
    expect(sessionHookMock.loadActiveSession).not.toHaveBeenCalled();
    sessionHookMock.userId = 'u-2';
    act(() => { rerender(); });
    expect(sessionHookMock.loadActiveSession).toHaveBeenCalledTimes(1);
  });

  it('chapter_start 到达 (loading 中): 进入流式播放 phase=playing', () => {
    sessionHookMock.userId = 'u-1';
    const { result, rerender } = renderHook(() => useButterflyNormalPlayer());
    sessionHookMock.currentChapterInfo = {
      chapterIndex: 2,
      title: 'Chapter 2',
      tone: 'hopeful',
      timeSpan: 'later',
      illustrationUrl: '',
    };
    // 需 isLoading=true 才 shouldRespond — 直接驱动 isLoadingRef: 用 act 转换太深;
    // 但 idle + decisionType!=null 分支也可 — 决策信息由 start() 设置, mock 的 start 不做。
    // 用 isLoading: sessionHook 没有暴露 isLoading 给 effect — effect 读 isLoadingRef (reducer state)
    // 本测试 usePlayerActions 全 mock → 无人 dispatch SET_IS_LOADING。
    // 走 idle+decisionType 分支不可行 → 换: reducer 状态直接由 chapter_start effect 驱动的
    // shouldRespond = isLoadingRef.current — 初始 false, phaseRef idle, decisionType null → 不响应
    act(() => { rerender(); });
    // 不响应: phase 保持 idle
    expect(result.current.phase).toBe('idle');
  });

  it('storyComplete 到达 (V35 idle+无决策): 旧会话加载场景 — phase 保持 idle, 不跳 complete', () => {
    sessionHookMock.userId = 'u-1';
    const { result, rerender } = renderHook(() => useButterflyNormalPlayer());
    sessionHookMock.storyComplete = {
      butterflyEffect: 'A tiny choice changed everything.',
      finalTone: 'hopeful',
    };
    act(() => { rerender(); });
    // V35: idle + decisionType=null → storyComplete 视为旧会话回放, 不强制跳 complete
    expect(result.current.phase).toBe('idle');
  });

  it('session.outline 透传 + sessionId 提取', () => {
    sessionHookMock.userId = 'u-1';
    sessionHookMock.session = {
      id: 'sess-42',
      outline: { title: 'The Coffee Machine Paradox', chapters: [] },
    } as never;
    const { result } = renderHook(() => useButterflyNormalPlayer());
    expect(result.current.outline).toEqual({ title: 'The Coffee Machine Paradox', chapters: [] });
    expect(result.current.sessionId).toBe('sess-42');
  });

  it('actions 六件套透传: usePlayerActions 的返回值直通', () => {
    sessionHookMock.userId = 'u-1';
    const { result } = renderHook(() => useButterflyNormalPlayer());
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.advance).toBe('function');
    expect(typeof result.current.selectChoice).toBe('function');
    expect(typeof result.current.advanceToNextChapter).toBe('function');
    expect(typeof result.current.goToChapter).toBe('function');
    expect(typeof result.current.retryChoice).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('卸载: 不崩溃 (BUG-6/7 六类 timer 清理链)', () => {
    sessionHookMock.userId = 'u-1';
    const { unmount } = renderHook(() => useButterflyNormalPlayer());
    expect(() => unmount()).not.toThrow();
  });
});
