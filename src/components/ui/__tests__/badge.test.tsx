// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from '../badge';

/**
 * badge.tsx (48行) — shadcn 式徽标 (cva 六变体)。
 *
 * 锁定:
 * - span 渲染 + data-slot/variant
 * - 六变体 class 分流
 * - asChild → Slot.Root (锚子元素, 非 span)
 * - className 合并
 */
describe('Badge cva 封装', () => {
  afterEach(() => cleanup());

  it('span + 双 data 属性', () => {
    render(<Badge>新版</Badge>);
    const el = screen.getByText('新版');
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('data-slot')).toBe('badge');
    expect(el.getAttribute('data-variant')).toBe('default');
  });

  it('六变体 class 分流', () => {
    const variants: Array<[string, string]> = [
      ['default', 'bg-primary'],
      ['secondary', 'bg-secondary'],
      ['destructive', 'bg-destructive'],
      ['outline', 'border-border'],
      ['ghost', 'hover:bg-accent'],
      ['link', 'hover:underline'],
    ];
    for (const [variant, cls] of variants) {
      render(<Badge variant={variant as never}>V</Badge>);
      expect(screen.getByText('V').className).toContain(cls);
      cleanup();
    }
  });

  it('asChild → Slot.Root (锚子元素, 无 span)', () => {
    render(
      <Badge asChild>
        <a href="/x">锚徽标</a>
      </Badge>,
    );
    const link = screen.getByRole('link');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('data-slot')).toBe('badge');
    expect(link.className).toContain('bg-primary');
  });

  it('className 合并', () => {
    render(<Badge className="my-extra">X</Badge>);
    const cls = screen.getByText('X').className;
    expect(cls).toContain('my-extra');
    expect(cls).toContain('rounded-full'); // 基础不丢
  });
});
