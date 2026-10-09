// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../sheet';

/**
 * sheet.tsx (143行) — radix Sheet 抽屉。
 *
 * 锁定 (受控 open 强制渲染 — R229 无头件定案):
 * - 四 side 变体 class (right 默认/left/top/bottom)
 * - showCloseButton=false → 无关闭钮
 * - Header/Footer 结构 + Title/Description
 */
describe('Sheet 抽屉', () => {
  afterEach(() => cleanup());

  it('受控 open: content 渲染+默认右侧变体', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>抽屉标题</SheetTitle>
            <SheetDescription>抽屉说明</SheetDescription>
          </SheetHeader>
          内容区
          <SheetFooter>底部</SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('抽屉标题')).toBeTruthy();
    expect(screen.getByText('抽屉说明')).toBeTruthy();
    expect(screen.getByText('底部')).toBeTruthy();
    const content = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
    expect(content.className).toContain('right-0'); // 默认 right
    expect(content.className).toContain('slide-in-from-right');
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeTruthy();
  });

  it('side=left/top/bottom 变体', () => {
    for (const side of ['left', 'top', 'bottom'] as const) {
      render(
        <Sheet open>
          <SheetContent side={side}>X</SheetContent>
        </Sheet>,
      );
      const content = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
      expect(content.className).toContain(`slide-in-from-${side}`);
      cleanup();
    }
  });

  it('showCloseButton=false → 无关闭钮 (sr-only Close 不存在)', () => {
    render(
      <Sheet open>
        <SheetContent showCloseButton={false}>无钮</SheetContent>
      </Sheet>,
    );
    expect(screen.queryByText('Close')).toBeNull(); // sr-only 无钮
  });

  it('默认含关闭钮 (sr-only Close)', () => {
    render(
      <Sheet open>
        <SheetContent>有钮</SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('Close')).toBeTruthy(); // sr-only
  });

  it('Trigger 存在性 (asChild 透传)', () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>开抽屉</button>
        </SheetTrigger>
        <SheetContent>内容</SheetContent>
      </Sheet>,
    );
    expect(screen.getByText('开抽屉')).toBeTruthy(); // 关闭态 content 不渲染
    expect(screen.queryByText('内容')).toBeNull();
  });
});
