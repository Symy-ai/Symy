// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'butterfly.demo': '演示',
        'butterfly.abandonConfirm': '确定放弃这个故事吗？',
        'butterfly.abandonStory': '放弃故事',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

// 子组件 mock — 数据-testid 断言接线 (装配层测法, 同 chat-tab 车道简报)
vi.mock('../../choice-card', () => ({
  ChoiceCard: (p: { prompt?: string; options?: { id: string }[]; onSelect?: (id: string) => void }) => (
    <div data-testid="choice-card" data-prompt={p.prompt} data-options={(p.options ?? []).map((o) => o.id).join(',')} onClick={() => p.onSelect?.('B')} />
  ),
}));
vi.mock('../../timeline-visual', () => ({
  TimelineVisual: (p: { currentChapterIndex?: number; isLight?: boolean }) => (
    <div data-testid="timeline" data-current={p.currentChapterIndex} data-light={String(p.isLight)} />
  ),
}));
vi.mock('../demo-scene-player', () => ({
  DemoScenePlayer: (p: { sceneText?: string; sceneIndex?: number; totalScenes?: number; onAdvance?: () => void; isStreaming?: boolean }) => (
    <div data-testid="scene-player" data-scene={p.sceneIndex} data-total={p.totalScenes} data-streaming={String(p.isStreaming)}>
      <button data-testid="advance" onClick={p.onAdvance}>推进</button>
    </div>
  ),
}));
vi.mock('../choice-loading-state', () => ({
  ChoiceLoadingState: (p: { onRetry?: () => void }) => (
    <div data-testid="choice-loading"><button data-testid="retry" onClick={p.onRetry}>重试</button></div>
  ),
}));

import { PlayingView } from '../playing-view';
import type { PlayingViewProps } from '../playing-view';  // eslint-disable-line no-duplicate-imports -- type-only import separated for clarity
import type { ChapterData } from '../../../hooks/player/types';

const chInfo: ChapterData = {
  index: 1,
  title: '第一章',
  tone: 'neutral',
  timeSpan: '晚上',
  hasChoice: false,
  scenes: [
    { text: '场景一文本', imageUrl: 'https://img/1.png' },
    { text: '场景二文本', imageUrl: 'https://img/2.png' },
  ],
};

const baseProps = {
  isLight: false,
  isDialogueCollapsed: true,
  chInfo,
  currentSceneIndex: 0,
  decisionType: 'bought' as const,
  decisionDesc: '买了键盘',
  completedChapters: [chInfo],
  currentChapterIndex: 1,
  phase: 'playing' as const,
  isStreamingChapter: false,
  onToggleDialogue: vi.fn(),
  onAdvance: vi.fn(),
  onSelectChoice: vi.fn(),
  onRetryChoice: vi.fn(),
  onGoToChapter: vi.fn(),
  onAbandonStory: vi.fn(),
};

function renderUI(overrides: Partial<PlayingViewProps> = {}) {
  return render(<PlayingView {...baseProps} {...overrides} />);
}

/**
 * playing-view.tsx (202行) — Round 80 F7 拆出的播放/选择双相视图。
 *
 * 装配层锁定:
 * - demo 徽标 + isLight 词汇
 * - TimelineVisual: completedChapters 映射 (content 用 ||| 拼接) + currentChapterIndex-1
 * - DemoScenePlayer: currentSceneIndex 透传 + 推进回调
 * - phase='choosing'+currentChoice → ChoiceCard 覆盖层
 * - phase='choosing'+无 choice → ChoiceLoadingState
 * - 放弃按钮: confirm 弹窗门卫
 */
