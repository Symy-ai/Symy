// @vitest-environment happy-dom
// DemoSignupPrompt — demo 模式注册引导（此前 0 测试）
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const navMock = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navMock,
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'defaultValue' in opts ? String(opts.defaultValue) : key,
    locale: 'zh',
  }),
}));
vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));
vi.mock('../feature-preview-section', () => ({
  FeaturePreviewSection: () => <div data-testid="feature-preview-stub" />,
}));

import { DemoSignupPrompt } from '../demo-signup-prompt';

describe('DemoSignupPrompt — 注册引导', () => {
  it('渲染欢迎语与解锁提示 (t key 直通)', () => {
    render(<DemoSignupPrompt />);
    expect(screen.getByText('profile.welcomeToSymy')).toBeTruthy();
    expect(screen.getByText('profile.signUpToUnlock')).toBeTruthy();
  });

  it('五个功能点齐全 (t key 直通)', () => {
    render(<DemoSignupPrompt />);
    expect(screen.getByText('profile.features.impulseProtection')).toBeTruthy();
    expect(screen.getByText('profile.features.personalCompanion')).toBeTruthy();
    expect(screen.getByText('profile.features.realInsights')).toBeTruthy();
    expect(screen.getByText('profile.features.smartRefund')).toBeTruthy();
    expect(screen.getByText('profile.features.companionHealth')).toBeTruthy();
  });

  it('CTA 按钮点击跳注册页', () => {
    render(<DemoSignupPrompt />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(navMock.push).toHaveBeenCalledWith('/auth/signup');
  });
});
