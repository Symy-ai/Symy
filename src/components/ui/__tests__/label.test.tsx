// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Label } from '../label';

/**
 * label.tsx (24行) — radix Label 封装。
 *
 * 锁定:
 * - data-slot=label label 元素
 * - htmlFor 关联 (无障碍)
 * - disabled 联动 class (peer/group 态)
 */
describe('Label radix 封装', () => {
  afterEach(() => cleanup());

  it('label 元素+data-slot', () => {
    render(<Label>用户名</Label>);
    const el = screen.getByText('用户名');
    expect(el.tagName).toBe('LABEL');
    expect(el.getAttribute('data-slot')).toBe('label');
  });

  it('htmlFor 关联透传', () => {
    render(<Label htmlFor="email-input">邮箱</Label>);
    expect(screen.getByText('邮箱').getAttribute('for')).toBe('email-input');
  });

  it('disabled 联动 class (peer/group)', () => {
    render(<Label>L</Label>);
    const cls = screen.getByText('L').className;
    expect(cls).toContain('peer-disabled:opacity-50');
    expect(cls).toContain('group-data-[disabled=true]:opacity-50');
  });
});
