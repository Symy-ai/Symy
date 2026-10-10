// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDemoFeed } from '../use-demo-feed';

describe('useDemoFeed', () => {
  it('mixes guardian stories at the configured interval', () => {
    const { result } = renderHook(() => useDemoFeed());

    for (let index = 0; index < 40; index += 1) {
      act(() => { result.current.addDemoNotification(); });
    }

    const stories = result.current.notifications.filter((item) => item.type === 'guardian-story');
    expect(stories).toHaveLength(10);
  });

  it('上限 50 裁剪: 60 次后 notifications 长度 = 50', () => {
    const { result } = renderHook(() => useDemoFeed());
    for (let i = 0; i < 60; i++) {
      act(() => { result.current.addDemoNotification(); });
    }
    expect(result.current.notifications).toHaveLength(50);
  });

  it('addDemoNotification 返回当次通知 (prepend 最新在前)', () => {
    const { result } = renderHook(() => useDemoFeed());
    let first: ReturnType<typeof result.current.addDemoNotification> | null = null;
    act(() => { first = result.current.addDemoNotification(); });
    expect(first).not.toBeNull();
    expect(result.current.notifications[0]).toBe(first);
  });

  it('非整 4 拍 → random 通知 (guardian 只在 tick%4===0)', () => {
    const { result } = renderHook(() => useDemoFeed());
    act(() => { result.current.addDemoNotification(); }); // tick 1
    act(() => { result.current.addDemoNotification(); }); // tick 2
    const early = result.current.notifications.filter((n) => n.type === 'guardian-story');
    expect(early).toHaveLength(0); // 前 3 拍无 guardian
  });
});