describe('PlayingView 播放/选择双相视图', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('基础渲染: 场景播放器透传 sceneIndex/total + 决策回顾文案', () => {
    renderUI();
    const sp = screen.getByTestId('scene-player');
    expect(sp.getAttribute('data-scene')).toBe('0');
    expect(sp.getAttribute('data-total')).toBe('2');
    expect(screen.getByText('买了键盘')).toBeTruthy();
  });

  it('isLight 词汇切换透传到 timeline + isDemo 徽标', () => {
    renderUI({ isLight: true, isDemo: true, outline: {
      version: 1, decisionType: 'bought', decisionDescription: 'd',
      chapters: [{ index: 1, title: '一', summary: 's', hasChoice: false, tone: 'neutral', timeSpan: 'x' }],
      endingHint: 'e',
    } });
    const tl = screen.getByTestId('timeline');
    expect(tl.getAttribute('data-light')).toBe('true');
    expect(screen.getByText(/演示/)).toBeTruthy();
  });

  it('outline 存在 → timeline 渲染; currentChapterIndex-1 修正为 0 基', () => {
    renderUI({
      outline: {
        version: 1, decisionType: 'bought', decisionDescription: 'd',
        chapters: [
          { index: 1, title: '一', summary: 's', hasChoice: false, tone: 'neutral', timeSpan: 'x' },
          { index: 2, title: '二', summary: 's', hasChoice: true, tone: 'twist', timeSpan: 'y' },
        ],
        endingHint: 'e',
      },
      currentChapterIndex: 1,
    });
    expect(screen.getByTestId('timeline').getAttribute('data-current')).toBe('0');
  });

  it('outline 缺失 → timeline 不渲染', () => {
    renderUI();
    expect(screen.queryByTestId('timeline')).toBeNull();
  });

  it('phase=choosing + currentChoice → ChoiceCard 覆盖层 + onSelect 接线', () => {
    renderUI({
      phase: 'choosing',
      currentChoice: { prompt: '走哪条路?', options: [{ id: 'A', label: '甲', hint: 'h' }, { id: 'B', label: '乙', hint: 'h2' }] },
    });
    const cc = screen.getByTestId('choice-card');
    expect(cc.getAttribute('data-prompt')).toBe('走哪条路?');
    expect(cc.getAttribute('data-options')).toBe('A,B');
    fireEvent.click(cc);
    expect(baseProps.onSelectChoice).toHaveBeenCalledWith('B');
  });

  it('phase=choosing + 无 currentChoice → ChoiceLoadingState + onRetry 接线', () => {
    renderUI({ phase: 'choosing', currentChoice: null });
    const retry = screen.getByTestId('retry');
    fireEvent.click(retry);
    expect(baseProps.onRetryChoice).toHaveBeenCalledTimes(1);
  });

  it('phase=playing → 无选择层', () => {
    renderUI();
    expect(screen.queryByTestId('choice-card')).toBeNull();
    expect(screen.queryByTestId('choice-loading')).toBeNull();
  });

  it('放弃按钮: confirm 取消 → 不触发; 确认 → onAbandonStory', () => {
    const confirmSpy = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (window as unknown as { confirm: unknown }).confirm = confirmSpy;
    renderUI();
    const abandon = screen.getByLabelText('放弃故事');
    fireEvent.click(abandon);
    expect(baseProps.onAbandonStory).not.toHaveBeenCalled();
    fireEvent.click(abandon);
    expect(baseProps.onAbandonStory).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('推进按钮 → onAdvance 接线 (场景点击推进)', () => {
    renderUI();
    fireEvent.click(screen.getByTestId('advance'));
    expect(baseProps.onAdvance).toHaveBeenCalledTimes(1);
  });

  it('isStreamingChapter → 透传 scene player (streaming 状态)', () => {
    renderUI({ isStreamingChapter: true });
    expect(screen.getByTestId('scene-player').getAttribute('data-streaming')).toBe('true');
  });

  it('台词框折叠态点击顶部 → onToggleDialogue 触发 (展开)', () => {
    renderUI({ isDialogueCollapsed: true });
    // 顶部决策区 role=button — 含决策描述的父级 div
    const desc = screen.getByText('买了键盘');
    const top = desc.closest('[role="button"]');
    expect(top).toBeTruthy();
    fireEvent.click(top!);
    expect(baseProps.onToggleDialogue).toHaveBeenCalledTimes(1);
  });
});
