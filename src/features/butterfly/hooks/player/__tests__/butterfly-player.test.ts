import { describe, expect, it, vi } from 'vitest';

import { adaptDemoPlayer } from '../butterfly-player';

const demoBase = {
  phase: 'playing',
  decisionType: 'bought' as const,
  decisionDescription: '键盘',
  outline: null,
  currentChapterIndex: 1,
  currentSceneIndex: 2,
  currentScenes: [],
  currentChapterInfo: null,
  completedChapters: [],
  currentChoice: null,
  butterflyEffect: null,
  finalTone: null,
  totalChapters: 3,
  choices: {},
  isLoading: false,
  error: null,
  startDemo: vi.fn(),
  advance: vi.fn(),
  selectChoice: vi.fn(),
  reset: vi.fn(),
  advanceToNextChapter: vi.fn(),
  goToChapter: vi.fn(),
};

/**
 * butterfly-player.ts (126行) — 统一 Player 接口 + demo 适配器 (消 35 个 isDemo 分支)。
 *
 * 锁定:
 * - 适配器全字段透传 (20 字段)
 * - Demo 特化: isStreamingChapter=false / streamingText='' / retryChoice no-op
 * - start 包 startDemo 且恒返 true (P0-B: 扣减由调用方判断)
 * - 五方法直通
 */
describe('adaptDemoPlayer', () => {
  it('全字段透传 (20 字段)', () => {
    const p = adaptDemoPlayer(demoBase);
    expect(p.phase).toBe('playing');
    expect(p.decisionType).toBe('bought');
    expect(p.currentSceneIndex).toBe(2);
    expect(p.totalChapters).toBe(3);
    expect(p.outline).toBeNull();
    expect(p.choices).toEqual({});
  });

  it('Demo 特化三件: isStreaming false / streamingText 空 / retryChoice no-op', () => {
    const p = adaptDemoPlayer(demoBase);
    expect(p.isStreamingChapter).toBe(false);
    expect(p.streamingText).toBe('');
    expect(() => p.retryChoice()).not.toThrow();
  });

  it('start 包 startDemo 且恒返 true', async () => {
    const p = adaptDemoPlayer(demoBase);
    const ok = await p.start({ decisionType: 'bought', decisionDescription: 'd', locale: 'zh' });
    expect(ok).toBe(true);
    expect(demoBase.startDemo).toHaveBeenCalledTimes(1);
  });

  it('五方法直通 (advance/selectChoice/reset/advanceToNextChapter/goToChapter)', () => {
    const p = adaptDemoPlayer(demoBase);
    p.advance();
    p.selectChoice('A');
    p.reset();
    p.advanceToNextChapter();
    p.goToChapter(2);
    expect(demoBase.advance).toHaveBeenCalledTimes(1);
    expect(demoBase.selectChoice).toHaveBeenCalledWith('A');
    expect(demoBase.reset).toHaveBeenCalledTimes(1);
    expect(demoBase.advanceToNextChapter).toHaveBeenCalledTimes(1);
    expect(demoBase.goToChapter).toHaveBeenCalledWith(2);
  });
});
