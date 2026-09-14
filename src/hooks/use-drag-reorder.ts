/**
 * use-drag-reorder — Pointer Events based drag-reorder hook
 *
 * 替代 HTML5 drag-and-drop API (draggable/onDragStart/...), 因为后者在移动端不工作。
 * 本 hook 用 Pointer Events 统一处理 mouse + touch + pen, 移动端长按 300ms 进入拖拽模式
 * (避免误触), 桌面端鼠标按下立即拖拽。
 *
 * 设计要点:
 * - 长按检测: touch 时需长按 300ms + 移动阈值 5px 才进入拖拽 (避免点击/滚动误触)
 * - 鼠标: pointerdown 立即进入拖拽 (桌面端用户期望直接拖)
 * - setPointerCapture: 捕获 pointer, 即使移出元素也能继续接收 move/up 事件
 * - elementFromPoint: move 时找到当前 pointer 下的 fund card (data-fund-id)
 * - click 抑制: 拖拽结束后 200ms 内忽略 click (避免展开历史)
 *
 * 用法:
 *   const drag = useDragReorder({ items, getId: (f) => f.id, onReorder, onToast });
 *   <div
 *     data-fund-id={fund.id}
 *     onPointerDown={drag.onPointerDown(fund.id)}
 *     onPointerMove={drag.onPointerMove}
 *     onPointerUp={drag.onPointerUp}
 *     onPointerCancel={drag.onPointerUp}
 *   >
 *     <GripVertical onPointerDown={drag.onHandlePointerDown(fund.id)} />
 *   </div>
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseDragReorderOptions<T> {
  /** 当前 items 列表 */
  items: T[];
  /** 从 item 提取 id */
  getId: (item: T) => string;
  /** reorder 回调, 传入新的 id 顺序 */
  onReorder: (newOrder: string[]) => void;
  /** 拖拽完成后的 toast 回调 (可选) */
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** toast 消息 (可选) */
  orderSavedMessage?: string;
  /** 是否禁用拖拽 (如 demo 模式) */
  disabled?: boolean;
  /** 不可拖拽的 id 集合 (如 Savings fund 固定最后) */
  lockedIds?: Set<string>;
  /** 长按阈值 (ms), 默认 300, 仅 touch 生效 */
  longPressThreshold?: number;
  /** 移动阈值 (px), 超过才算拖拽 (避免误触), 默认 5 */
  moveThreshold?: number;
}

interface DragState {
  pointerId: number;
  pointerType: string;
  fundId: string;
  startY: number;
  startX: number;
  moved: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  isDragging: boolean;
}

export function useDragReorder<T>({
  items,
  getId,
  onReorder,
  onToast,
  orderSavedMessage,
  disabled = false,
  lockedIds,
  longPressThreshold = 300,
  moveThreshold = 5,
}: UseDragReorderOptions<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const stateRef = useRef<DragState | null>(null);
  const dragJustEndedRef = useRef(false);
  const dragJustEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      if (s?.longPressTimer) clearTimeout(s.longPressTimer);
      if (dragJustEndedTimerRef.current) clearTimeout(dragJustEndedTimerRef.current);
    };
  }, []);

  const isLocked = useCallback(
    (id: string) => lockedIds?.has(id) ?? false,
    [lockedIds]
  );

  /**
   * 在 drag handle (GripVertical) 上的 pointerdown — 启动拖拽流程
   * 返回一个事件处理器
   */
  const onHandlePointerDown = useCallback(
    (fundId: string) => (e: React.PointerEvent) => {
      if (disabled || isLocked(fundId)) return;
      // 只响应主按钮 (左键 / 触摸)
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      // 🔧 PM3-P1-2 fix: 如果已有活跃拖拽 (isDragging=true), 忽略新 pointerdown
      //   避免第二个 pointer 覆盖第一个的拖拽状态
      if (stateRef.current?.isDragging) return;

      e.stopPropagation(); // 防止冒泡到 fund card 的 click (展开历史)

      const state: DragState = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        fundId,
        startY: e.clientY,
        startX: e.clientX,
        moved: false,
        longPressTimer: null,
        isDragging: false,
      };

      // 桌面端鼠标: 立即进入拖拽
      if (e.pointerType === 'mouse') {
        state.isDragging = true;
        setDraggedId(fundId);
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          // setPointerCapture 可能失败 (元素已卸载), 忽略
        }
      } else {
        // 触摸/笔: 长按检测
        state.longPressTimer = setTimeout(() => {
          if (stateRef.current === state && !state.moved) {
            state.isDragging = true;
            setDraggedId(fundId);
            try {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            } catch {
              // 忽略
            }
          }
        }, longPressThreshold);
      }

      stateRef.current = state;
    },
    [disabled, isLocked, longPressThreshold]
  );

  /**
   * pointermove — 跟踪移动, 找到目标 fund
   */
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;

      const dy = e.clientY - state.startY;
      const dx = e.clientX - state.startX;
      const dist = Math.sqrt(dy * dy + dx * dx);

      // 移动超过阈值, 标记 moved (取消长按等待)
      if (!state.moved && dist > moveThreshold) {
        state.moved = true;
        if (state.longPressTimer) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        }
        // 触摸端: 移动了但还没进入拖拽 → 取消 (用户在滚动)
        if (state.pointerType !== 'mouse' && !state.isDragging) {
          stateRef.current = null;
          return;
        }
      }

      if (!state.isDragging) return;

      e.preventDefault(); // 防止滚动

      // 找到当前 pointer 下的 fund card
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const fundCard = (el as Element).closest('[data-fund-id]');
      if (!fundCard) {
        setDragOverId(null);
        return;
      }
      const targetId = fundCard.getAttribute('data-fund-id');
      if (!targetId || targetId === state.fundId || isLocked(targetId)) {
        setDragOverId(null);
        return;
      }
      setDragOverId(targetId);
    },
    [moveThreshold, isLocked]
  );

  /**
   * pointerup / pointercancel — 结束拖拽, 执行 reorder
   */
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;

      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        // 忽略
      }

      if (state.isDragging) {
        // 执行 reorder
        if (state.fundId && dragOverId && state.fundId !== dragOverId) {
          const ids = items.map(getId);
          const fromIdx = ids.indexOf(state.fundId);
          const toIdx = ids.indexOf(dragOverId);
          if (fromIdx !== -1 && toIdx !== -1) {
            ids.splice(fromIdx, 1);
            ids.splice(toIdx, 0, state.fundId);
            onReorder(ids);
            if (orderSavedMessage) {
              onToast?.(orderSavedMessage, 'success');
            }
          }
        }
        setDraggedId(null);
        setDragOverId(null);
        // 标记 drag just ended, 抑制后续 click
        dragJustEndedRef.current = true;
        if (dragJustEndedTimerRef.current) clearTimeout(dragJustEndedTimerRef.current);
        dragJustEndedTimerRef.current = setTimeout(() => {
          dragJustEndedRef.current = false;
          dragJustEndedTimerRef.current = null;
        }, 250);
      }

      stateRef.current = null;
    },
    [items, getId, onReorder, onToast, orderSavedMessage, dragOverId]
  );

  /** 外部读取: 是否刚结束拖拽 (用于抑制 click) */
  const wasDragJustEnded = useCallback(() => dragJustEndedRef.current, []);

  return {
    draggedId,
    dragOverId,
    onHandlePointerDown,
    onPointerMove,
    onPointerUp,
    wasDragJustEnded,
  };
}
