// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TimelineVisual } from '../timeline-visual';
import type { StoryOutline, StoryChapter } from '../../types';

const outline: StoryOutline = {
  version: 1,
  decisionType: 'bought',
  decisionDescription: 'd',
  chapters: [
    { index: 1, title: '一', summary: 's', hasChoice: false, tone: 'neutral', timeSpan: 'x' },
    { index: 2, title: '二', summary: 's', hasChoice: true, tone: 'twist', timeSpan: 'y' },
    { index: 3, title: '三', summary: 's', hasChoice: false, tone: 'dark', timeSpan: 'z' },
  ],
  endingHint: 'e',
};

const completed: StoryChapter[] = [
  { index: 1, title: '一', content: 'c', tone: 'neutral', timeSpan: 'x', hasChoice: false, createdAt: 't' },
];

/**
 * timeline-visual.tsx (107行) — 剧情时间线 (三态点: 完成/当前/未来)。
 *
 * 锁定:
 * - outline null/空 → null
 * - 三章节点渲染, 状态类分流 (completed 彩色+shadow / current pulse+放大 / 未来灰)
 * - currentChapterIndex+1 对齐 (0 基转 1 基)
 */
describe('TimelineVisual 剧情时间线', () => {
  afterEach(() => cleanup());

  it('outline null / 空章节 → null', () => {
    let r = render(<TimelineVisual outline={null} completedChapters={[]} currentChapterIndex={0} />);
    expect(r.container.firstElementChild).toBeNull();
    r.unmount();
    const empty: StoryOutline = { ...outline, chapters: [] };
    r = render(<TimelineVisual outline={empty} completedChapters={[]} currentChapterIndex={0} />);
    expect(r.container.firstElementChild).toBeNull();
  });

  it('三章节点: ch1 完成彩色 / ch2 当前 pulse / ch3 未来灰', () => {
    const { container } = render(<TimelineVisual outline={outline} completedChapters={completed} currentChapterIndex={1} />);
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBeGreaterThanOrEqual(3);
    // ch1 完成: bg-gray-400 (neutral tone)
    expect(dots[0].className).toContain('bg-gray-400');
    expect(dots[0].className).toContain('shadow');
    // ch2 当前: bg-purple-400 (twist) + animate-pulse + scale-125
    expect(dots[1].className).toContain('bg-purple-400');
    expect(dots[1].className).toContain('animate-pulse');
    expect(dots[1].className).toContain('scale-125');
    // ch3 未来: bg-gray-700 (暗模式)
    expect(dots[2].className).toContain('bg-gray-700');
  });

  it('isLight: 未来点 bg-gray-300', () => {
    const { container } = render(<TimelineVisual outline={outline} completedChapters={completed} currentChapterIndex={1} isLight />);
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots[2].className).toContain('bg-gray-300');
  });
});
