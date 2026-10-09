// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';

import { dismissContextSignal, readDismissedContextSignals } from '../context-signal-store';

/**
 * context-signal-store.ts (41行) — 弱信号纠正 sessionStorage (batch61-b)。
 *
 * 设计红线锚:
 * - 只存词条 id 字符串
 * - 幂等 (重复 dismiss 不重复写)
 * - 读防御 (坏 JSON/非数组/坏元素 → [])
 * - 隐私模式抛错静默降级
 */
describe('context-signal-store', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('dismiss+read 往返; 只存字符串 id', () => {
    dismissContextSignal('signal_3c');
    dismissContextSignal('signal_late_night');
    const ids = readDismissedContextSignals();
    expect(ids).toEqual(['signal_3c', 'signal_late_night']);
    for (const id of ids) expect(typeof id).toBe('string');
  });

  it('幂等: 重复 dismiss 不重复写', () => {
    dismissContextSignal('a');
    dismissContextSignal('a');
    dismissContextSignal('a');
    expect(readDismissedContextSignals()).toEqual(['a']);
  });

  it('空 entryId 直接忽略', () => {
    dismissContextSignal('');
    expect(readDismissedContextSignals()).toEqual([]);
  });

  it('读防御: 坏 JSON/非数组/坏元素 → []', () => {
    window.sessionStorage.setItem('symy_context_signal_dismissed', '{bad');
    expect(readDismissedContextSignals()).toEqual([]);
    window.sessionStorage.setItem('symy_context_signal_dismissed', '"str"');
    expect(readDismissedContextSignals()).toEqual([]);
    window.sessionStorage.setItem('symy_context_signal_dismissed', JSON.stringify(['ok', 42, null, 'fine']));
    expect(readDismissedContextSignals()).toEqual(['ok', 'fine']); // 非字符串滤掉
  });

  it('隐私模式抛错 → 静默降级', () => {
    const boom = () => {
      throw new Error('denied');
    };
    Object.defineProperty(window, 'sessionStorage', { value: { getItem: boom, setItem: boom }, configurable: true });
    expect(() => dismissContextSignal('x')).not.toThrow();
    expect(readDismissedContextSignals()).toEqual([]);
  });
});
