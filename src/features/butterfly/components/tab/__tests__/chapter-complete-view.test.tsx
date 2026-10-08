// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; n?: number }) => {
      const map: Record<string, string> = {
        'butterfly.chapterComplete': '章节完成',
        'butterfly.chComplete': `第 ${opts?.n ?? '?'} 章 · 完`,
        'butterfly.continueToNext': '继续下一章',
        'butterfly.seeYourFuture': '看看你的未来 →',
        'butterfly.abandonStory': '放弃故事',
        'butterfly.abandonConfirm': '确定放弃这个故事吗？',
        'butterfly.demoModeBadge': '演示模式',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
// tab.tsx 色彩常量 mock (被测 import '../tab'):
vi.mock('../../tab', () => ({
  TONE_ACCENT_COLORS: { neutral: '#111827' },
  TONE_ACCENT_COLORS_LIGHT: { neutral: '#6b7280' },
  TONE_BORDER_COLORS: { neutral: 'rgba(1,1,1,.3)' },
  TONE_BORDER_COLORS_LIGHT: { neutral: 'rgba(2,2,2,.3)' },
  TONE_EMOJI: { neutral: '😐' },
}));

import { ChapterCompleteView } from '../chapter-complete-view';
// Props 未导出 — 本地同签名
type ChapterCompleteViewProps = Parameters<typeof ChapterCompleteView>[0];

const chInfo = {
  index: 2,
  title: '第二章',
  tone: 'neutral' as const,
  timeSpan: '次日',
  hasChoice: false,
  scenes: [{ text: 'a', imageUrl: 'https://img/last.png' }, { text: 'b', imageUrl: 'https://img/final.png' }],
};

const baseProps = {
  isLight: false,
  isDemo: false,
  currentChapterInfo: chInfo,
  currentChapterIndex: 2,
  isLastChapter: false,
  onAdvanceToNextChapter: vi.fn(),
  onReset: vi.fn(),
};

function renderUI(props: Partial<ChapterCompleteViewProps> = {}) {
  return render(<ChapterCompleteView {...baseProps} {...props} />);
}

/**
 * chapter-complete-view.tsx (142行) — 章节完成插页 (Round 98 拆分)。
 *
 * 锁定:
 * - 末场景图直出 (alt 带 chapter 序号)
 * - chInfo 缺省 → 兜底构造 (index=currentChapterIndex)
 * - 非末章 → 继续按钮; 末章 → See Your Future
 * - 放弃按钮: confirm 门卫 → onReset
 * - demo 徽章
 */
describe('ChapterCompleteView 章节完成插页', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('末场景图渲染 (alt 带章号) + 章节标题', () => {
    renderUI();
    const img = screen.getByAltText('Chapter 2 complete') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://img/final.png');
    expect(screen.getByText('第 2 章 · 完')).toBeTruthy();
  });

  it('chInfo 缺省 → 兜底 (index 取 currentChapterIndex, 零场景不炸)', () => {
    renderUI({ currentChapterInfo: null, currentChapterIndex: 3 });
    expect(screen.getByText('第 3 章 · 完')).toBeTruthy();
  });

  it('非末章 → 继续下一章; 末章 → See Your Future', () => {
    renderUI();
    expect(screen.getByText('继续下一章')).toBeTruthy();
    expect(screen.queryByText('看看你的未来 →')).toBeNull();
    cleanup();
    renderUI({ isLastChapter: true });
    expect(screen.getByText('看看你的未来 →')).toBeTruthy();
  });

  it('继续按钮 → onAdvanceToNextChapter', () => {
    renderUI();
    fireEvent.click(screen.getByText('继续下一章'));
    expect(baseProps.onAdvanceToNextChapter).toHaveBeenCalledTimes(1);
  });

  it('放弃: confirm 取消不触发; 确认 → onReset', () => {
    const confirmSpy = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (window as unknown as { confirm: unknown }).confirm = confirmSpy;
    renderUI();
    const abandon = screen.getByText('放弃故事');
    fireEvent.click(abandon);
    expect(baseProps.onReset).not.toHaveBeenCalled();
    fireEvent.click(abandon);
    expect(baseProps.onReset).toHaveBeenCalledTimes(1);
  });

  it('demo 徽章渲染; 非 demo 不渲染', () => {
    renderUI({ isDemo: true });
    expect(screen.getByText(/演示模式/)).toBeTruthy();
    cleanup();
    renderUI();
    expect(screen.queryByText(/演示模式/)).toBeNull();
  });
});
