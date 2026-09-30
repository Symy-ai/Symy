// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntryDismiss } from '../use-entry-dismiss';

/**
 * 🔒 use-entry-dismiss 回归锁 (2026-09-30, owner 需求: chat 顶部 4 卡可彻底关闭)
 * 语义: dismissed 持久到 sessionStorage (本会话), 新会话(存储清空)入口回归。
 */
describe('useEntryDismiss — chat 顶部入口彻底关闭', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('初始未关闭 → dismiss() 后 dismissed=true', () => {
    const { result } = renderHook(() => useEntryDismiss('weekly-review'));
    expect(result.current.dismissed).toBe(false);
    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);
  });

  it('dismiss 持久到 sessionStorage — 同 key 重新挂载仍关闭', () => {
    const { result, unmount } = renderHook(() => useEntryDismiss('guard-moments'));
    act(() => result.current.dismiss());
    unmount();
    const { result: r2 } = renderHook(() => useEntryDismiss('guard-moments'));
    expect(r2.current.dismissed).toBe(true);
  });

  it('不同 key 互不影响 — 关 A 不关 B', () => {
    const { result: ra } = renderHook(() => useEntryDismiss('active-guards'));
    act(() => ra.current.dismiss());
    const { result: rb } = renderHook(() => useEntryDismiss('guard-diary'));
    expect(rb.current.dismissed).toBe(false);
  });

  it('新会话(存储空)入口回归 — dismissed=false', () => {
    window.sessionStorage.clear();
    const { result } = renderHook(() => useEntryDismiss('weekly-review'));
    expect(result.current.dismissed).toBe(false);
  });
});
