// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'tabs.chat': '伙伴',
    'tabs.buddy': '成长',
    'tabs.defense': '守护林',
    'tabs.profile': '我的',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { TabBar } from '../tab-bar';

const baseProps = {
  activeTab: 'chat' as const,
  previousTab: 'buddy' as const,
  onTabClick: vi.fn(),
};

/**
 * tab-bar.tsx (93行) — Round 105 四 tab 底部导航 (Mirror/Gacha 入口已移 Buddy 页)。
 *
 * 锁定:
 * - 四 tab (chat/buddy/defense/profile — Round 105 架构锚)
 * - activeTab 高亮 + aria-current=page
 * - overlay 态 (monitor/family/butterfly) → previousTab 承接高亮
 * - 点击 → onTabClick + blur
 */
describe('TabBar 底部导航', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('四 tab 渲染 (Round 105 架构锚)', () => {
    render(<TabBar {...baseProps} />);
    for (const label of ['伙伴', '成长', '守护林', '我的']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('activeTab=chat → chat 高亮 aria-current, 其余无', () => {
    render(<TabBar {...baseProps} />);
    expect(screen.getByRole('button', { name: '伙伴' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: '我的' }).getAttribute('aria-current')).toBeNull();
  });

  it('overlay 态: activeTab=butterfly → previousTab=buddy 承接高亮', () => {
    render(<TabBar {...baseProps} activeTab={'butterfly' as never} previousTab="buddy" />);
    expect(screen.getByRole('button', { name: '成长' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: '伙伴' }).getAttribute('aria-current')).toBeNull();
  });

  it('点击 → onTabClick(tab.id)', () => {
    render(<TabBar {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: '守护林' }));
    expect(baseProps.onTabClick).toHaveBeenCalledWith('defense');
  });

  it('active emoji 弹性放大 (scale 1.15)', () => {
    render(<TabBar {...baseProps} />);
    const emoji = screen.getByRole('button', { name: '伙伴' }).querySelector('span');
    expect(emoji?.style.transform).toContain('scale(1.15)');
  });
});
