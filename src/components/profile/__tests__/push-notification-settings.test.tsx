// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushState = {
  isSupported: true,
  isSubscribed: false,
  isLoading: false,
  error: null as string | null,
  subscribe: vi.fn((_prefs: unknown) => Promise.resolve(true)),
  unsubscribe: vi.fn((_prefs: unknown) => Promise.resolve(true)),
};
const prefState = {
  preferences: { frequency: 'daily', challenge: true, weekly: true, milestone: false } as never,
  load: vi.fn(() => Promise.resolve()),
  save: vi.fn(() => Promise.resolve()),
  isSaving: false,
  justSaved: false,
  saveError: null as string | null,
};
vi.mock('@/lib/push/use-push-notifications', () => ({
  usePushNotifications: () => ({ ...pushState }),
}));
vi.mock('@/lib/push/use-push-preferences', () => ({
  usePushPreferences: () => ({ ...prefState }),
}));
vi.mock('@/lib/push/preferences', () => ({
  DEFAULT_PUSH_PREFERENCES: { frequency: 'daily', challenge: true, weekly: true, milestone: false },
}));
vi.mock('@/components/profile-parts/setting-components', () => ({
  SettingToggle: (p: { enabled: boolean; onToggle: () => void; label: string; disabled?: boolean }) => (
    <button data-testid={`toggle-${p.label}`} data-on={String(p.enabled)} data-disabled={String(p.disabled ?? false)} onClick={p.onToggle} />
  ),
}));
vi.mock('../push-preferences-panel', () => ({
  PushPreferencesPanel: (p: { preferences: unknown; onChange: (patch: unknown) => void; disabled?: boolean }) => (
    <div data-testid="panel" data-disabled={String(p.disabled ?? false)} onClick={() => p.onChange({ milestone: true })} />
  ),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { PushNotificationSettings } from '../push-notification-settings';

const t = (key: string) => {
  const map: Record<string, string> = {
    'profile.pushNotSupported': '当前浏览器不支持推送通知',
    'profile.pushNotifications': 'push-master',
  };
  return map[key] ?? key;
};

function renderUI() {
  return render(<PushNotificationSettings t={t} />);
}

/**
 * push-notification-settings.tsx (105行) — 推送设置两层结构 (batch60-b)。
 *
 * 锁定:
 * - demo → null; 不支持 → 错误行 (不伪造可编辑)
 * - 总开关: 未订阅→subscribe(草稿)+load; 已订阅→unsubscribe+locked
 * - 偏好改动双路: 已订阅 PATCH / 未订阅写草稿
 */
describe('PushNotificationSettings 推送设置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushState.isSupported = true;
    pushState.isSubscribed = false;
    pushState.subscribe.mockClear();
    pushState.subscribe.mockResolvedValue(true);
    pushState.unsubscribe.mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it('demo → null', () => {
    const { container } = render(<PushNotificationSettings t={t} isDemo />);
    expect(container.firstElementChild).toBeNull();
  });

  it('不支持 → 错误行, 偏好区不渲染', () => {
    pushState.isSupported = false;
    renderUI();
    expect(screen.getByText('当前浏览器不支持推送通知')).toBeTruthy();
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('未订阅开总开关 → subscribe(草稿偏好) + 服务端回显 load', async () => {
    renderUI();
    act(() => { fireEvent.click(screen.getByTestId('toggle-push-master')); });
    await waitFor(() => expect(pushState.subscribe).toHaveBeenCalledTimes(1));
    expect(pushState.subscribe).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'daily' }));
    expect(prefState.load).toHaveBeenCalledTimes(1);
  });

  it('偏好改动双路: 未订阅写草稿 (零 save)', () => {
    renderUI();
    act(() => { fireEvent.click(screen.getByTestId('panel')); });
    expect(prefState.save).not.toHaveBeenCalled();
  });

  it('已订阅偏好改动 → save(patch)', () => {
    pushState.isSubscribed = true;
    renderUI();
    act(() => { fireEvent.click(screen.getByTestId('panel')); });
    expect(prefState.save).toHaveBeenCalledWith({ milestone: true });
  });
});
