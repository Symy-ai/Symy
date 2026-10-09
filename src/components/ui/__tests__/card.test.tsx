// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../card';

/**
 * card.tsx (92行) — shadcn 卡片七件套 (纯展示)。
 *
 * 锁定:
 * - 七件 data-slot 全标记
 * - 内容透传
 * - Card 基础 class (bg-card/rounded-xl/shadow-sm)
 * - className 合并
 */
describe('Card 七件套', () => {
  afterEach(() => cleanup());

  it('七件 data-slot 全标记 + 内容透传', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardDescription>描述</CardDescription>
          <CardAction>操作</CardAction>
        </CardHeader>
        <CardContent>正文</CardContent>
        <CardFooter>脚注</CardFooter>
      </Card>,
    );
    expect(screen.getByText('标题').getAttribute('data-slot')).toBe('card-title');
    expect(screen.getByText('描述').getAttribute('data-slot')).toBe('card-description');
    expect(screen.getByText('操作').getAttribute('data-slot')).toBe('card-action');
    expect(screen.getByText('正文').getAttribute('data-slot')).toBe('card-content');
    expect(screen.getByText('脚注').getAttribute('data-slot')).toBe('card-footer');
    expect(document.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="card-header"]')).toBeTruthy();
  });

  it('Card 基础 class', () => {
    render(<Card>X</Card>);
    const cls = document.querySelector('[data-slot="card"]')?.className ?? '';
    expect(cls).toContain('bg-card');
    expect(cls).toContain('rounded-xl');
    expect(cls).toContain('shadow-sm');
  });

  it('className 合并 (尾部追加不丢基础)', () => {
    render(<CardTitle className="my-title">T</CardTitle>);
    const cls = screen.getByText('T').className;
    expect(cls).toContain('my-title');
    expect(cls).toContain('font-semibold');
  });

  it('Header 含 action 时双栏 grid (has-data 响应式)', () => {
    render(
      <CardHeader>
        <CardTitle>T</CardTitle>
        <CardAction>A</CardAction>
      </CardHeader>,
    );
    const header = document.querySelector('[data-slot="card-header"]') as HTMLElement;
    expect(header.className).toContain('has-data-[slot=card-action]:grid-cols-[1fr_auto]');
  });
});
