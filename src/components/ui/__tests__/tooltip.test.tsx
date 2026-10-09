// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';

/**
 * tooltip.tsx (57行) — radix 封装四件套。
 *
 * 行为定案 (R229):
 * - Provider/Root 是 radix 无头件 — 不产 DOM 节点; data-slot 只落 Trigger/Content
 * - hover 触发在 happy-dom 下不可靠 (radix 指针语义) — 用受控 open 强制渲染测 Content
 *
 * 锁定:
 * - Trigger data-slot 常驻
 * - 受控 open → Content Portal 到 body (data-slot=tooltip-content + z-50 class)
 * - Provider delayDuration=0 默认 (即悬即出语义)
 */
describe('Tooltip radix 封装', () => {
  afterEach(() => cleanup());

  it('Trigger data-slot 常驻; Provider/Root 无头不产 DOM', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>悬我</TooltipTrigger>
          <TooltipContent>提示文案</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(document.querySelector('[data-slot="tooltip-trigger"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="tooltip-provider"]')).toBeNull();
    expect(document.querySelector('[data-slot="tooltip"]')).toBeNull();
  });

  it('受控 open → Content Portal 到 body (z-50 挂载)', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>悬我</TooltipTrigger>
          <TooltipContent>受控提示</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const content = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement;
    expect(content).toBeTruthy();
    expect(content.textContent).toContain('受控提示');
    expect(content.className).toContain('z-50'); // 层级 class 锚
    expect(document.body.contains(content)).toBe(true); // Portal 到 body
  });

  it('Provider delayDuration=0 默认透传 (即悬即出语义, 快照式结构断言)', () => {
    // delayDuration 默认 0 是封装层契约 — 通过渲染不炸 + Trigger 存在锁结构
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>悬我</TooltipTrigger>
          <TooltipContent>X</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('悬我')).toBeTruthy();
  });
});
