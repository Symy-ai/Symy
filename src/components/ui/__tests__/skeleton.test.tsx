// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Skeleton } from '../skeleton';

/**
 * skeleton.tsx (13行) — 骨架块。
 *
 * 锁定: data-slot+pulse+bg-accent 基础; className 合并。
 */
describe('Skeleton 骨架块', () => {
  afterEach(() => cleanup());

  it('data-slot+pulse 基础 class', () => {
    render(<Skeleton />);
    const el = document.querySelector('[data-slot="skeleton"]') as HTMLElement;
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('bg-accent');
    expect(el.className).toContain('rounded-md');
  });

  it('className 合并', () => {
    render(<Skeleton className="h-4 w-full" />);
    expect((document.querySelector('[data-slot="skeleton"]') as HTMLElement).className).toContain('h-4');
  });
});
