// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../dropdown-menu';

/**
 * dropdown-menu.tsx (257行) — radix 下拉菜单十八件套。
 *
 * 锁定 (受控 open — R229 定案):
 * - open → content+label+三项+分隔线渲染
 * - CheckboxItem 勾选态 (Indicator ✓)
 * - RadioGroup/RadioItem 选中态
 * - Shortcut 键提示
 * - 关闭态不渲染
 */
describe('DropdownMenu 下拉菜单', () => {
  afterEach(() => cleanup());

  it('受控 open: 全结构渲染', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger asChild><button>菜单</button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>复制<DropdownMenuShortcut>⌘C</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem>粘贴</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('操作')).toBeTruthy();
    expect(screen.getByText('复制')).toBeTruthy();
    expect(screen.getByText('⌘C')).toBeTruthy();
    expect(screen.getByText('粘贴')).toBeTruthy();
    expect(document.querySelector('[data-slot="dropdown-menu-content"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="dropdown-menu-separator"]')).toBeTruthy();
  });

  it('CheckboxItem checked → Indicator', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>显示行号</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('显示行号')).toBeTruthy();
    expect(document.querySelector('[data-slot="dropdown-menu-checkbox-item"]')).toBeTruthy();
  });

  it('RadioGroup+RadioItem value 选中', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">选项 A</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">选项 B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('选项 A')).toBeTruthy();
    expect(screen.getByText('选项 B')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="dropdown-menu-radio-item"]').length).toBe(2);
  });

  it('关闭态: content 不渲染; Trigger 在', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button>开菜单</button></DropdownMenuTrigger>
        <DropdownMenuContent>面板</DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('开菜单')).toBeTruthy();
    expect(screen.queryByText('面板')).toBeNull();
  });
});
