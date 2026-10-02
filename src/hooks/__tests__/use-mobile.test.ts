// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useIsMobile } from '../../hooks/use-mobile';

type MutableMediaQueryList = MediaQueryList & {
  media: string;
  matches: boolean;
};

function setViewport(width: number) {
  vi.stubGlobal('innerWidth', width);
}

function installMatchMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql: MutableMediaQueryList = {
    media: '(max-width: 767px)',
    matches,
    onchange: null,
    addEventListener: vi.fn((type, listener) => {
      if (type === 'change') listeners.add(listener as (event: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((type, listener) => {
      if (type === 'change') listeners.delete(listener as (event: MediaQueryListEvent) => void);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as MutableMediaQueryList;
  const matchMedia = vi.fn(() => mql);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    mql,
    change(width: number) {
      setViewport(width);
      mql.matches = width < 768;
      for (const listener of listeners) {
        listener({ matches: mql.matches } as MediaQueryListEvent);
      }
    },
    listeners,
  };
}

describe('useIsMobile — 断点状态与监听生命周期', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('窄视口 → true (effect 同步读 innerWidth)', () => {
    setViewport(320);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('SSR/无 matchMedia 环境保持默认 false', () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    setViewport(320);

    try {
      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: windowDescriptor?.value });
    }
  });

  it('effect 后按 768px 断点判定初始状态', () => {
    setViewport(768);
    const desktop = installMatchMedia(false);
    const desktopHook = renderHook(() => useIsMobile());
    expect(desktopHook.result.current).toBe(false);
    expect(desktop.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');

    cleanup();
    setViewport(767);
    installMatchMedia(true);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });

  it('媒体查询变化时同步切换状态', () => {
    setViewport(800);
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.change(767));
    expect(result.current).toBe(true);

    act(() => media.change(768));
    expect(result.current).toBe(false);
  });

  it('卸载时移除 change 监听', () => {
    setViewport(800);
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    const listenerCount = media.listeners.size;
    expect(listenerCount).toBe(1);

    unmount();
    expect(media.mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(media.listeners.size).toBe(0);
  });
});
