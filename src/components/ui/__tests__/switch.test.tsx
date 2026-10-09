// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from '../switch';

/**
 * switch.tsx (35行) — radix 开关封装 (受控模式测)。
 *
 * 锁定:
 * - data-slot=switch + thumb 双标记
 * - data-size (default/sm)
 * - role=switch + aria-checked
 * - 受控切换: 点击 → onCheckedChange
 */
describe('Switch radix 封装', () => {
  afterEach(() => cleanup());

  it('双 data-slot + role=switch', () => {
    render(<Switch checked={false} onCheckedChange={vi.fn()} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('data-slot')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[data-slot="switch-thumb"]')).toBeTruthy();
  });

  it('data-size 双档', () => {
    const { unmount } = render(<Switch checked={false} onCheckedChange={vi.fn()} />);
    expect(screen.getByRole('switch').getAttribute('data-size')).toBe('default');
    unmount();
    render(<Switch checked={false} onCheckedChange={vi.fn()} size="sm" />);
    expect(screen.getByRole('switch').getAttribute('data-size')).toBe('sm');
  });

  it('受控: aria-checked 反映; 点击 → onCheckedChange(true)', () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked onCheckedChange={onCheckedChange} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(false); // 当前 true → 请求 false
  });
});
