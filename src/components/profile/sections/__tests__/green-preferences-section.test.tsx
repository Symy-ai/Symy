// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-green-prefs', () => ({
  useGreenPrefs: () => ({
    prefs: { wording: 'cheerful', pushTheme: 'none' } as never,
    setGreenPrefField: mockSetField,
    resetGreenPrefs: mockReset,
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

const mockSetField = vi.fn();
const mockReset = vi.fn();

import { GreenPreferencesSection } from '../green-preferences-section';

const t = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'profile.greenPrefsTitle': '绿色偏好',
    'profile.greenPrefsWordingLabel': '话术风格',
    'profile.greenPrefsPushLabel': '推送主题',
    'profile.greenPrefsSave': '保存',
    'profile.greenPrefsLocked': '已锁定',
    'profile.greenPrefsUnlock': '锁定',
    'profile.greenPrefsResetLabel': '恢复默认',
    'profile.greenPrefsResetConfirm': '确定恢复默认？',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

function renderUI(locale = 'zh') {
  return render(<GreenPreferencesSection t={t} locale={locale} />);
}

/**
 * green-preferences-section.tsx (131行) — 绿色偏好冻结态区块 (99-d 收敛后)。
 *
 * 锁定:
 * - 99-d 定案: 只两组选项 (话术三档/推送三档), 无强度四档
 * - locale 切换 label 语言
 * - 选项点击 → setGreenPrefField
 * - 锁定切换双态
 * - 重置确认弹层 (99-d UX: 破坏性操作确认)
 */
describe('GreenPreferencesSection 绿色偏好', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('两组选项: 话术三档 (轻松鼓励/就事论事/直接提醒)', () => {
    renderUI();
    expect(screen.getByText('轻松鼓励')).toBeTruthy();
    expect(screen.getByText('就事论事')).toBeTruthy();
    expect(screen.getByText('直接提醒')).toBeTruthy();
  });

  it('推送三档 (标准/季节主题/守护季)', () => {
    renderUI();
    expect(screen.getByText('标准')).toBeTruthy();
    expect(screen.getByText('季节主题')).toBeTruthy();
    expect(screen.getByText('守护季')).toBeTruthy();
  });

  it('en locale → 英文 label', () => {
    renderUI('en');
    expect(screen.getByText('Cheerful')).toBeTruthy();
    expect(screen.getByText('Guardian')).toBeTruthy();
  });

  it('选项点击 → setGreenPrefField(field, value)', () => {
    renderUI();
    act(() => { fireEvent.click(screen.getByText('直接提醒')); });
    expect(mockSetField).toHaveBeenCalledWith('wording', 'direct');
    act(() => { fireEvent.click(screen.getByText('守护季')); });
    expect(mockSetField).toHaveBeenCalledWith('pushTheme', 'guardian');
  });

  it('锁定按钮双态切换', () => {
    renderUI();
    const btn = screen.getByText('锁定');
    act(() => { fireEvent.click(btn); });
    expect(screen.getByText('已锁定')).toBeTruthy();
  });

  it('重置: 先确认弹层, 确认后 resetGreenPrefs', () => {
    renderUI();
    act(() => { fireEvent.click(screen.getByText('恢复默认')); });
    expect(screen.getByText('确定恢复默认？')).toBeTruthy(); // 弹层出现
    expect(mockReset).not.toHaveBeenCalled(); // 未确认不重置
    act(() => { fireEvent.click(screen.getByText('profile.greenPrefsResetConfirmButton')); });
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
