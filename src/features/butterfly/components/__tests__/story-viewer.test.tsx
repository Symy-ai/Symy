// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：子组件轻 mock (锁 StoryViewer 编排层) ———
const fullScreenImageMock = vi.fn((_props: Record<string, unknown>) => <div data-testid="fs-image" />);
vi.mock('../story-viewer/full-screen-image', () => ({
  FullScreenImage: (props: Record<string, unknown>) => fullScreenImageMock(props),
}));
const dialogueBoxMock = vi.fn((_props: Record<string, unknown>) => <div data-testid="dialogue-box" />);
vi.mock('../story-viewer/dialogue-box', () => ({
  DialogueBox: (props: Record<string, unknown>) => dialogueBoxMock(props),
}));
const chapterTransitionMock = vi.fn((_props: Record<string, unknown>) => <div data-testid="chapter-transition" />);
vi.mock('../story-viewer/chapter-transition', () => ({
  ChapterTransition: (props: Record<string, unknown>) => chapterTransitionMock(props),
}));
vi.mock('../story-viewer/atmosphere-particles', () => ({
  AtmosphereParticles: () => <div data-testid="particles" />,
}));
// splitScenes 真实现透传 (V3 核心分割逻辑要测)
vi.mock('../story-viewer/helpers', (importOriginal) => importOriginal());

import { StoryViewer } from '../story-viewer';

function chapter(index: number, content: string, overrides: Record<string, unknown> = {}) {
  return {
    index, title: `Ch${index}`, content, tone: 'neutral' as const, timeSpan: 'now',
    hasChoice: false, createdAt: '', ...overrides,
  };
}

function viewProps(overrides: Record<string, unknown> = {}) {
  return {
    chapters: [],
    streamingText: '',
    currentChapterInfo: null,
    isStreaming: false,
    ...overrides,
  };
}

