// @vitest-environment happy-dom

/**
 * useWelcomeBack — absence >= 3 days 回归欢迎触发检测
 *
 * Contract:
 * - demo 模式永不触发;
 * - 间隔 <3 天: 只刷新 last-seen, 不触发;
 * - 间隔 >=3 天: 触发一次 (absenceDays = diffDays), 并立即更新 last-seen;
 * - localStorage 不可用: 静默降级 (返回 null, 不抛错);
 * - 首次访问 (无 last-seen): 不触发, 写入 last-seen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWelcomeBack } from '../use-welcome-back';

// Mock limit-window: 让测试可控
vi.mock('@/lib/limit-window', () => ({
  getLimitWindow: () => '2026-09-08',
}));

describe('useWelcomeBack', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('returns null and writes first window when no previous visit', () => {
    const { result } = renderHook(() => useWelcomeBack(false));
    expect(result.current.welcomeBack).toBeNull();
    expect(localStorage.getItem('symy-welcome-back-last-seen')).toBe('2026-09-08');
  });

  it('triggers after exactly 3 days absence', () => {
    // 3 天前
    localStorage.setItem('symy-welcome-back-last-seen', '2026-09-05');
    const { result } = renderHook(() => useWelcomeBack(false));
    expect(result.current.welcomeBack).toEqual({ absenceDays: 3 });
    // 触发后立即刷新 last-seen
    expect(localStorage.getItem('symy-welcome-back-last-seen')).toBe('2026-09-08');
  });

  it('triggers after more than 3 days absence', () => {
    localStorage.setItem('symy-welcome-back-last-seen', '2026-09-01');
    const { result } = renderHook(() => useWelcomeBack(false));
    expect(result.current.welcomeBack).toEqual({ absenceDays: 7 });
    expect(localStorage.getItem('symy-welcome-back-last-seen')).toBe('2026-09-08');
  });

  it('does not trigger after 2 days absence (refreshes last-seen only)', () => {
    localStorage.setItem('symy-welcome-back-last-seen', '2026-09-06');
    const { result } = renderHook(() => useWelcomeBack(false));
    expect(result.current.welcomeBack).toBeNull();
    expect(localStorage.getItem('symy-welcome-back-last-seen')).toBe('2026-09-08');
  });

  it('does not trigger in demo mode', () => {
    localStorage.setItem('symy-welcome-back-last-seen', '2026-09-01');
    const { result } = renderHook(() => useWelcomeBack(true));
    expect(result.current.welcomeBack).toBeNull();
    // demo 不写入 (保持原值)
    expect(localStorage.getItem('symy-welcome-back-last-seen')).toBe('2026-09-01');
  });

  it('silently degrades when localStorage is unavailable', () => {
    // Override getItem/setItem to throw
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('nope'); };

    const { result } = renderHook(() => useWelcomeBack(false));
    expect(result.current.welcomeBack).toBeNull();

    Storage.prototype.setItem = originalSetItem;
  });

  it('ack clears trigger and refreshes last-seen', () => {
    localStorage.setItem('symy-welcome-back-last-seen', '2026-09-05');
    const { result } = renderHook(() => useWelcomeBack(false));
    expect(result.current.welcomeBack).toEqual({ absenceDays: 3 });

    act(() => {
      result.current.ack();
    });

    expect(result.current.welcomeBack).toBeNull();
    expect(localStorage.getItem('symy-welcome-back-last-seen')).toBe('2026-09-08');
  });
});
