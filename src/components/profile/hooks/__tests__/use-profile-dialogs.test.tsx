// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => (key === 'profile.nameSaved' ? '名字已更新' : (opts?.defaultValue ?? key));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { useProfileDialogs } from '../use-profile-dialogs';

type Ret = ReturnType<typeof useProfileDialogs>;
const box: { current: Ret | null } = { current: null };
function Probe(props: Parameters<typeof useProfileDialogs>[0]) {
  box.current = useProfileDialogs(props);
  return null;
}

const base = {
  hasCustomName: false,
  userFullName: '小明',
  signOut: vi.fn(() => Promise.resolve()),
  setPremiumToast: vi.fn(),
  showPremiumToastMsg: vi.fn(),
};

/**
 * use-profile-dialogs.ts (66行) — Me 页弹层开关集中营 (Wave 1 搬运件)。
 *
 * 锁定:
 * - 五弹层初始全关
 * - openDisplayNameDialog: hasCustomName 决定 initial (真名 vs 空)
 * - handleDisplayNameSaved: 关弹层+toast+1.5s 后 reload (P1-4 修复锚)
 * - signOut 双步: click 开确认弹层; confirm 关+调 signOut
 */
describe('useProfileDialogs 弹层集中营', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete (window as { location?: unknown }).location;
    (window as unknown as { location: { reload: ReturnType<typeof vi.fn> } }).location = { reload: vi.fn() };
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('五弹层初始全关', () => {
    render(<Probe {...base} />);
    const r = box.current as Ret;
    expect(r.showAboutModal).toBe(false);
    expect(r.showSettingsOverlay).toBe(false);
    expect(r.showDisplayNameDialog).toBe(false);
    expect(r.showSignOutConfirm).toBe(false);
    expect(r.showFaqDialog).toBe(false);
  });

  it('openDisplayNameDialog: 有自定义名→真名; 无→空串', () => {
    const { unmount } = render(<Probe {...base} hasCustomName />);
    act(() => { (box.current as Ret).openDisplayNameDialog(); });
    expect((box.current as Ret).displayNameInitial).toBe('小明');
    expect((box.current as Ret).showDisplayNameDialog).toBe(true);
    unmount();
    render(<Probe {...base} hasCustomName={false} />);
    act(() => { (box.current as Ret).openDisplayNameDialog(); });
    expect((box.current as Ret).displayNameInitial).toBe('');
  });

  it('handleDisplayNameSaved: 关弹层+toast+1.5s reload (P1-4)', () => {
    render(<Probe {...base} />);
    act(() => { (box.current as Ret).handleDisplayNameSaved(); });
    expect((box.current as Ret).showDisplayNameDialog).toBe(false);
    expect(base.showPremiumToastMsg).toHaveBeenCalledWith('名字已更新');
    const reload = (window as unknown as { location: { reload: ReturnType<typeof vi.fn> } }).location.reload;
    expect(reload).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('signOut 双步: click 开确认弹; confirm 关+调 signOut', () => {
    render(<Probe {...base} />);
    act(() => { (box.current as Ret).handleSignOutClick(); });
    expect((box.current as Ret).showSignOutConfirm).toBe(true);
    act(() => { void (box.current as Ret).handleSignOutConfirm(); });
    expect((box.current as Ret).showSignOutConfirm).toBe(false);
    expect(base.signOut).toHaveBeenCalledTimes(1);
  });
});
