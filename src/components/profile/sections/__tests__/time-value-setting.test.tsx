// @vitest-environment happy-dom
/**
 * TimeValueSetting 设置区块交互测试 (batch51-b)
 *
 * 覆盖: 预设档渲染/点击即保存、自定义数字输入 Enter 提交并钳制 1–500、
 * 非数字输入提示。保存走 useHourlyRate 共享通道 (此处 mock)。
 * happy-dom 表单坑: 自定义输入走 Enter 提交路径。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimeValueSetting } from '../time-value-setting';

const rateState = { hourlyRate: 25 };
const setHourlyRate = vi.fn(() => Promise.resolve());

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'profile.timeValueTitle': 'My time is worth',
        'profile.timeValueDesc': 'Symy uses this number to turn what you save into free hours',
        'profile.timeValueCustom': 'Custom',
        'profile.timeValueCustomHint': 'Dollars per hour, 1–500',
        'profile.timeValueInvalid': 'Please enter a number',
        'profile.timeValueSaveFailed': 'Failed to save — please try again',
        'common.save': 'Save',
      })[key] || key,
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ ...rateState, rateIsDefault: false, setHourlyRate, isLoading: false }),
}));

describe('TimeValueSetting', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    rateState.hourlyRate = 25;
  });

  it('渲染三个预设档 + 自定义入口, 当前值档位高亮', () => {
    render(<TimeValueSetting />);
    expect(screen.getByTestId('time-value-preset-15')).toBeTruthy();
    expect(screen.getByTestId('time-value-preset-25')).toBeTruthy();
    expect(screen.getByTestId('time-value-preset-40')).toBeTruthy();
    expect(screen.getByTestId('time-value-preset-25').getAttribute('aria-pressed')).toBe('true');
  });

  it('点击预设档即通过共享通道保存', () => {
    render(<TimeValueSetting />);
    fireEvent.click(screen.getByTestId('time-value-preset-40'));
    expect(setHourlyRate).toHaveBeenCalledWith(40);
  });

  it('自定义输入 Enter 提交并钳制到 1–500', () => {
    render(<TimeValueSetting />);
    fireEvent.click(screen.getByTestId('time-value-custom'));
    fireEvent.change(screen.getByTestId('time-value-input'), { target: { value: '900' } });
    fireEvent.keyDown(screen.getByTestId('time-value-input'), { key: 'Enter' });
    expect(setHourlyRate).toHaveBeenCalledWith(500);

    fireEvent.change(screen.getByTestId('time-value-input'), { target: { value: '0.2' } });
    fireEvent.keyDown(screen.getByTestId('time-value-input'), { key: 'Enter' });
    expect(setHourlyRate).toHaveBeenCalledWith(1);
  });

  it('非数字输入显示提示且不保存', () => {
    render(<TimeValueSetting />);
    fireEvent.click(screen.getByTestId('time-value-custom'));
    fireEvent.change(screen.getByTestId('time-value-input'), { target: { value: 'abc' } });
    fireEvent.keyDown(screen.getByTestId('time-value-input'), { key: 'Enter' });
    expect(screen.getByTestId('time-value-invalid')).toBeTruthy();
    expect(setHourlyRate).not.toHaveBeenCalled();
  });

  it('非预设当前值时自定义入口高亮', () => {
    rateState.hourlyRate = 33;
    render(<TimeValueSetting />);
    expect(screen.getByTestId('time-value-custom').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('time-value-preset-25').getAttribute('aria-pressed')).toBe('false');
  });
});
