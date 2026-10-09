// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../button';

/**
 * button.tsx (64行) — shadcn 式按钮 (cva 六变体×九尺寸)。
 *
 * 锁定:
 * - data-slot/variant/size 三 data 属性
 * - 六变体 class 分流 (default/destructive/outline/secondary/ghost/link)
 * - 尺寸分流 (default h-9 / icon size-9 / lg h-10)
 * - asChild → Slot.Root (渲染子元素而非 button)
 * - onClick + disabled 双态
 */
describe('Button cva 封装', () => {
  afterEach(() => cleanup());

  it('三 data 属性 (slot/variant/size)', () => {
    render(<Button>点我</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('data-slot')).toBe('button');
    expect(btn.getAttribute('data-variant')).toBe('default');
    expect(btn.getAttribute('data-size')).toBe('default');
  });

  it('六变体 class 分流', () => {
    const { } = render(<Button variant="destructive">D</Button>);
    expect(screen.getByRole('button').className).toContain('bg-destructive');
    cleanup();
    render(<Button variant="outline">O</Button>);
    expect(screen.getByRole('button').className).toContain('bg-background');
    cleanup();
    render(<Button variant="secondary">S</Button>);
    expect(screen.getByRole('button').className).toContain('bg-secondary');
    cleanup();
    render(<Button variant="ghost">G</Button>);
    expect(screen.getByRole('button').className).toContain('hover:bg-accent');
    cleanup();
    render(<Button variant="link">L</Button>);
    expect(screen.getByRole('button').className).toContain('hover:underline');
  });

  it('尺寸分流 (default h-9 / icon size-9 / lg h-10)', () => {
    const { } = render(<Button>A</Button>);
    expect(screen.getByRole('button').className).toContain('h-9');
    cleanup();
    render(<Button size="icon">I</Button>);
    expect(screen.getByRole('button').className).toContain('size-9');
    cleanup();
    render(<Button size="lg">L</Button>);
    expect(screen.getByRole('button').className).toContain('h-10');
  });

  it('asChild → Slot.Root (渲染锚子元素, 非 button)', () => {
    render(
      <Button asChild>
        <a href="/x">锚链接</a>
      </Button>,
    );
    expect(screen.queryByRole('button')).toBeNull(); // 无 button
    const link = screen.getByRole('link');
    expect(link.getAttribute('data-slot')).toBe('button'); // 属性透传到 Slot 子元素
    expect(link.className).toContain('bg-primary'); // variant class 也透传
  });

  it('onClick + disabled', () => {
    const onClick = vi.fn();
    const { } = render(<Button onClick={onClick}>可点</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    cleanup();
    render(<Button onClick={onClick} disabled>禁用</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1); // 未增
    expect(screen.getByRole('button').className).toContain('disabled:opacity-50');
  });
});
