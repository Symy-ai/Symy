/**
 * Tests for use-drag-reorder.ts — Pointer Events based drag-reorder hook
 *
 * 🔧 PM3-P1-2 fix: 替代 HTML5 drag-and-drop (移动端不工作)
 *
 * Scenarios:
 * - mouse pointerdown on handle → 立即进入拖拽模式
 * - touch pointerdown on handle → 长按 300ms 后进入拖拽模式
 * - pointermove → 用 elementFromPoint 找到目标 fund
 * - pointerup → 执行 reorder + onToast
 * - disabled 时 onHandlePointerDown 不启动拖拽
 * - lockedIds 中的 id 不启动拖拽
 * - 拖拽结束后 wasDragJustEnded() 返回 true (250ms 内)
 * - 拖拽未移动 (pointerup 时未 dragOver) 不触发 reorder
 * - cleanup on unmount 清理 longPressTimer
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDragReorder } from '../use-drag-reorder';

// Helper: 创建 mock PointerEvent
function createPointerEvent(
  type: string,
  props: { pointerId?: number; pointerType?: string; button?: number; clientX?: number; clientY?: number; currentTarget?: Element }
): React.PointerEvent {
  const evt = {
    pointerId: props.pointerId ?? 1,
    pointerType: props.pointerType ?? 'mouse',
    button: props.button ?? 0,
    clientX: props.clientX ?? 0,
    clientY: props.clientY ?? 0,
    currentTarget: props.currentTarget ?? null,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    // currentTarget 可能是 null, 用 as 强转
  } as unknown as React.PointerEvent;
  return evt;
}

// Helper: 创建 mock element with closest + getAttribute
function createMockElement(fundId: string | null): Element {
  const el = {
    closest: vi.fn((selector: string) => {
      if (selector === '[data-fund-id]' && fundId) return el;
      return null;
    }),
    getAttribute: vi.fn((attr: string) => {
      if (attr === 'data-fund-id') return fundId;
      return null;
    }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  } as unknown as Element;
  return el;
}

describe('useDragReorder', () => {
  let originalElementFromPoint: typeof document.elementFromPoint;

  beforeEach(() => {
    vi.useFakeTimers();
    originalElementFromPoint = document.elementFromPoint;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.elementFromPoint = originalElementFromPoint;
    vi.restoreAllMocks();
  });

  const items = [
    { id: 'fund-a', name: 'A' },
    { id: 'fund-b', name: 'B' },
    { id: 'fund-c', name: 'C' },
  ];

  it('mouse pointerdown on handle → 立即进入拖拽模式 (无需长按)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    const handleEl = createMockElement('fund-a');
    const evt = createPointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      currentTarget: handleEl,
    });

    act(() => {
      result.current.onHandlePointerDown('fund-a')(evt);
    });

    // mouse 立即进入拖拽模式
    expect(result.current.draggedId).toBe('fund-a');
    expect(handleEl.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('touch pointerdown on handle → 长按 300ms 后进入拖拽模式', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    const handleEl = createMockElement('fund-a');
    const evt = createPointerEvent('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      currentTarget: handleEl,
    });

    act(() => {
      result.current.onHandlePointerDown('fund-a')(evt);
    });

    // 长按前不进入拖拽
    expect(result.current.draggedId).toBeNull();

    // 长按 300ms 后进入拖拽
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.draggedId).toBe('fund-a');
    expect(handleEl.setPointerCapture).toHaveBeenCalledWith(2);
  });

  it('touch pointerdown 但在 300ms 内移动 → 取消长按 (不进入拖拽)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    const handleEl = createMockElement('fund-a');
    const downEvt = createPointerEvent('pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      clientY: 100,
      currentTarget: handleEl,
    });

    act(() => {
      result.current.onHandlePointerDown('fund-a')(downEvt);
    });

    // 移动 10px (超过 5px 阈值)
    const moveEvt = createPointerEvent('pointermove', {
      pointerId: 3,
      pointerType: 'touch',
      clientY: 110,
    });
    act(() => {
      result.current.onPointerMove(moveEvt);
    });

    // 长按计时器应被清除
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.draggedId).toBeNull();
  });

  it('pointermove → 用 elementFromPoint 找到目标 fund → 设置 dragOverId', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    // 先进入拖拽模式
    const handleEl = createMockElement('fund-a');
    const downEvt = createPointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      currentTarget: handleEl,
    });
    act(() => {
      result.current.onHandlePointerDown('fund-a')(downEvt);
    });

    // mock elementFromPoint 返回 fund-c 的元素
    const fundCEl = createMockElement('fund-c');
    document.elementFromPoint = vi.fn(() => fundCEl);

    const moveEvt = createPointerEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 50,
      clientY: 200,
    });
    act(() => {
      result.current.onPointerMove(moveEvt);
    });

    expect(result.current.dragOverId).toBe('fund-c');
  });

  it('pointerup → 执行 reorder + onToast', () => {
    const onReorder = vi.fn();
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
        onToast,
        orderSavedMessage: 'Order saved ✓',
      })
    );

    // 进入拖拽模式
    const handleEl = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    // dragOver fund-c
    const fundCEl = createMockElement('fund-c');
    document.elementFromPoint = vi.fn(() => fundCEl);
    act(() => {
      result.current.onPointerMove(
        createPointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 200 })
      );
    });

    // pointerup
    act(() => {
      result.current.onPointerUp(
        createPointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    // reorder: fund-a 移到 fund-c 位置 → ['fund-b', 'fund-c', 'fund-a']
    expect(onReorder).toHaveBeenCalledWith(['fund-b', 'fund-c', 'fund-a']);
    expect(onToast).toHaveBeenCalledWith('Order saved ✓', 'success');
    expect(result.current.draggedId).toBeNull();
    expect(result.current.dragOverId).toBeNull();
  });

  it('pointerup 但未 dragOver → 不触发 reorder', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    const handleEl = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    // pointerup 但没有 dragOver
    act(() => {
      result.current.onPointerUp(
        createPointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('disabled=true → onHandlePointerDown 不启动拖拽', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
        disabled: true,
      })
    );

    const handleEl = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    expect(result.current.draggedId).toBeNull();
  });

  it('lockedIds 中的 id → onHandlePointerDown 不启动拖拽', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
        lockedIds: new Set(['fund-a']),
      })
    );

    const handleEl = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    expect(result.current.draggedId).toBeNull();
  });

  it('拖拽结束后 wasDragJustEnded() 返回 true (250ms 内)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    // 进入拖拽 + dragOver + pointerup
    const handleEl = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    const fundCEl = createMockElement('fund-c');
    document.elementFromPoint = vi.fn(() => fundCEl);
    act(() => {
      result.current.onPointerMove(
        createPointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 200 })
      );
    });

    act(() => {
      result.current.onPointerUp(
        createPointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', currentTarget: handleEl })
      );
    });

    expect(result.current.wasDragJustEnded()).toBe(true);

    // 250ms 后恢复 false
    act(() => {
      vi.advanceTimersByTime(251);
    });

    expect(result.current.wasDragJustEnded()).toBe(false);
  });

  it('cleanup on unmount 清理 longPressTimer (无 setState after unmount)', () => {
    const onReorder = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    // touch pointerdown 启动长按计时器
    const handleEl = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 5, pointerType: 'touch', currentTarget: handleEl })
      );
    });

    // unmount 前长按计时器还在 pending
    expect(result.current.draggedId).toBeNull();

    unmount();

    // 推进时间, 不应有 setState 报错
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // 不应有 React setState-after-unmount 警告
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('setState on unmounted')
    );

    consoleErrorSpy.mockRestore();
  });

  it('不同 pointerType 的 pointer 不互相干扰 (pointerId 隔离)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({
        items,
        getId: (f) => f.id,
        onReorder,
      })
    );

    // mouse pointer 1 启动拖拽 fund-a
    const handleElA = createMockElement('fund-a');
    act(() => {
      result.current.onHandlePointerDown('fund-a')(
        createPointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', currentTarget: handleElA })
      );
    });

    // touch pointer 2 尝试启动拖拽 fund-b (应被忽略, 因为已有 pointer 1 在拖拽)
    const handleElB = createMockElement('fund-b');
    act(() => {
      result.current.onHandlePointerDown('fund-b')(
        createPointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch', currentTarget: handleElB })
      );
    });

    // 长按 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // 仍然是 fund-a 在拖拽, fund-b 的 touch 被忽略
    expect(result.current.draggedId).toBe('fund-a');
  });
});
