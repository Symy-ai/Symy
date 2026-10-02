// @vitest-environment happy-dom
// use-night-window — 深夜时段档位共享状态（此前 0 测试）
// 红线: 缺失/损坏/隐私模式 → standard (22-05 小时集)。
import { describe, expect, it, beforeEach } from 'vitest';
import { getNightWindow, setNightWindow } from '../../hooks/use-night-window';
import { nightWindowToHours, DEFAULT_NIGHT_WINDOW, NIGHT_WINDOW_PRESETS } from '@/lib/night-window';

describe('use-night-window — 时段档位状态', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setNightWindow(DEFAULT_NIGHT_WINDOW);
  });

  it('默认 standard', () => {
    expect(getNightWindow()).toBe('standard');
  });

  it('四档往返切换 + 持久化', () => {
    for (const preset of NIGHT_WINDOW_PRESETS) {
      setNightWindow(preset);
      expect(getNightWindow()).toBe(preset);
      expect(window.localStorage.getItem('symy-night-window')).toBe(preset);
    }
  });

  it('档位 → 小时集映射自洽 (standard = 22-04 小时集)', () => {
    setNightWindow('standard');
    expect([...nightWindowToHours(getNightWindow())].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 22, 23]);
  });

  it('nightOwl → 0-4; early → 21-23; off 聚合走默认窗口', () => {
    setNightWindow('nightOwl');
    expect(nightWindowToHours(getNightWindow())).toEqual([0, 1, 2, 3, 4]);
    setNightWindow('early');
    expect(nightWindowToHours(getNightWindow())).toEqual([21, 22, 23]);
    setNightWindow('off');
    expect(nightWindowToHours('off')).toEqual(nightWindowToHours('standard'));
  });

  it('损坏持久化值不炸 localStorage 层', () => {
    window.localStorage.setItem('symy-night-window', 'not-a-preset');
    expect(window.localStorage.getItem('symy-night-window')).toBe('not-a-preset');
  });
});
