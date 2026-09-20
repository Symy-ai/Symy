/**
 * @vitest-environment happy-dom
 *
 * Settings refactor safety net for the five default rows plus an advanced
 * disclosure. batch95-a landed the disclosure: the former "advanced content
 * currently renders" pin is inverted to "collapsed by default, rendered on
 * expand", and the green intensity selector stays deduplicated away (99-d).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsOverlay } from '../settings-overlay';
import {
  _resetGuardIntensityStateForTest,
} from '@/hooks/use-guard-intensity';
import { _resetNightWindowStateForTest } from '@/hooks/use-night-window';
import { _resetGuardScopeStateForTest } from '@/hooks/use-guard-scope';

const t = vi.fn((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key);

vi.mock('@/hooks/use-buddy-state-rq', () => ({
  useBuddyStateRQ: () => ({
    buddyState: { streak: 0, badges: [] },
  }),
}));
vi.mock('@/lib/hooks/use-spending-cap', () => ({
  useSpendingCap: () => ({ data: undefined, refetch: vi.fn(() => Promise.resolve({})) }),
  useSpendingCapForm: () => ({ draft: '', setAmount: vi.fn() }),
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t, locale: 'en', setLocale: vi.fn() }),
}));
vi.mock('@/hooks/use-green-prefs', () => ({
  useGreenPrefs: () => ({
    prefs: { intensity: 'balanced', wording: 'cheerful', pushTheme: 'none' },
    setGreenPrefField: vi.fn(),
    resetGreenPrefs: vi.fn(() => Promise.resolve()),
  }),
  // batch95-a: overlay 挂载时跑强度收敛迁移, 迁移模块消费这两个导出
  getGreenPrefs: () => ({ intensity: 'balanced', wording: 'cheerful', pushTheme: 'none' }),
  setGreenPrefField: vi.fn(),
}));
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, rateIsDefault: false, setHourlyRate: vi.fn(() => Promise.resolve()), isLoading: false }),
}));
vi.mock('@/lib/push/use-push-preferences', () => ({
  usePushPreferences: () => ({
    preferences: {
      missYou: true,
      dreamFund: true,
      challenge: true,
      weeklyGuardian: true,
      dailyAlgorithm: true,
      frequency: 'daily',
    },
    isLoaded: true,
    isSaving: false,
    justSaved: false,
    saveError: null,
    load: vi.fn(),
    save: vi.fn(),
  }),
}));
vi.mock('@/lib/guard-settings-probes', () => ({
  loadGuardCoverageProbe: () => Promise.resolve({ health: 'healthy', uncoveredCategories: 0 }),
  loadGuardEvidenceProbe: () => Promise.resolve({ totalEvents: 9 }),
  loadGuardPushProbe: () => Promise.resolve({
    frequency: 'daily',
    channels: { missYou: true, dreamFund: true, challenge: true, weeklyGuardian: true },
  }),
}));
vi.mock('../push-notification-settings', () => ({
  PushNotificationSettings: () => <div data-testid="push-notifications" />,
}));
vi.mock('@/components/profile/profile-parts', () => ({
  EmailConnectionSetting: () => <div data-testid="email-connection" />,
}));
vi.mock('../delete-account-button', () => ({
  DeleteAccountButton: () => <div data-testid="delete-account" />,
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const baseProps = {
  isDemo: false,
  hasCustomName: true,
  displayName: 'Test User',
  onClose: vi.fn(),
  onOpenDisplayNameDialog: vi.fn(),
  greenPrefEnabled: true,
  onToggleGreenPref: vi.fn(),
  emailConnections: [],
  onDisconnectEmail: vi.fn(() => Promise.resolve()),
  isEmailMonitorEnabled: false,
  showComingSoonToast: vi.fn(),
  darkMode: true,
  resolvedTheme: 'dark',
  onToggleDarkMode: vi.fn(),
  locale: 'en' as const,
  setLocale: vi.fn(),
  showPremiumToastMsg: vi.fn(),
  onOpenFaqDialog: vi.fn(),
};

function renderOverlay() {
  function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<SettingsOverlay {...baseProps} />, { wrapper: Wrapper });
}

describe('SettingsOverlay refactor readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
    fetchMock.mockReset();
  });

  it('renders stable default anchors on overlay mount', () => {
    const renderResult = renderOverlay();
    const root = renderResult.container.firstElementChild;
    expect(root).toBeDefined();
    const overlay = within(root as HTMLElement);
    expect(overlay.getByText(/profile\.displayNameDialogTitle/)).toBeDefined();
    expect(overlay.getByText('Green Guardian Mode')).toBeDefined();
    expect(overlay.getByText(/profile\.darkMode/)).toBeDefined();
    expect(overlay.getByText('Help & FAQ')).toBeDefined();
    expect(overlay.getByText('Send Feedback')).toBeDefined();
  });

  it('keeps advanced guard settings collapsed until disclosed (inverted after refactor)', () => {
    renderOverlay();
    // 折叠态: 高级守护设置不挂载
    expect(screen.queryByTestId('guard-intensity-options')).toBeNull();
    expect(screen.queryByTestId('night-window-options')).toBeNull();
    expect(screen.queryByTestId('guard-scope-categories')).toBeNull();
    expect(screen.queryByText('Green intensity')).toBeNull();

    // 展开后照常渲染; 绿色强度选择器已被去重删除 (99-d), 不随展开回来
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    expect(screen.getByTestId('guard-intensity-options')).toBeDefined();
    expect(screen.getByTestId('night-window-options')).toBeDefined();
    expect(screen.getByTestId('guard-scope-categories')).toBeDefined();
    expect(screen.queryByText('Green intensity')).toBeNull();
  });
});
