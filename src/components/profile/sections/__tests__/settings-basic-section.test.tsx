// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/profile-parts/setting-components', () => ({
  SettingToggle: (p: { enabled: boolean; onToggle: () => void; label: string; description: string }) => (
    <button data-testid={`toggle-${p.label}`} data-on={String(p.enabled)} data-desc={p.description} onClick={p.onToggle} />
  ),
  SettingLink: (p: { label: string; description?: string; onClick: () => void }) => (
    <button data-testid={`link-${p.label}`} onClick={p.onClick} />
  ),
}));
vi.mock('../../push-notification-settings', () => ({
  PushNotificationSettings: (p: { isDemo?: boolean }) => <div data-testid="push-settings" data-demo={String(p.isDemo)} />,
}));
vi.mock('@/components/profile-parts/inventory-list-card', () => ({
  InventoryListCard: () => <div data-testid="inventory-card" />,
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { SettingsBasicSection } from '../settings-basic-section';

const t = (key: string) => {
  const map: Record<string, string> = {
    'profile.displayNameDialogTitle': '显示昵称',
    'profile.setDisplayNameBtn': '设置昵称',
    'profile.greenPrefTitle': 'green-pref',
    'profile.greenPrefDesc': '开启时小象帮拦冲动消费',
    'profile.greenPrefOffNote': '关闭后小象不再主动拦截 (不影响历史记录)',
    'profile.darkMode': 'dark-mode',
    'profile.darkModeOn': '深色已开',
    'profile.lightModeOn': '浅色已开',
  };
  return map[key] ?? key;
};

const baseProps = {
  isDemo: false,
  hasCustomName: true,
  displayName: '小明',
  onClose: vi.fn(),
  onOpenDisplayNameDialog: vi.fn(),
  greenPrefEnabled: true,
  onToggleGreenPref: vi.fn(),
  darkMode: true,
  resolvedTheme: 'dark',
  onToggleDarkMode: vi.fn(),
  onOpenFaqDialog: vi.fn(),
  t,
};

/**
 * settings-basic-section.tsx (106行) — 小白三问默认区 (batch95-a 减法重设计)。
 *
 * 锁定:
 * - 五核心行: 昵称行/绿守护开关/推送/深色/物品清单卡
 * - 昵称行: 有名显名, 无名显「设置昵称」; 点击 onClose+openDialog
 * - 绿守护关闭 → offNote 说明 (只讲后果无道德审判)
 * - guard-anchor-chat/push 两个锚点在位 (batch68-b 总控跳转落点)
 */
describe('SettingsBasicSection 设置默认区', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('五核心行全在 (昵称/green-pref/push/dark-mode/inventory)', () => {
    render(<SettingsBasicSection {...baseProps} />);
    expect(screen.getByText('显示昵称')).toBeTruthy();
    expect(screen.getByTestId('toggle-green-pref')).toBeTruthy();
    expect(screen.getByTestId('push-settings')).toBeTruthy();
    expect(screen.getByTestId('toggle-dark-mode')).toBeTruthy();
    expect(screen.getByTestId('inventory-card')).toBeTruthy();
  });

  it('昵称行: 有名显名; 点击 → onClose+openDialog 链', () => {
    render(<SettingsBasicSection {...baseProps} />);
    expect(screen.getByText('小明')).toBeTruthy();
    fireEvent.click(screen.getByText('显示昵称').closest('button')!);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    expect(baseProps.onOpenDisplayNameDialog).toHaveBeenCalledTimes(1);
  });

  it('无名 → 「设置昵称」占位', () => {
    render(<SettingsBasicSection {...baseProps} hasCustomName={false} />);
    expect(screen.getByText('设置昵称')).toBeTruthy();
  });

  it('绿守护关闭 → offNote 出现 (无道德审判文案); 开启 → 无', () => {
    const { unmount } = render(<SettingsBasicSection {...baseProps} greenPrefEnabled={false} />);
    expect(screen.getByText(/不再主动拦截/)).toBeTruthy();
    unmount();
    render(<SettingsBasicSection {...baseProps} />);
    expect(screen.queryByText(/不再主动拦截/)).toBeNull();
  });

  it('深色开关: description 双态', () => {
    const { unmount } = render(<SettingsBasicSection {...baseProps} />);
    expect(screen.getByTestId('toggle-dark-mode').getAttribute('data-desc')).toBe('深色已开');
    unmount();
    render(<SettingsBasicSection {...baseProps} darkMode={false} resolvedTheme="light" />);
    expect(screen.getByTestId('toggle-dark-mode').getAttribute('data-desc')).toBe('浅色已开');
  });

  it('guard-anchor-chat/push 锚点在位 (batch68-b 跳转落点)', () => {
    render(<SettingsBasicSection {...baseProps} />);
    expect(document.getElementById('guard-anchor-chat')).toBeTruthy();
    expect(document.getElementById('guard-anchor-push')).toBeTruthy();
  });
});
