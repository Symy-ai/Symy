// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../alert-dialog';

/**
 * alert-dialog.tsx (196行) — radix 确认对话框 (owner 破坏性操作必确认 UI 基座)。
 *
 * 锁定 (受控 open — R229):
 * - size 双档 (default/sm → data-size)
 * - Title H2/Description P/Action·Cancel 按钮
 * - Media slot 渲染
 * - 关闭态不渲染
 */
describe('AlertDialog 确认框', () => {
  afterEach(() => cleanup());

  it('受控 open: 结构全件+居中', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><img alt="图" /></AlertDialogMedia>
            <AlertDialogTitle>确认删除?</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByText('确认删除?').tagName).toBe('H2');
    expect(screen.getByText('此操作不可撤销').tagName).toBe('P');
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy();
    const content = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement;
    expect(content.getAttribute('data-size')).toBe('default');
    expect(content.className).toContain('top-[50%]');
    expect(document.querySelector('[data-slot="alert-dialog-media"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="alert-dialog-overlay"]')).toBeTruthy();
  });

  it('size=sm → data-size=sm+窄宽 class', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent size="sm">窄</AlertDialogContent>
      </AlertDialog>,
    );
    const content = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement;
    expect(content.getAttribute('data-size')).toBe('sm');
    expect(content.className).toContain('data-[size=sm]:max-w-xs');
  });

  it('关闭态: content 不渲染; Trigger 存在', () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button>触发</button>
        </AlertDialogTrigger>
        <AlertDialogContent>内容</AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByText('触发')).toBeTruthy();
    expect(screen.queryByText('内容')).toBeNull();
  });
});
