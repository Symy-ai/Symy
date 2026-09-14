// @vitest-environment happy-dom
/**
 * GuardIntensitySetting 设置区块交互测试 (batch48-a)
 *
 * 覆盖: 三档渲染、点击选中即保存 (localStorage)、刷新后保持 (重置单例重读)。
 * happy-dom 表单坑: 走 click 路径 (memory)。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardIntensitySetting } from '../guard-intensity-setting';
import { _resetGuardIntensityStateForTest, getGuardIntensity } from '@/hooks/use-guard-intensity';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'profile.guardIntensityTitle': 'Guard intensity',
        'profile.guardIntensityDesc': 'How proactive Symy should be',
        'profile.guardIntensityGentle': 'Gentle',
        'profile.guardIntensityGentleDesc': 'One suggestion, no follow-ups',
        'profile.guardIntensityBalanced': 'Balanced (default)',
        'profile.guardIntensityBalancedDesc': 'Keep the current rhythm',
        'profile.guardIntensityStrict': 'Strict',
        'profile.guardIntensityStrictDesc': 'Follow up and invite a 24h micro challenge',
      })[key] || key,
  }),
}));

describe('GuardIntensitySetting', () => {
  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
    window.localStorage.clear();
  });

  it('渲染三档选项, 默认选中 balanced', () => {
    render(<GuardIntensitySetting />);
    expect(screen.getByTestId('guard-intensity-gentle')).toBeTruthy();
    expect(screen.getByTestId('guard-intensity-balanced')).toBeTruthy();
    expect(screen.getByTestId('guard-intensity-strict')).toBeTruthy();
    expect(screen.getByTestId('guard-intensity-balanced').getAttribute('aria-checked')).toBe('true');
  });

  it('点击 strict 即保存并持久化, 刷新后 (重置单例重读) 保持', () => {
    render(<GuardIntensitySetting />);
    fireEvent.click(screen.getByTestId('guard-intensity-strict'));
    expect(screen.getByTestId('guard-intensity-strict').getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');

    _resetGuardIntensityStateForTest();
    expect(getGuardIntensity()).toBe('strict');
  });

  it('切回 gentle 同样即时生效', () => {
    render(<GuardIntensitySetting />);
    fireEvent.click(screen.getByTestId('guard-intensity-strict'));
    fireEvent.click(screen.getByTestId('guard-intensity-gentle'));
    expect(screen.getByTestId('guard-intensity-gentle').getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('gentle');
  });
});
