// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../pagination';

/**
 * pagination.tsx (129行) — shadcn 分页七件套。
 *
 * 锁定:
 * - nav aria-label=pagination 容器
 * - Link: isActive → aria-current=page+data-active
 * - Previous/Next aria-label 双向; Ellipsis aria-hidden
 */
describe('Pagination 七件套', () => {
  afterEach(() => cleanup());

  it('nav 容器 aria-label', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    const nav = document.querySelector('[data-slot="pagination"]') as HTMLElement;
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('pagination');
    expect(document.querySelector('ul[data-slot="pagination-content"]')).toBeTruthy();
    expect(document.querySelector('li[data-slot="pagination-item"]')).toBeTruthy();
  });

  it('Link isActive → aria-current+data-active', () => {
    render(
      <PaginationLink href="#2" isActive>2</PaginationLink>,
    );
    const a = screen.getByText('2');
    expect(a.getAttribute('aria-current')).toBe('page');
    expect(a.getAttribute('data-active')).toBe('true');
    expect(a.className).toContain('outline'); // active 变体
  });

  it('非 active → 无 aria-current', () => {
    render(<PaginationLink href="#3">3</PaginationLink>);
    expect(screen.getByText('3').getAttribute('aria-current')).toBeNull();
  });

  it('Previous/Next aria-label; Ellipsis aria-hidden+sr-only', () => {
    render(
      <PaginationContent>
        <PaginationPrevious href="#" />
        <PaginationEllipsis />
        <PaginationNext href="#" />
      </PaginationContent>,
    );
    expect(screen.getByLabelText('Go to previous page')).toBeTruthy();
    expect(screen.getByLabelText('Go to next page')).toBeTruthy();
    expect(screen.getByText('Previous')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    const ell = document.querySelector('[data-slot="pagination-ellipsis"]') as HTMLElement;
    expect(ell.getAttribute('aria-hidden')).toBe('true'); // JSX boolean 属性序列化为 'true'
    expect(screen.getByText('More pages')).toBeTruthy(); // sr-only 仍在 DOM
  });
});
