// @vitest-environment happy-dom
/**
 * GuardScopeSetting 设置区块交互测试 (batch53-b)
 *
 * 覆盖: 品类三态渲染、点击即保存 (localStorage)、刷新后保持 (重置单例重读)、
 * 专属守护地图小结随状态更新。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardScopeSetting } from '../guard-scope-setting';
import { _resetGuardScopeStateForTest, getGuardScope } from '@/hooks/use-guard-scope';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      ({
        'profile.guardScopeTitle': 'Guard scope',
        'profile.guardScopeDesc': 'You define your necessities',
        'profile.guardScopeStatsNote': 'Exempted categories leave the intercept denominator',
        'profile.guardScopeMapTitle': 'My guard map',
        'profile.guardScopeCatElectronics': 'Electronics',
        'profile.guardScopeCatClothing': 'Clothing',
        'profile.guardScopeCatBeauty': 'Beauty',
        'profile.guardScopeCatHome': 'Home',
        'profile.guardScopeCatFood': 'Food',
        'profile.guardScopeModeGuard': 'Guard',
        'profile.guardScopeModeExempt': 'Exempt',
        'profile.guardScopeModeStrict': 'Stricter',
        'profile.guardScopeMapSummary': `${values?.guarded}/${values?.exempt}/${values?.strict}`,
      })[key] || key,
  }),
}));

describe('GuardScopeSetting', () => {
  afterEach(() => {
    cleanup();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('渲染 5 品类 x 三态, 默认全部 guard', () => {
    render(<GuardScopeSetting />);
    for (const category of ['electronics', 'clothing', 'beauty', 'home', 'food']) {
      const guardBtn = screen.getByTestId(`guard-scope-${category}-guard`);
      expect(guardBtn.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId(`guard-scope-${category}-exempt`).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByTestId(`guard-scope-${category}-strict`).getAttribute('aria-checked')).toBe('false');
    }
  });

  it('专属守护地图小结渲染并随切换更新', () => {
    render(<GuardScopeSetting />);
    expect(screen.getByTestId('guard-scope-map')).toBeTruthy();
    // 默认 5 守护 / 0 豁免 / 0 加严
    expect(screen.getByTestId('guard-scope-map-summary').textContent).toBe('5/0/0');

    fireEvent.click(screen.getByTestId('guard-scope-food-exempt'));
    expect(screen.getByTestId('guard-scope-map-summary').textContent).toBe('4/1/0');
  });

  it('点击豁免即保存并持久化, 刷新后 (重置单例重读) 保持', () => {
    render(<GuardScopeSetting />);
    fireEvent.click(screen.getByTestId('guard-scope-beauty-exempt'));
    expect(screen.getByTestId('guard-scope-beauty-exempt').getAttribute('aria-checked')).toBe('true');

    const stored = window.localStorage.getItem('symy-guard-scope');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).beauty).toBe('exempt');

    _resetGuardScopeStateForTest();
    expect(getGuardScope().beauty).toBe('exempt');
    expect(getGuardScope().food).toBe('guard');
  });

  it('切回守护即时生效; 三态互斥', () => {
    render(<GuardScopeSetting />);
    fireEvent.click(screen.getByTestId('guard-scope-home-strict'));
    expect(screen.getByTestId('guard-scope-home-strict').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('guard-scope-home-guard'));
    expect(screen.getByTestId('guard-scope-home-guard').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('guard-scope-home-strict').getAttribute('aria-checked')).toBe('false');
    expect(JSON.parse(window.localStorage.getItem('symy-guard-scope') as string).home).toBe('guard');
  });
});
