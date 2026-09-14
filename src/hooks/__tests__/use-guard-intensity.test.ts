// @vitest-environment happy-dom
/**
 * useGuardIntensity hook 单测 (batch48-a)
 *
 * 覆盖: localStorage 持久化 (写入后重读 = 刷新后保持)、损坏值降级 balanced、
 * 订阅通知、非组件路径 getGuardIntensity。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  _resetGuardIntensityStateForTest,
  getGuardIntensity,
  setGuardIntensity,
  useGuardIntensity,
} from '../use-guard-intensity';

describe('useGuardIntensity', () => {
  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
    window.localStorage.clear();
  });

  it('默认档 balanced (无存储时)', () => {
    const { result } = renderHook(() => useGuardIntensity());
    expect(result.current.guardIntensity).toBe('balanced');
  });

  it('选中即保存: 写 localStorage 且刷新后 (重置单例重读) 保持', () => {
    const { result } = renderHook(() => useGuardIntensity());
    act(() => result.current.setGuardIntensity('strict'));
    expect(result.current.guardIntensity).toBe('strict');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');

    // 模拟刷新: 单例重置后重新从 localStorage 读
    _resetGuardIntensityStateForTest();
    expect(getGuardIntensity()).toBe('strict');
  });

  it('损坏的存储值降级 balanced', () => {
    window.localStorage.setItem('symy-guard-intensity', 'banana');
    _resetGuardIntensityStateForTest();
    expect(getGuardIntensity()).toBe('balanced');
  });

  it('多个订阅者收到变更通知', () => {
    const a = renderHook(() => useGuardIntensity());
    const b = renderHook(() => useGuardIntensity());
    act(() => a.result.current.setGuardIntensity('gentle'));
    expect(b.result.current.guardIntensity).toBe('gentle');
  });

  it('非组件路径 getGuardIntensity 与 hook 同源', () => {
    setGuardIntensity('gentle');
    const { result } = renderHook(() => useGuardIntensity());
    expect(result.current.guardIntensity).toBe('gentle');
    expect(getGuardIntensity()).toBe('gentle');
  });
});
