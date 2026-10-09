import { describe, expect, it } from 'vitest';

import {
  API,
  BUTTERFLY_EFFECT_FALLBACK,
  DEFAULT_UI_STATE,
  DEMO_API,
  ILLUSTRATION_POLLING_INTERVAL_MS,
  ILLUSTRATION_POLLING_MAX_RETRIES,
} from '../constants';

/**
 * session/constants.ts (60行) — useButterflySession 常量 (C1 拆分, 纯常量)。
 *
 * 锁定:
 * - DEFAULT_UI_STATE 初始七键 (idle/无加载/零章)
 * - API/DEMO_API 五端点一一对应; demo 前缀 demo-*; preloadBranch demo 空串短路
 * - 插图轮询 24×5s=120s 覆盖 LLM p99 (Round 12 XSTATE-10 根因修复锚)
 */
describe('DEFAULT_UI_STATE', () => {
  it('初始七键: idle/无加载/零章/无错', () => {
    expect(DEFAULT_UI_STATE).toEqual({
      phase: 'idle',
      isLoading: false,
      streamingText: '',
      currentChapterIndex: 0,
      error: null,
      outlineVisible: false,
    });
  });
});

describe('API/DEMO_API 端点', () => {
  it('五端点键对齐', () => {
    expect(Object.keys(API).sort()).toEqual(Object.keys(DEMO_API).sort());
    expect(API.session).toBe('/api/butterfly/session');
    expect(API.preloadBranch).toBe('/api/butterfly/preload-branch');
  });

  it('demo 端点隔离 (demo-session/demo-story/demo-choice)', () => {
    expect(DEMO_API.session).not.toBe(API.session);
    expect(DEMO_API.session).toBe('/api/butterfly/demo-session');
    expect(DEMO_API.story).toBe('/api/butterfly/demo-story');
    expect(DEMO_API.choice).toBe('/api/butterfly/demo-choice');
  });

  it('demo preloadBranch 空串短路 (不预加载)', () => {
    expect(DEMO_API.preloadBranch).toBe('');
  });
});

describe('插图轮询预算 (Round 12 XSTATE-10)', () => {
  it('24×5s=120s 覆盖 LLM p99', () => {
    expect(ILLUSTRATION_POLLING_INTERVAL_MS).toBe(5000);
    expect(ILLUSTRATION_POLLING_MAX_RETRIES).toBe(24);
    expect((ILLUSTRATION_POLLING_INTERVAL_MS * ILLUSTRATION_POLLING_MAX_RETRIES) / 1000).toBe(120);
  });
});

describe('fallback 字符串 (Round 58 Finding 12)', () => {
  it('非空英文句', () => {
    expect(BUTTERFLY_EFFECT_FALLBACK.length).toBeGreaterThan(20);
    expect(BUTTERFLY_EFFECT_FALLBACK).toContain('butterfly effect');
  });
});
