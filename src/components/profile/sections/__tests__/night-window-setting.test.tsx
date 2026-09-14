// @vitest-environment happy-dom
/**
 * NightWindowSetting 设置区块交互测试 (batch49-a)
 *
 * 覆盖: 四档渲染、默认选中 standard、点击选中即保存 (localStorage)、
 * 刷新后保持 (重置单例重读)、关闭档同样即时生效。
 * happy-dom 表单坑: 走 click 路径 (memory)。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NightWindowSetting } from '../night-window-setting';
import { _resetNightWindowStateForTest, getNightWindow } from '@/hooks/use-night-window';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'profile.nightWindowTitle': 'My Late-Night Hours',
        'profile.nightWindowDesc': 'Define when the banner shows',
        'profile.nightWindowEarly': 'Early sleeper',
        'profile.nightWindowEarlyDesc': '21:00–24:00 is my vulnerable window',
        'profile.nightWindowStandard': 'Standard (default)',
        'profile.nightWindowStandardDesc': '22:00–05:00 is my vulnerable window',
        'profile.nightWindowNightOwl': 'Night owl',
        'profile.nightWindowNightOwlDesc': '00:00–05:00 is my vulnerable window',
        'profile.nightWindowOff': 'Off',
        'profile.nightWindowOffDesc': 'No late-night banner',
      })[key] || key,
  }),
}));

describe('NightWindowSetting', () => {
  afterEach(() => {
    cleanup();
    _resetNightWindowStateForTest();
    window.localStorage.clear();
  });

  it('renders four presets with standard checked by default', () => {
    render(<NightWindowSetting />);
    for (const preset of ['early', 'standard', 'nightOwl', 'off'] as const) {
      expect(screen.getByTestId(`night-window-${preset}`)).toBeTruthy();
    }
    expect(screen.getByTestId('night-window-standard').getAttribute('aria-checked')).toBe('true');
  });

  it('clicking nightOwl persists to localStorage and survives a reload (singleton reset + re-read)', () => {
    render(<NightWindowSetting />);
    fireEvent.click(screen.getByTestId('night-window-nightOwl'));
    expect(screen.getByTestId('night-window-nightOwl').getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('symy-night-window')).toBe('nightOwl');

    _resetNightWindowStateForTest();
    expect(getNightWindow()).toBe('nightOwl');
  });

  it('choosing off takes effect immediately', () => {
    render(<NightWindowSetting />);
    fireEvent.click(screen.getByTestId('night-window-off'));
    expect(screen.getByTestId('night-window-off').getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('symy-night-window')).toBe('off');
  });

  it('switching back to standard restores the default', () => {
    render(<NightWindowSetting />);
    fireEvent.click(screen.getByTestId('night-window-early'));
    fireEvent.click(screen.getByTestId('night-window-standard'));
    expect(screen.getByTestId('night-window-standard').getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('symy-night-window')).toBe('standard');
  });
});
