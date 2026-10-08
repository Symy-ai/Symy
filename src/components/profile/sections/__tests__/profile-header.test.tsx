// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.changeAvatar': '更换头像',
        'profile.editNameBtn': '编辑昵称',
        'profile.premiumBadge': 'Premium',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('next/image', () => ({
  default: (p: { src: string; alt: string }) => <img src={p.src} alt={p.alt} />,
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { createRef } from 'react';
import { ProfileHeader } from '../profile-header';

const baseProps = {
  displayName: '小明',
  displayEmail: 'x***@e.com',
  avatarInitial: '明',
  plan: 'free' as const,
  effectiveAvatarUrl: null,
  isUploadingAvatar: false,
  avatarError: null,
  isActive: true,
  fileInputRef: createRef<HTMLInputElement>(),
  onAvatarUpload: vi.fn(),
  onEditName: vi.fn(),
  hasCustomName: true,
};

/**
 * profile-header.tsx (111行) — 头像+名称+plan 徽章 (File Split Wave 1)。
 *
 * 锁定:
 * - 头像双态: URL 有 → Image / 无 → 首字母
 * - 头像点击 → file input click (uploading 时禁)
 * - Bug 9 fix: file input 仅 isActive 时渲染
 * - avatarError 展示
 */
describe('ProfileHeader 头部', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('首字母头像 (无 URL) + 名称邮箱', () => {
    render(<ProfileHeader {...baseProps} />);
    expect(screen.getByText('明')).toBeTruthy();
    expect(screen.getByText('小明')).toBeTruthy();
    expect(screen.getByText('x***@e.com')).toBeTruthy();
  });

  it('URL 头像 → img 渲染 (首字母不显示)', () => {
    render(<ProfileHeader {...baseProps} effectiveAvatarUrl="https://cdn.example.com/a.png" />);
    const img = screen.getByAltText('小明');
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.png');
  });

  it('头像点击 → file input click', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ProfileHeader {...baseProps} fileInputRef={ref} />);
    const spy = vi.fn();
    // input 在 DOM 中 (isActive=true) — spy 其 click:
    ref.current!.click = spy;
    fireEvent.click(screen.getByLabelText('更换头像'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Bug 9 fix: isActive=false → file input 不渲染', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ProfileHeader {...baseProps} isActive={false} fileInputRef={ref} />);
    expect(ref.current).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('avatarError 展示', () => {
    render(<ProfileHeader {...baseProps} avatarError="上传失败" />);
    expect(screen.getByText(/上传失败/)).toBeTruthy();
  });
});
