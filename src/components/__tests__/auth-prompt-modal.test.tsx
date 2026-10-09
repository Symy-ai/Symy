// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthPromptModal } from '../auth-prompt-modal';

const navMock = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navMock,
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
  }),
}));

// lucide-react: importOriginal 保真 (hoisted 工厂内禁 JSX)
vi.mock('lucide-react', async (importOriginal) => {
  const m = await importOriginal();
  return m;
});

const origHref = window.location.href;

describe('AuthPromptModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    // window.location.href 由 jsdom 控, happy-dom 下 restore 引用即可
    void origHref;
  });

  it('renders nothing when visible=false', () => {
    render(<AuthPromptModal visible={false} onClose={vi.fn()} />);
    expect(document.body.textContent).not.toContain('authPrompt');
  });

  it('renders general feature context by default (title + 3 benefits + CTAs)', () => {
    render(<AuthPromptModal visible onClose={vi.fn()} />);
    expect(screen.getByText('authPrompt.features.general.title')).toBeTruthy();
    expect(screen.getByText('authPrompt.features.general.description')).toBeTruthy();
    // 3 benefits 渲染
    expect(screen.getByText('authPrompt.features.general.benefit0')).toBeTruthy();
    expect(screen.getByText('authPrompt.features.general.benefit2')).toBeTruthy();
    // 双 CTA + disclaimer
    expect(screen.getByText('authPrompt.createFreeAccount')).toBeTruthy();
    expect(screen.getByText('authPrompt.alreadyHaveAccount')).toBeTruthy();
    expect(screen.getByText('authPrompt.disclaimer')).toBeTruthy();
  });

  it('chat feature renders chat-specific copy', () => {
    render(<AuthPromptModal visible feature="chat" onClose={vi.fn()} />);
    expect(screen.getByText('authPrompt.features.chat.title')).toBeTruthy();
    expect(screen.queryByText('authPrompt.features.general.title')).toBeNull();
  });

  it('unknown feature falls back to general context', () => {
    render(<AuthPromptModal visible feature="nonexistent_feature" onClose={vi.fn()} />);
    expect(screen.getByText('authPrompt.features.general.title')).toBeTruthy();
  });

  it('signup CTA navigates to /auth/signup', () => {
    render(<AuthPromptModal visible onClose={vi.fn()} />);
    const signupBtn = screen.getByText('authPrompt.createFreeAccount').closest('button') as HTMLElement;
    fireEvent.click(signupBtn);
    expect(navMock.push).toHaveBeenCalledWith('/auth/signup');
  });

  it('login CTA navigates to /auth/login', () => {
    render(<AuthPromptModal visible onClose={vi.fn()} />);
    const loginBtn = screen.getByText('authPrompt.alreadyHaveAccount').closest('button') as HTMLElement;
    fireEvent.click(loginBtn);
    expect(navMock.push).toHaveBeenCalledWith('/auth/login');
  });

  it('close button: 200ms fade then onClose (BUG-149 timer tracked)', () => {
    vi.useRealTimers();
    const onClose = vi.fn();
    render(<AuthPromptModal visible onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    // 200ms 内 onClose 未调 (fade-out 中)
    expect(onClose).not.toHaveBeenCalled();
    // isClosing 态: 容器 opacity-0
    const root = screen.getByRole('button', { name: 'common.close' }).closest('.fixed.inset-0') as HTMLElement;
    expect(root.className).toContain('opacity-0');
    vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 600 });
  });

  it('Escape key calls onClose immediately', () => {
    const onClose = vi.fn();
    render(<AuthPromptModal visible onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reopening resets isClosing state (BUG-42)', () => {
    vi.useRealTimers();
    const onClose = vi.fn();
    const { rerender } = render(<AuthPromptModal visible onClose={onClose} />);
    // 触发 closing 态但立即重开 (200ms 内)
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    rerender(<AuthPromptModal visible={false} onClose={onClose} />);
    rerender(<AuthPromptModal visible onClose={onClose} />);
    // 重开后非 closing 态: opacity-100
    const root = screen.getByRole('button', { name: 'common.close' }).closest('.fixed.inset-0') as HTMLElement;
    expect(root.className).toContain('opacity-100');
  });

  it('backdrop click triggers fade-close path', () => {
    vi.useRealTimers();
    const onClose = vi.fn();
    render(<AuthPromptModal visible onClose={onClose} />);
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/70') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled(); // 200ms 后才 onClose
    return vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 600 });
  });
});
