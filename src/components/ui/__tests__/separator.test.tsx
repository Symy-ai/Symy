// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Separator } from '../separator';

/**
 * separator.tsx (28行) — radix 分隔线封装。
 *
 * 锁定:
 * - data-slot + 默认 horizontal/decorative
 * - 双向 orientation 属性透传 (data-orientation)
 * - className 合并
 */
describe('Separator radix 封装', () => {
  afterEach(() => cleanup());

  it('data-slot + 默认 horizontal + decorative', () => {
    render(<Separator />);
    const el = document.querySelector('[data-slot="separator"]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('data-orientation')).toBe('horizontal');
    expect(el.getAttribute('role')).toBe('none'); // decorative → role=none
  });

  it('vertical 换向', () => {
    render(<Separator orientation="vertical" />);
    expect((document.querySelector('[data-slot="separator"]') as HTMLElement).getAttribute('data-orientation')).toBe('vertical');
  });

  it('非 decorative → role=separator (语义分隔)', () => {
    render(<Separator decorative={false} />);
    expect((document.querySelector('[data-slot="separator"]') as HTMLElement).getAttribute('role')).toBe('separator');
  });
});
