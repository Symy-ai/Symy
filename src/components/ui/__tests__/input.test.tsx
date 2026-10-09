// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Input } from '../input';

/**
 * input.tsx (21行) — shadcn 式输入框。
 *
 * 锁定:
 * - data-slot=input 原生元素 + type 透传
 * - 基础 class (h-9/focus ring/disabled 态)
 * - props 透传 (placeholder/disabled/value)
 */
describe('Input 封装', () => {
  afterEach(() => cleanup());

  it('data-slot+type 透传', () => {
    render(<Input type="email" />);
    const el = screen.getByRole('textbox');
    expect(el.getAttribute('data-slot')).toBe('input');
    expect(el.getAttribute('type')).toBe('email');
  });

  it('基础 class 锚', () => {
    render(<Input />);
    const cls = screen.getByRole('textbox').className;
    expect(cls).toContain('h-9');
    expect(cls).toContain('focus-visible:ring-[3px]');
    expect(cls).toContain('disabled:opacity-50');
  });

  it('props 透传 (placeholder/disabled)', () => {
    render(<Input placeholder="邮箱地址" disabled />);
    const el = screen.getByPlaceholderText('邮箱地址') as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });
});
