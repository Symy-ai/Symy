// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';

/**
 * tabs.tsx (91行) — radix Tabs 封装四件套 (受控模式测)。
 *
 * 锁定:
 * - Tabs: data-slot/orientation (default horizontal)
 * - TabsList: data-variant (default/line)
 * - 受控切换: active trigger data-state=active; 非激活 content 不渲染 (radix 惰性)
 * - 点击 trigger 切换
 */
describe('Tabs radix 封装', () => {
  afterEach(() => cleanup());

  function setup(value = 'a', onValueChange?: (v: string) => void) {
    return render(
      <Tabs value={value} onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="a">甲</TabsTrigger>
          <TabsTrigger value="b">乙</TabsTrigger>
        </TabsList>
        <TabsContent value="a">内容甲</TabsContent>
        <TabsContent value="b">内容乙</TabsContent>
      </Tabs>,
    );
  }

  it('Tabs/TabsList data 属性 (orientation/variant 默认)', () => {
    setup();
    expect(document.querySelector('[data-slot="tabs"]')?.getAttribute('data-orientation')).toBe('horizontal');
    expect(document.querySelector('[data-slot="tabs-list"]')?.getAttribute('data-variant')).toBe('default');
  });

  it('受控: active trigger data-state; 非激活 content 惰性不渲染', () => {
    setup('a');
    expect(screen.getByText('甲').getAttribute('data-state')).toBe('active');
    expect(screen.getByText('乙').getAttribute('data-state')).toBe('inactive');
    expect(screen.getByText('内容甲')).toBeTruthy();
    expect(screen.queryByText('内容乙')).toBeNull(); // radix 惰性
  });

  it('点击 trigger → onValueChange + 状态转移', () => {
    const onValueChange = vi.fn();
    setup('a', onValueChange);
    // happy-dom 下 radix Tabs 激活依赖完整指针序列 (click 单发不触发)
    fireEvent.pointerDown(screen.getByText('乙'), { pointerType: 'mouse' });
    fireEvent.mouseDown(screen.getByText('乙'));
    fireEvent.click(screen.getByText('乙'));
    expect(onValueChange).toHaveBeenCalledWith('b');
    // 受控重渲染 value='b' → 状态转移 (受控模式: value 是唯一真相源)
    cleanup();
    setup('b');
    expect(screen.getByText('乙').getAttribute('data-state')).toBe('active');
    expect(screen.getByText('内容乙')).toBeTruthy();
    expect(screen.queryByText('内容甲')).toBeNull();
  });

  it('TabsList line 变体 class', () => {
    render(
      <Tabs value="a">
        <TabsList variant="line">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(document.querySelector('[data-slot="tabs-list"]')?.className).toContain('bg-transparent');
  });
});
