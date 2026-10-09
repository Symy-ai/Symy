// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog';

/**
 * dialog.tsx (158行) — radix Dialog 对话框。
 *
 * 锁定 (受控 open — R229 定案):
 * - 居中定位 class (50%/translate)
 * - showCloseButton 开关门 (sr-only Close)
 * - Header/Footer/Title/Description 结构
 * - 关闭态不渲染
 */
describe('Dialog 对话框', () => {
  afterEach(() => cleanup());

  it('受控 open: 居中定位+结构四件', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>说明</DialogDescription>
          </DialogHeader>
          正文
          <DialogFooter>底部</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('标题').tagName).toBe('H2');
    expect(screen.getByText('说明').tagName).toBe('P');
    expect(screen.getByText('底部')).toBeTruthy();
    const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(content.className).toContain('top-[50%]');
    expect(content.className).toContain('translate-x-[-50%]');
    expect(content.className).toContain('zoom-in-95');
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeTruthy();
  });

  it('showCloseButton=false → 无 sr-only Close', () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>无钮</DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('Close')).toBeNull();
  });

  it('默认含关闭钮', () => {
    render(
      <Dialog open>
        <DialogContent>有钮</DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Close')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="dialog-close"]').length).toBeGreaterThanOrEqual(1);
  });

  it('关闭态: content 不渲染; Trigger/Close 存在性', () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button>打开</button>
        </DialogTrigger>
        <DialogContent>内容</DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('打开')).toBeTruthy();
    expect(screen.queryByText('内容')).toBeNull();
    expect(DialogClose).toBeTruthy();
  });
});
