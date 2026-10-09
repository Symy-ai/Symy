// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = { current: 'balanced' as string };
vi.mock('@/hooks/use-guard-intensity', () => ({
  useGuardIntensity: () => ({
    guardIntensity: state.current,
    setGuardIntensity: (v: string) => {
      state.current = v;
    },
  }),
}));

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'profile.guardIntensityTitle': '守护强度',
    'profile.guardIntensityDesc': '选择小象守护你的力度',
    'profile.guardIntensityGentle': '温和',
    'profile.guardIntensityGentleDesc': '只在重大时刻提醒',
    'profile.guardIntensityBalanced': '平衡',
    'profile.guardIntensityBalancedDesc': '适度提醒',
    'profile.guardIntensityStrict': '严格',
    'profile.guardIntensityStrictDesc': '每一次都认真守护 (荣誉姿态)',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { GuardIntensitySetting } from '../guard-intensity-setting';

/**
 * guard-intensity-setting.tsx (60行) — 守护强度三档 (batch48-a)。
 *
 * 锁定:
 * - radiogroup 三档按 GUARD_INTENSITIES 渲染; aria-checked 随选中
 * - 点击 → setGuardIntensity; 选中态 class 切换
 * - 荣誉框架: strict 文案无羞辱表述 (管不住自己 类禁词)
 */
describe('GuardIntensitySetting 三档', () => {
  beforeEach(() => {
    state.current = 'balanced';
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('三档渲染 + aria-checked 随选中', () => {
    render(<GuardIntensitySetting />);
    const group = screen.getByTestId('guard-intensity-options');
    expect(group.getAttribute('role')).toBe('radiogroup');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('点击 → setGuardIntensity; 选中态 class (mock hook 不重渲染, 用初始 balanced 验)', () => {
    render(<GuardIntensitySetting />);
    fireEvent.click(screen.getByTestId('guard-intensity-strict'));
    expect(state.current).toBe('strict'); // mock 已收
    // 选中态 class 在初始 balanced 上验证 (mock hook 无响应式重渲染)
    const balanced = screen.getByTestId('guard-intensity-balanced');
    expect(balanced.className).toContain('border-cyan-500/60');
    expect(screen.getByTestId('guard-intensity-strict').className).not.toContain('border-cyan-500/60');
  });

  it('荣誉框架: 全文案无羞辱表述', () => {
    render(<GuardIntensitySetting />);
    const text = screen.getByTestId('guard-intensity-options').textContent ?? '';
    for (const bad of ['管不住', '缺乏自制', '失败者', '懒惰']) {
      expect(text).not.toContain(bad);
    }
    expect(text).toContain('荣誉姿态'); // strict 是荣誉选择
  });
});
