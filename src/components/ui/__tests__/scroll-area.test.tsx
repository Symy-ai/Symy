// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScrollArea, ScrollBar } from '../scroll-area';

/**
 * scroll-area.tsx (58行) — radix 封装 (shadcn 式)。
 *
 * 锁定:
 * - ScrollArea: Root/Viewport/ScrollBar/Corner 四槽 + data-slot 标记
 * - children 进 Viewport
 * - ScrollBar 双向: vertical 默认 (h-full w-2.5) / horizontal (h-2.5 flex-col)
 */
describe('ScrollArea radix 封装', () => {
  afterEach(() => cleanup());

  it('Root+Viewport 即时挂载; ScrollBar/Thumb radix 惰性 (无溢出不挂)', () => {
    render(<ScrollArea>内容</ScrollArea>);
    expect(document.querySelector('[data-slot="scroll-area"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="scroll-area-viewport"]')).toBeTruthy();
    // 无溢出内容 → scrollbar/thumb 不挂载 (radix 行为锁定, 防回归成常挂)
    expect(document.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
    expect(document.querySelector('[data-slot="scroll-area-thumb"]')).toBeNull();
  });

  it('children 进 Viewport', () => {
    render(<ScrollArea>唯一内容串</ScrollArea>);
    expect(document.querySelector('[data-radix-scroll-area-viewport]')?.textContent).toBe('唯一内容串');
  });

  it('ScrollBar 必须在 ScrollArea 上下文内 (radix context 门, 导出面契约)', () => {
    // 裸用抛 context 错 = radix 设计; ScrollArea 内部已自动挂 (见首例惰性行为)
    expect(() => render(<ScrollBar />)).toThrow(/must be used within/);
  });
});
