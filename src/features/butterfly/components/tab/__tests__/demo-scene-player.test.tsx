// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; n?: number }) => {
      if (key === 'butterfly.chapterLabelShort') return `CH.${opts?.n}`;
      if (key === 'butterfly.scene') return `场景 ${opts?.n}`;
      const map: Record<string, string> = {
        'butterfly.tap': '点击继续',
        'butterfly.writing': '正在书写…',
        'butterfly.nextChapter': '下一章',
        'butterfly.makeYourChoice': '做出你的选择',
        'butterfly.expandDialogue': '展开台词',
        'butterfly.collapseDialogue': '收起台词',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

import { DemoScenePlayer } from '../demo-scene-player';
import type { DemoScenePlayerProps } from '../types';

function props(overrides: Record<string, unknown> = {}) {
  return {
    sceneText: '雨落在窗台上，城市的灯光晕开。',
    sceneImageUrl: 'https://img.example/scene-1.png',
    chapterIndex: 1,
    chapterTitle: '决定的那一刻',
    tone: 'neutral' as const,
    timeSpan: '那个晚上',
    sceneIndex: 0,
    totalScenes: 3,
    isLastSceneOfChapter: false,
    hasChoice: false,
    onAdvance: vi.fn(),
    ...overrides,
  };
}

function renderPlayer(overrides: Record<string, unknown> = {}) {
  const p = props(overrides);
  const view = render(<DemoScenePlayer {...(p as unknown as DemoScenePlayerProps)} />);
  return { ...view, props: p };
}

describe('DemoScenePlayer (326行 Galgame 场景播放器)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('非流式: 28ms 打字机逐字显示 → 完成后 TAP 提示', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderPlayer();
      expect(screen.queryByText('点击继续')).toBeNull(); // 未完成
      act(() => vi.advanceTimersByTime(1000)); // 文本 16 字 × 28ms ≈ 450ms
      expect(screen.getByText('雨落在窗台上，城市的灯光晕开。')).toBeTruthy();
      expect(screen.getByText('点击继续')).toBeTruthy();
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('流式模式: 无打字机直接显示 + 书写中指示', () => {
    const { unmount } = renderPlayer({ isStreaming: true });
    expect(screen.getByText('雨落在窗台上，城市的灯光晕开。')).toBeTruthy(); // 立即全显
    expect(screen.getByText('正在书写…')).toBeTruthy();
    unmount();
  });

  it('打字机未完成点击: skipToEnd 直接跳完', () => {
    vi.useFakeTimers();
    try {
      const { unmount, props: p } = renderPlayer();
      fireEvent.click(screen.getByRole('button', { name: '点击继续' }).parentElement!.parentElement!.parentElement!);
      // 更直接: 点最外层 role=button
      const stage = screen.getByRole('button', { name: '点击继续' });
      void stage;
      const root = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
      fireEvent.click(root); // 打字未完成 → skip
      expect(screen.getByText('雨落在窗台上，城市的灯光晕开。')).toBeTruthy();
      expect(p.onAdvance).not.toHaveBeenCalled();
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('完成后点击: onAdvance 触发一次', () => {
    vi.useFakeTimers();
    try {
      const { unmount, props: p } = renderPlayer();
      act(() => vi.advanceTimersByTime(1000));
      const root = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
      fireEvent.click(root);
      expect(p.onAdvance).toHaveBeenCalledTimes(1);
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('N27: 末场景无选择时 500ms 内重复点击只 advance 一次', () => {
    vi.useFakeTimers();
    try {
      const { unmount, props: p } = renderPlayer({ isLastSceneOfChapter: true, hasChoice: false });
      act(() => vi.advanceTimersByTime(1000));
      const root = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
      fireEvent.click(root);
      fireEvent.click(root); // 500ms 内连点
      expect(p.onAdvance).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(600));
      fireEvent.click(root); // 500ms 后解锁
      expect(p.onAdvance).toHaveBeenCalledTimes(2);
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('末场景有选择: 提示「做出你的选择」且不锁 advancing', () => {
    vi.useFakeTimers();
    try {
      const { unmount, props: p } = renderPlayer({ isLastSceneOfChapter: true, hasChoice: true });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByText('做出你的选择')).toBeTruthy();
      const root = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
      fireEvent.click(root);
      fireEvent.click(root); // 有 choice 不走 N27 锁
      expect(p.onAdvance).toHaveBeenCalledTimes(2);
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('场景进度点: totalScenes 个 + x/y 计数', () => {
    const { unmount } = renderPlayer({ isStreaming: true, sceneIndex: 1, totalScenes: 3 });
    expect(screen.getByText('2/3')).toBeTruthy();
    unmount();
  });

  it('首场景: 章标题标签 + 时间跨度; 非首场景: CH.1 · 场景 2', () => {
    const first = renderPlayer({ isStreaming: true, sceneIndex: 0 });
    expect(screen.getByText('CH.1')).toBeTruthy();
    expect(screen.getByText('决定的那一刻')).toBeTruthy();
    expect(screen.getByText('那个晚上')).toBeTruthy();
    first.unmount();
    const second = renderPlayer({ isStreaming: true, sceneIndex: 1 });
    expect(screen.getByText('CH.1 · 场景 2')).toBeTruthy();
    second.unmount();
  });

  it('台词框收起: 单行预览 + 点击画面先展开 (不 advance)', () => {
    const onToggle = vi.fn();
    const { unmount, props: p } = renderPlayer({ isStreaming: true, isDialogueCollapsed: true, onToggleDialogue: onToggle });
    expect(screen.getByText('雨落在窗台上，城市的灯光晕开。')).toBeTruthy(); // 单行预览
    const root = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
    fireEvent.click(root); // 收起时点击 = 展开
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(p.onAdvance).not.toHaveBeenCalled();
    unmount();
  });

  it('卸载清理: advancing timer 内 unmount 不崩', () => {
    vi.useFakeTimers();
    try {
      const { unmount, props: p } = renderPlayer({ isLastSceneOfChapter: true, hasChoice: false });
      act(() => vi.advanceTimersByTime(1000));
      const root = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
      fireEvent.click(root);
      unmount();
      act(() => vi.advanceTimersByTime(600));
      expect(p.onAdvance).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
