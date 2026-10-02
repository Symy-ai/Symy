// @vitest-environment happy-dom
// ProfileFooter + DemoSignupPrompt — profile 收尾组件（此前 0 测试）
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const t = (key: string, opts?: Record<string, unknown>) => {
  if (key === 'profile.memberSince' && opts && 'date' in opts) {
    return `You started buying yourself back ${opts.date}`;
  }
  if (opts && 'defaultValue' in opts) return String(opts.defaultValue);
  return key;
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t, locale: 'en' }),
}));

import { ProfileFooter } from '../profile-footer';

describe('ProfileFooter — 会员起点 + About 入口', () => {
  it('createdAt 存在 → 本地化日期进句子', () => {
    render(<ProfileFooter createdAt="2026-01-15T00:00:00Z" locale="en" onOpenAbout={() => {}} />);
    expect(screen.getByText(/You started buying yourself back/)).toBeTruthy();
    expect(screen.getByText(/January/)).toBeTruthy();
  });

  it('createdAt 缺失 → 默认 2025 兜底', () => {
    render(<ProfileFooter locale="en" onOpenAbout={() => {}} />);
    expect(screen.getByText(/2025/)).toBeTruthy();
  });

  it('About 按钮点击 → onOpenAbout', () => {
    const onOpenAbout = vi.fn();
    render(<ProfileFooter locale="en" onOpenAbout={onOpenAbout} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
  });
});
