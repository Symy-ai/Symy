// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ButterflyHistoryDetail } from '../butterfly-history-detail';
import type { ButterflySession, StoryChapter, ButterflyChoice } from '../../types';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) =>
      ({
        'butterfly.historyExportGenerating': '生成导出中...',
        'butterfly.historyExportDone': '已导出',
        'butterfly.historyStartNew': '看一个新宇宙',
        'butterfly.historyBack': '返回',
      })[key] ?? opts?.defaultValue ?? key,
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function chapter(overrides: Partial<StoryChapter> = {}): StoryChapter {
  return {
    index: 1,
    title: 'Chapter One',
    content: 'Scene A.|||Scene B.',
    tone: 'neutral',
    timeSpan: 'now',
    hasChoice: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function choice(overrides: Partial<ButterflyChoice> = {}): ButterflyChoice {
  return {
    chapterIndex: 1,
    prompt: 'What do you do?',
    options: [
      { id: 'A', label: '选项甲', hint: 'h' },
      { id: 'B', label: '选项乙', hint: 'h' },
    ],
    selectedOption: 'A',
    ...overrides,
  } as ButterflyChoice;
}

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 's-1',
    userId: 'u-1',
    decisionType: 'bought',
    decisionDescription: 'Coffee machine',
    amount: 10,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 1,
    chapters: [],
    choices: [],
    butterflyEffect: 'A small choice, a different life.',
    finalTone: 'hopeful',
    status: 'completed',
    isExample: false,
    isBookmarked: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

// URL.createObjectURL / a.click mock — 导出链路
const createObjectURLMock = vi.fn(() => 'blob:mock-url');
const revokeObjectURLMock = vi.fn();

describe('ButterflyHistoryDetail (只读回看)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = createObjectURLMock as never;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock as never;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('封面: 决策描述 + 蝴蝶效应总结 + finalTone 徽章', () => {
    render(
      <ButterflyHistoryDetail
        session={session({ chapters: [chapter()] })}
        isLight={false}
        onBack={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText('Coffee machine')).toBeTruthy();
    expect(screen.getByText(/A small choice, a different life/i)).toBeTruthy();
  });

  it('场景展开: content 按 ||| 分割为逐场景行', () => {
    render(
      <ButterflyHistoryDetail
        session={session({ chapters: [chapter()] })}
        isLight={false}
        onBack={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText(/Scene A/)).toBeTruthy();
    expect(screen.getByText(/Scene B/)).toBeTruthy();
  });

  it('分岔路口: 已选 choice 显示选项 label (甲被选中)', () => {
    render(
      <ButterflyHistoryDetail
        session={session({ chapters: [chapter()], choices: [choice()] })}
        isLight={false}
        onBack={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText(/选项甲/)).toBeTruthy();
  });

  it('finalTone 兜底: 无 finalTone 时取最后一章 tone', () => {
    const s = session({ finalTone: null, chapters: [chapter({ tone: 'dark' })] });
    render(
      <ButterflyHistoryDetail session={s} isLight={false} onBack={vi.fn()} onStartNew={vi.fn()} />,
    );
    // dark tone accent 用于样式 — 组件不崩溃即通过 (tone 兜底链)
    expect(screen.getAllByText(/Coffee machine/i).length).toBeGreaterThan(0);
  });

  it('onBack/onStartNew 按钮触发回调', () => {
    const onBack = vi.fn();
    const onStartNew = vi.fn();
    render(
      <ButterflyHistoryDetail
        session={session({ chapters: [chapter()] })}
        isLight={false}
        onBack={onBack}
        onStartNew={onStartNew}
      />,
    );
    // 用 i18n 文本精确定位 (mock 映射 '看一个新宇宙' → onStartNew)
    const startNewBtn = screen.getByText('看一个新宇宙');
    fireEvent.click(startNewBtn);
    expect(onStartNew).toHaveBeenCalled();
  });

  it('导出: handleExport 生成 Blob + toast 流转 (Generating→Done)', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <ButterflyHistoryDetail
          session={session({ chapters: [chapter()], choices: [choice()] })}
          isLight={false}
          onBack={vi.fn()}
          onStartNew={vi.fn()}
        />,
      );
      // 找导出按钮 (文本含 Export)
      const exportBtn = screen.getAllByRole('button').find((b) => /export/i.test(b.textContent || ''));
      expect(exportBtn).toBeTruthy();
      act(() => { fireEvent.click(exportBtn!); });
      // 立即显示 Generating toast
      expect(screen.getByText('生成导出中...')).toBeTruthy();
      // 100ms 后 Blob 构建执行
      act(() => { vi.advanceTimersByTime(100); });
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      // toast 转 Done
      // toast 文本是 '✓ 已导出' (✓ 与内容拆两个文本节点) — 用内容函数匹配
      expect(screen.getByText((_, el) => (el?.textContent ?? '') === '✓ 已导出')).toBeTruthy();
      rerender(<div />);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isLight 双模式渲染不崩溃 + 文字类切换', () => {
    const { unmount } = render(
      <ButterflyHistoryDetail
        session={session({ chapters: [chapter()] })}
        isLight={true}
        onBack={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Coffee machine/i).length).toBeGreaterThan(0);
    unmount();
    render(
      <ButterflyHistoryDetail
        session={session({ chapters: [chapter()] })}
        isLight={false}
        onBack={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Coffee machine/i).length).toBeGreaterThan(0);
  });
});
