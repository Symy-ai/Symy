// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingLink, SettingToggle } from '../setting-components';

/**
 * setting-components.tsx (81行) — 设置行双件 (profile-tab 拆出)。
 *
 * 锁定:
 * - SettingToggle: 开关双态色/按钮点击 stopPropagation/行点击/禁用三路封死
 * - SettingLink: 编排+onClick+ChevronRight 图标
 */
describe('SettingToggle 开关行', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('开: 渐变底+右移圆点; 关: 玻璃底+左贴', () => {
    const onToggle = vi.fn();
    const { unmount } = render(<SettingToggle icon={<i />} label="推送" description="每日提醒" enabled onToggle={onToggle} />);
    const knob = document.querySelector('button > span') as HTMLElement;
    expect(knob.className).toContain('translate-x-5');
    expect((knob.parentElement as HTMLElement).className).toContain('from-cyan-500');
    unmount();
    render(<SettingToggle icon={<i />} label="推送" description="每日提醒" enabled={false} onToggle={onToggle} />);
    const knob2 = document.querySelector('button > span') as HTMLElement;
    expect(knob2.className).toContain('translate-x-0');
    expect((knob2.parentElement as HTMLElement).className).toContain('bg-glass-fill-strong');
  });

  it('行点击与按钮点击都触发 onToggle; 按钮冒泡不双触发', () => {
    const onToggle = vi.fn();
    render(<SettingToggle icon={<i />} label="推送" description="d" enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByText('推送').closest('div') as HTMLElement); // 行点击
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('button > span')?.parentElement as HTMLElement); // 按钮点击 (stopPropagation)
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('disabled: 行/按钮双封死 + 视觉态', () => {
    const onToggle = vi.fn();
    render(<SettingToggle icon={<i />} label="推送" description="d" enabled onToggle={onToggle} disabled />);
    const row = (screen.getByText('推送').closest('div') as HTMLElement).parentElement as HTMLElement;
    fireEvent.click(row);
    const btn = document.querySelector('button') as HTMLElement;
    fireEvent.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
    expect(row.className).toContain('cursor-not-allowed');
    expect(btn.getAttribute('disabled')).toBe('');
  });
});

describe('SettingLink 链接行', () => {
  afterEach(() => cleanup());

  it('编排 + 点击回调', () => {
    const onClick = vi.fn();
    render(<SettingLink icon={<i data-testid="ic" />} label="隐私政策" description="数据去向" onClick={onClick} />);
    expect(screen.getByText('隐私政策')).toBeTruthy();
    expect(screen.getByText('数据去向')).toBeTruthy();
    expect(screen.getByTestId('ic')).toBeTruthy();
    // lucide ChevronRight 渲染 (svg)
    expect(document.querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByText('隐私政策'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
