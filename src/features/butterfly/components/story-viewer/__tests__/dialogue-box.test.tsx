// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; n?: number }) => {
      const map: Record<string, string> = {
        'storyViewer.tapToContinue': '点击继续',
        'butterfly.chapterLabelShort': `第${opts?.n ?? '?'}章`,
        'butterfly.endOfChapter': '章节结束',
        'butterfly.tap': '点击',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

// useTypewriter mock — 可控 isComplete 状态
let typewriterState = { displayedText: '完整场景文本', isComplete: true, skipToEnd: vi.fn() };
vi.mock('../use-typewriter', () => ({
  useTypewriter: (_text: string, _speed?: number, _enabled?: boolean) => typewriterState,
}));

import { DialogueBox } from '../dialogue-box';

const baseProps = {
  sceneText: '完整场景文本',
  tone: 'neutral' as const,
  chapterIndex: 2,
  sceneIndex: 1,
  totalScenes: 4,
  isLastScene: false,
  onAdvance: vi.fn(),
};

function renderUI(overrides: Partial<typeof baseProps> & { isLiveStreaming?: boolean; chapterTitle?: string; shotCount?: number; currentShot?: number } = {}) {
  return render(<DialogueBox {...baseProps} {...overrides} />);
}

/**
 * dialogue-box.tsx (165行) — Round 80 F4 拆出的 Galgame 式台词框。
 *
 * 锁定:
 * - 打字未完 → 点击 skipToEnd (不推进); 完 → 点击 onAdvance
 * - isLiveStreaming: 打字禁用, 点击直接推进
 * - 章节标签 CH.{n} + 可选章节标题
 * - 场景进度点 (current 高亮, passed 变色)
 * - shotCount>1 才渲染镜头指示器
 * - 流式光标 vs 完成提示互斥 (TAP / END OF CHAPTER)
 * - 键盘 Enter/Space 等价点击
 */
describe('DialogueBox 台词框', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    typewriterState = { displayedText: '完整场景文本', isComplete: true, skipToEnd: vi.fn() };
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('打字完成态: 点击 → onAdvance', () => {
    renderUI();
    fireEvent.click(screen.getByRole('button', { name: '点击继续' }));
    expect(baseProps.onAdvance).toHaveBeenCalledTimes(1);
    expect(typewriterState.skipToEnd).not.toHaveBeenCalled();
  });

  it('打字未完成: 点击 → skipToEnd 不推进', () => {
    typewriterState = { displayedText: '部分', isComplete: false, skipToEnd: vi.fn() };
    renderUI();
    fireEvent.click(screen.getByRole('button'));
    expect(typewriterState.skipToEnd).toHaveBeenCalledTimes(1);
    expect(baseProps.onAdvance).not.toHaveBeenCalled();
  });

  it('isLiveStreaming: 未完成也直接推进 (打字禁用)', () => {
    typewriterState = { displayedText: '流式', isComplete: false, skipToEnd: vi.fn() };
    renderUI({ isLiveStreaming: true });
    fireEvent.click(screen.getByRole('button'));
    expect(baseProps.onAdvance).toHaveBeenCalledTimes(1);
    expect(typewriterState.skipToEnd).not.toHaveBeenCalled();
  });

  it('章节标签 第n章 + 章节标题展示', () => {
    renderUI({ chapterTitle: '涟漪的开始' });
    expect(screen.getByText('第2章')).toBeTruthy();
    expect(screen.getByText('涟漪的开始')).toBeTruthy();
  });

  it('章节标题缺省 → 不渲染标题节点', () => {
    renderUI();
    expect(screen.queryByText('涟漪的开始')).toBeNull();
    expect(screen.getByText('第2章')).toBeTruthy();
  });

  it('场景进度点: totalScenes 数量', () => {
    renderUI();
    // 4 个进度点 — 用容器查询 (无 aria)
    const dots = document.querySelectorAll('[style*="background-color"]');
    expect(dots.length).toBeGreaterThanOrEqual(4);
  });

  it('shotCount>1 → 镜头指示器渲染; =1 不渲染', () => {
    const { unmount } = renderUI({ shotCount: 3, currentShot: 1 });
    // 镜头指示器 3 点 + 场景 4 点 = 至少 7 个带背景色元素
    const withShots = document.querySelectorAll('[style*="background-color"]').length;
    unmount();
    renderUI({ shotCount: 1 });
    const withoutShots = document.querySelectorAll('[style*="background-color"]').length;
    expect(withShots).toBeGreaterThan(withoutShots);
  });

  it('完成态非末场景 → TAP 提示; 末场景 → END OF CHAPTER', () => {
    renderUI();
    expect(screen.getByText('点击')).toBeTruthy();
    expect(screen.queryByText('章节结束')).toBeNull();
    cleanup();
    renderUI({ isLastScene: true });
    expect(screen.getByText('章节结束')).toBeTruthy();
  });

  it('流式未完成 → 无 TAP/END 提示 (光标态)', () => {
    typewriterState = { displayedText: 'x', isComplete: false, skipToEnd: vi.fn() };
    renderUI({ isLiveStreaming: true });
    expect(screen.queryByText('点击')).toBeNull();
    expect(screen.queryByText('章节结束')).toBeNull();
  });

  it('键盘 Enter/Space 等价点击推进', () => {
    renderUI();
    const box = screen.getByRole('button');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(baseProps.onAdvance).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: ' ' });
    expect(baseProps.onAdvance).toHaveBeenCalledTimes(2);
  });
});
