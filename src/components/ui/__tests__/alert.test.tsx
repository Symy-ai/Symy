// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Alert, AlertDescription, AlertTitle } from '../alert';

/**
 * alert.tsx (66行) — shadcn 式警示条三件套 (cva 变体)。
 *
 * 锁定:
 * - Alert: role=alert + data-slot; default/destructive 双变体 class
 * - AlertTitle/AlertDescription: data-slot + 内容透传
 * - className 合并 (cn 尾部追加)
 */
describe('Alert 三件套', () => {
  afterEach(() => cleanup());

  it('role=alert + data-slot=alert', () => {
    render(<Alert>内容</Alert>);
    const el = screen.getByRole('alert');
    expect(el.getAttribute('data-slot')).toBe('alert');
    expect(el.textContent).toBe('内容');
  });

  it('default 变体: bg-card; destructive: text-destructive', () => {
    const { unmount } = render(<Alert>默认</Alert>);
    expect(screen.getByRole('alert').className).toContain('bg-card');
    unmount();
    render(<Alert variant="destructive">危险</Alert>);
    expect(screen.getByRole('alert').className).toContain('text-destructive');
  });

  it('Title/Description: data-slot + 透传', () => {
    render(
      <Alert>
        <AlertTitle>标题</AlertTitle>
        <AlertDescription>描述文字</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText('标题').getAttribute('data-slot')).toBe('alert-title');
    expect(screen.getByText('描述文字').getAttribute('data-slot')).toBe('alert-description');
  });

  it('className 合并 (自定义尾部追加)', () => {
    render(<Alert className="my-custom">X</Alert>);
    expect(screen.getByRole('alert').className).toContain('my-custom');
    expect(screen.getByRole('alert').className).toContain('bg-card'); // 基础不丢
  });
});
