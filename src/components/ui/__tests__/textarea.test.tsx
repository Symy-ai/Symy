// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Textarea } from '../textarea';

/**
 * textarea.tsx (18行) — shadcn 式文本域。
 *
 * 锁定:
 * - data-slot=textarea 原生元素
 * - 基础 class (field-sizing-content/min-h-16)
 * - props 透传 (placeholder/value/disabled)
 */
describe('Textarea 封装', () => {
  afterEach(() => cleanup());

  it('data-slot+原生 textarea', () => {
    render(<Textarea />);
    const ta = screen.getByRole('textbox');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.getAttribute('data-slot')).toBe('textarea');
  });

  it('基础 class 锚', () => {
    render(<Textarea />);
    expect(screen.getByRole('textbox').className).toContain('field-sizing-content');
    expect(screen.getByRole('textbox').className).toContain('min-h-16');
    expect(screen.getByRole('textbox').className).toContain('disabled:opacity-50');
  });

  it('props 透传 (placeholder/disabled)', () => {
    render(<Textarea placeholder="输入想法…" disabled />);
    const ta = screen.getByPlaceholderText('输入想法…') as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
  });
});
