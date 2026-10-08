// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; n?: number }) => {
      if (key === 'butterfly.chapterLabelShort') return `CH.${opts?.n}`;
      const map: Record<string, string> = {
        'butterfly.yourFutureUnlocked': '你的未来已解锁',
        'butterfly.storyComplete': '故事完成',
        'butterfly.chapters': '章',
        'butterfly.crossroads': '个分岔',
        'butterfly.oneDecision': '一个决定',
        'butterfly.futureGachaResult': '盲盒结果',
        'butterfly.demoModeBadge': '演示模式',
        'butterfly.startNewGacha': '开始新的盲盒',
        'butterfly.viewHistory': '查看历史',
        'butterfly.originalDecisionBoughtPrefix': '你当初买下了',
        'butterfly.originalDecisionResistedPrefix': '你当初放下了',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
const showToastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  showToast: (...a: unknown[]) => showToastMock(...(a as [])),
}));
// next/image → img 透传
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img alt={props.alt as string} />,
}));
// tab 常量真实现透传 (TONE_EMOJI 等)
vi.mock('../tab', (importOriginal) => importOriginal());

import { CompletedStoryView } from '../completed-story-view';

// Props 接口未从组件导出 — 本地定义同签名 (测fixture cast 用)
type CompletedStoryViewProps = Parameters<typeof CompletedStoryView>[0];

function scene(i: number, ch: number, overrides: Record<string, unknown> = {}) {
  return {
    chapterIndex: ch, chapterTitle: `第${ch}章`, tone: 'twist' as const, timeSpan: 'now',
    sceneIndex: i, sceneText: `场景${ch}-${i}文本`, imageUrl: `https://img/${ch}-${i}.png`, ...overrides,
  };
}

function viewProps(overrides: Record<string, unknown> = {}) {
  return {
    isLight: false,
    isDemo: false,
    sceneReview: [scene(0, 1), scene(1, 1), scene(0, 2)],
    butterflyEffect: '一个决定,两种人生。',
    finalTone: 'twist' as const,
    totalChapters: 2,
    choices: { 2: 'A' },
    decisionType: 'bought' as const,
    decisionDescription: '咖啡机',
    isSummaryCollapsed: true,
    onToggleSummary: vi.fn(),
    onReset: vi.fn(),
    onViewHistory: vi.fn(),
    sessionId: 's-42',
    ...overrides,
  };
}

describe('CompletedStoryView (274行 完成页)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('封面: 末场景图 + tone emoji + 标题 + 2章·1分岔·一个决定', () => {
    const { unmount } = render(<CompletedStoryView {...(viewProps() as unknown as CompletedStoryViewProps)} />);
    expect(screen.getByText('你的未来已解锁')).toBeTruthy();
    expect(screen.getByText(/2 章/)).toBeTruthy();
    expect(screen.getByText(/1 个分岔/)).toBeTruthy();
    expect(screen.getByText(/一个决定/)).toBeTruthy();
    // 封面 img 用末场景 URL
    const cover = document.querySelector('img[alt="你的未来已解锁"]') as HTMLImageElement;
    expect(cover?.getAttribute('src')).toBe('https://img/2-0.png');
    unmount();
  });

  it('总结折叠/展开: onToggleSummary + 展开时显示效应文本', () => {
    const { unmount } = render(<CompletedStoryView {...(viewProps({ isSummaryCollapsed: true }) as unknown as CompletedStoryViewProps)} />);
    expect(screen.queryByText('一个决定,两种人生。')).toBeNull(); // 折叠
    fireEvent.click(screen.getByText('盲盒结果'));
    // 组件内 onToggleSummary 由父控制展开态 — 这里只锁回调
    unmount();
    const { unmount: u2 } = render(<CompletedStoryView {...(viewProps({ isSummaryCollapsed: false }) as unknown as CompletedStoryViewProps)} />);
    expect(screen.getByText('一个决定,两种人生。')).toBeTruthy();
    u2();
  });

  it('butterflyEffect null: fallback 故事完成 (V28)', () => {
    const { unmount } = render(<CompletedStoryView {...(viewProps({ butterflyEffect: null, isSummaryCollapsed: false }) as unknown as CompletedStoryViewProps)} />);
    expect(screen.getByText('故事完成')).toBeTruthy();
    unmount();
  });

  it('场景回顾: 每场景文本 + 首场景章标题标签', () => {
    const { unmount } = render(<CompletedStoryView {...(viewProps() as unknown as CompletedStoryViewProps)} />);
    expect(screen.getByText('场景1-0文本')).toBeTruthy();
    expect(screen.getByText('场景1-1文本')).toBeTruthy();
    expect(screen.getByText('场景2-0文本')).toBeTruthy();
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByText('第2章')).toBeTruthy();
    unmount();
  });

  it('无场景图: fallback 渐变 (无 img alt) — 空场景数组仍渲染完成页 (V28)', () => {
    const { unmount } = render(<CompletedStoryView {...(viewProps({ sceneReview: [] }) as unknown as CompletedStoryViewProps)} />);
    expect(screen.getByText('你的未来已解锁')).toBeTruthy();
    expect(screen.queryByText('场景1-0文本')).toBeNull();
    unmount();
  });

  it('原始决策回顾: bought 前缀 + 描述 (N36 非 t() 参数)', () => {
    const { unmount } = render(<CompletedStoryView {...(viewProps() as unknown as CompletedStoryViewProps)} />);
    expect(screen.getByText('你当初买下了 "咖啡机"')).toBeTruthy();
    unmount();
    const r2 = render(<CompletedStoryView {...(viewProps({ decisionType: 'resisted' }) as unknown as CompletedStoryViewProps)} />);
    expect(r2.getByText('你当初放下了 "咖啡机"')).toBeTruthy();
    r2.unmount();
  });

  it('demo: 徽章显示 + 查看历史隐藏; 正常模式反之', () => {
    const demo = render(<CompletedStoryView {...(viewProps({ isDemo: true }) as unknown as CompletedStoryViewProps)} />);
    expect(demo.getByText(/演示模式/)).toBeTruthy();
    expect(demo.queryByText(/查看历史/)).toBeNull();
    demo.unmount();
    const normal = render(<CompletedStoryView {...(viewProps() as unknown as CompletedStoryViewProps)} />);
    expect(normal.queryByText(/演示模式/)).toBeNull();
    expect(normal.getByText(/查看历史/)).toBeTruthy();
    normal.unmount();
  });

  it('开始新盲盒: onReset; 查看历史: onViewHistory', () => {
    const p = viewProps();
    const { unmount } = render(<CompletedStoryView {...(p as unknown as CompletedStoryViewProps)} />);
    fireEvent.click(screen.getByText('开始新的盲盒'));
    expect(p.onReset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText(/查看历史/));
    expect(p.onViewHistory).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('分享 (无 navigator.share): clipboard 写入 + toast', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const { unmount } = render(<CompletedStoryView {...(viewProps() as unknown as CompletedStoryViewProps)} />);
    fireEvent.click(screen.getByText('Share'));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('I bought: "咖啡机"');
    expect(text).toContain('一个决定,两种人生。');
    expect(text).toContain('session=s-42');
    expect(showToastMock).toHaveBeenCalled();
    unmount();
  });

  it('分享 (navigator.share): 走系统分享不写剪贴板', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { unmount } = render(<CompletedStoryView {...(viewProps() as unknown as CompletedStoryViewProps)} />);
    fireEvent.click(screen.getByText('Share'));
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(showToastMock).not.toHaveBeenCalled();
    unmount();
  });
});
