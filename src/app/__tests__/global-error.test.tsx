// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const M = vi.hoisted(() => ({
  err: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: M.err } }));

import GlobalError from '../global-error';

/**
 * src/app/global-error.tsx (136行) — 根级错误边界 (REACT-14/H1 修件)。
 *
 * 锁定:
 * - locale 推断链: localStorage 优先 → NEXT_LOCALE cookie → en 兜底
 * - digest 显示 (有 digest 才渲染错误 ID)
 * - reset 重试按钮触发回调
 * - logger.error 上报
 */
function makeProps(digest?: string) {
  return {
    error: Object.assign(new Error('boom'), digest ? { digest } : {}),
    reset: vi.fn(),
  } as { error: Error & { digest?: string }; reset: () => void };
}

describe('GlobalError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = 'NEXT_LOCALE=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('默认 (无 locale) → en 文案 + logger 上报', () => {
    const props = makeProps();
    render(<GlobalError {...props} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(M.err).toHaveBeenCalledWith('[GlobalError]', props.error);
  });

  it('localStorage zh → 中文文案', () => {
    localStorage.setItem('symy-locale', 'zh');
    render(<GlobalError {...makeProps()} />);
    expect(screen.getByText('出错了')).toBeTruthy();
  });

  it('cookie NEXT_LOCALE=zh (无 localStorage) → 中文', () => {
    document.cookie = 'NEXT_LOCALE=zh';
    render(<GlobalError {...makeProps()} />);
    expect(screen.getByText('出错了')).toBeTruthy();
  });

  it('有 digest → 错误 ID 显示; 无 digest → 不渲染', () => {
    const { unmount } = render(<GlobalError {...makeProps('abc-123')} />);
    expect(screen.getByText(/abc-123/)).toBeTruthy();
    unmount();
    render(<GlobalError {...makeProps()} />);
    expect(screen.queryByText(/Error ID/i)).toBeNull();
  });

  it('重试按钮 → reset 触发; 返回首页链接 href=/', () => {
    const props = makeProps();
    render(<GlobalError {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(props.reset).toHaveBeenCalledTimes(1);
    const home = screen.getByRole('link', { name: /back to home/i }) as HTMLAnchorElement;
    expect(home.getAttribute('href')).toBe('/');
  });
});