describe('StoryViewer (402行 Galgame 播放视图)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fullScreenImageMock.mockImplementation((_p: Record<string, unknown>) => <div data-testid="fs-image" />);
    dialogueBoxMock.mockImplementation((_p: Record<string, unknown>) => <div data-testid="dialogue-box" />);
    chapterTransitionMock.mockImplementation((_p: Record<string, unknown>) => <div data-testid="chapter-transition" />);
  });
  afterEach(() => cleanup());

  it('已完成章节: DialogueBox 收到首场景文本 + 场景数', () => {
    const ch1 = chapter(1, 'Scene one text. ||| Scene two text.');
    const { unmount } = render(<StoryViewer {...viewProps({ chapters: [ch1] })} />);
    expect(screen.getByTestId('dialogue-box')).toBeTruthy();
    const props = dialogueBoxMock.mock.calls[0][0] as Record<string, unknown>;
    expect(props.sceneText).toBe('Scene one text.');
    expect(props.totalScenes).toBe(2);
    expect(props.isLastScene).toBe(false); // 场景1/2 且只有1章 → 非最后
    unmount();
  });

  it('流式阶段: userIsViewingStream 自动开 + 章节过渡弹出 + streamingText 场景化', () => {
    const info = { chapterIndex: 2, title: 'Ch2', tone: 'twist' as const, timeSpan: '+1d' };
    const { rerender, unmount } = render(<StoryViewer {...viewProps({ chapters: [chapter(1, 'done.')] })} />);
    rerender(<StoryViewer {...viewProps({
      chapters: [chapter(1, 'done.')],
      isStreaming: true,
      currentChapterInfo: info,
      streamingText: 'New chapter first scene. ||| second',
    })} />);
    // 章节过渡弹出
    expect(screen.getByTestId('chapter-transition')).toBeTruthy();
    const tProps = chapterTransitionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(tProps.title).toBe('Ch2');
    expect(tProps.tone).toBe('twist');
    // 关掉章节过渡后 DialogueBox 才渲染 (条件里排除 transition 期间)
    const onComplete = (chapterTransitionMock.mock.calls[0][0] as { onComplete: () => void }).onComplete;
    act(() => onComplete());
    const dProps = dialogueBoxMock.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(dProps.isLiveStreaming).toBe(true);
    // V3 自动跟流: 显示最新场景 (streamingSceneIdx = length-1), 非首场景
    expect(dProps.sceneText).toBe('second');
    unmount();
  });

  it('流式阶段流空: "Weaving your story..." 占位', () => {
    const { unmount } = render(<StoryViewer {...viewProps({
      chapters: [chapter(1, 'done.')],
      isStreaming: true,
      currentChapterInfo: { chapterIndex: 2, title: 'Ch2', tone: 'neutral' as const, timeSpan: '+1d' },
      streamingText: '',
    })} />);
    // 首渲染弹章节过渡 (遮住占位) — 手动完成过渡后占位才可见
    const onComplete = (chapterTransitionMock.mock.calls[0][0] as { onComplete: () => void }).onComplete;
    act(() => onComplete());
    expect(screen.getByText('Weaving your story...')).toBeTruthy();
    unmount();
  });

  it('场景推进: onAdvance 场景1→2 (350ms 过渡)', () => {
    vi.useFakeTimers();
    try {
      const ch1 = chapter(1, 'One. ||| Two. ||| Three.');
      const { unmount } = render(<StoryViewer {...viewProps({ chapters: [ch1] })} />);
      const advance = (dialogueBoxMock.mock.calls[0][0] as { onAdvance: () => void }).onAdvance;
      act(() => advance());
      act(() => vi.advanceTimersByTime(400));
      const props2 = dialogueBoxMock.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(props2.sceneText).toBe('Two.');
      expect(props2.sceneIndex).toBe(1);
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('场景插图轮播: sceneIllustrations 数组 + 3s 间隔切换', () => {
    vi.useFakeTimers();
    try {
      const ch1 = chapter(1, 'Only scene.', { sceneIllustrations: { 0: ['img-a', 'img-b'] } });
      const { unmount } = render(<StoryViewer {...viewProps({ chapters: [ch1] })} />);
      let imgProps = fullScreenImageMock.mock.calls[0][0] as { illustrationUrl?: string };
      expect(imgProps.illustrationUrl).toBe('img-a');
      act(() => vi.advanceTimersByTime(3100));
      imgProps = fullScreenImageMock.mock.calls.at(-1)![0] as { illustrationUrl?: string };
      expect(imgProps.illustrationUrl).toBe('img-b'); // 轮播到第二张
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('流式场景插图优先于章节封面 (V4)', () => {
    const { unmount } = render(<StoryViewer {...viewProps({
      chapters: [chapter(1, 'done.')],
      isStreaming: true,
      currentChapterInfo: { chapterIndex: 2, title: 'Ch2', tone: 'neutral' as const, timeSpan: '+1d', illustrationUrl: 'cover.png' },
      streamingText: 'live text',
      streamingSceneIllustrations: { 0: ['scene-0.png'] },
    })} />);
    const imgProps = fullScreenImageMock.mock.calls.at(-1)![0] as { illustrationUrl?: string };
    expect(imgProps.illustrationUrl).toBe('scene-0.png');
    unmount();
  });

  it('无场景插图: fallback 章节封面 illustrationUrl', () => {
    const ch1 = chapter(1, 'Only scene.', { illustrationUrl: 'chapter-cover.png' });
    const { unmount } = render(<StoryViewer {...viewProps({ chapters: [ch1] })} />);
    const imgProps = fullScreenImageMock.mock.calls[0][0] as { illustrationUrl?: string };
    expect(imgProps.illustrationUrl).toBe('chapter-cover.png');
    unmount();
  });

  it('Skip to latest: 非最新时显示, 点击跳到末章末场景', () => {
    const chs = [chapter(1, 'A.'), chapter(2, 'B. ||| C.')];
    const { unmount } = render(<StoryViewer {...viewProps({ chapters: chs })} />);
    const btn = screen.getByText('Skip to latest');
    fireEvent.click(btn);
    const props = dialogueBoxMock.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(props.sceneText).toBe('C.'); // 末章末场景
    unmount();
  });

  it('已在最新: Skip 按钮不显示', () => {
    const { unmount } = render(<StoryViewer {...viewProps({ chapters: [chapter(1, 'A.')] })} />);
    expect(screen.queryByText('Skip to latest')).toBeNull();
    unmount();
  });

  it('onRegenerateIllustration 透传给 FullScreenImage (仅已完成章节)', () => {
    const onReg = vi.fn(() => Promise.resolve(null));
    const { unmount } = render(<StoryViewer {...viewProps({
      chapters: [chapter(1, 'A.')],
      onRegenerateIllustration: onReg,
      regeneratingChapters: new Set([1]),
    })} />);
    const imgProps = fullScreenImageMock.mock.calls[0][0] as { onRegenerate?: () => void; isRegenerating?: boolean };
    expect(typeof imgProps.onRegenerate).toBe('function');
    expect(imgProps.isRegenerating).toBe(true);
    unmount();
  });

  it('流式生成中场景标记透传 (chapterIndex-sceneIndex)', () => {
    const { unmount } = render(<StoryViewer {...viewProps({
      chapters: [chapter(1, 'done.')],
      isStreaming: true,
      currentChapterInfo: { chapterIndex: 2, title: 'Ch2', tone: 'neutral' as const, timeSpan: '+1d' },
      streamingText: 'live',
      generatingSceneIllustrations: new Set(['2-0']),
    })} />);
    const imgProps = fullScreenImageMock.mock.calls.at(-1)![0] as { isGeneratingScene?: boolean };
    expect(imgProps.isGeneratingScene).toBe(true);
    unmount();
  });
});
