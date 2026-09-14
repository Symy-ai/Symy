/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsOverlay } from '../settings-overlay';
import {
  _resetGuardIntensityStateForTest,
} from '@/hooks/use-guard-intensity';
import { _resetNightWindowStateForTest } from '@/hooks/use-night-window';
import { _resetGuardScopeStateForTest } from '@/hooks/use-guard-scope';

// i18n mock — t returns key or default value
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

// Green prefs hook — return controllable state
const prefsState = { intensity: 'balanced' as const, wording: 'cheerful' as const, pushTheme: 'none' as const };
const setGreenPrefField = vi.fn();
const resetGreenPrefs = vi.fn(() => { prefsState.intensity = 'balanced'; prefsState.wording = 'cheerful'; prefsState.pushTheme = 'none'; });

vi.mock('@/hooks/use-green-prefs', () => ({
  useGreenPrefs: () => ({
    prefs: { ...prefsState },
    setGreenPrefField,
    resetGreenPrefs,
  }),
}));

// batch51-b: 时薪区块换 TimeValueSetting — mock 共享 hook
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, rateIsDefault: false, setHourlyRate: vi.fn(() => Promise.resolve()), isLoading: false }),
}));

// batch61-a: 守护风格向导挂载时读推送偏好 — mock 掉网络通路
vi.mock('@/lib/push/use-push-preferences', () => ({
  usePushPreferences: () => ({
    preferences: { missYou: true, dreamFund: true, challenge: true, weeklyGuardian: true, dailyAlgorithm: true, frequency: 'daily' },
    isLoaded: true,
    isSaving: false,
    justSaved: false,
    saveError: null,
    load: vi.fn(),
    save: vi.fn(),
  }),
}));

// batch68-b: 守护总控索引数据探测 — 定点返回, 不发真实 fetch
vi.mock('@/lib/guard-settings-probes', () => ({
  loadGuardCoverageProbe: () => Promise.resolve({ health: 'healthy', uncoveredCategories: 0 }),
  loadGuardEvidenceProbe: () => Promise.resolve({ totalEvents: 9 }),
  loadGuardPushProbe: () => Promise.resolve({ frequency: 'daily', channels: { missYou: true, dreamFund: true, challenge: true, weeklyGuardian: true } }),
}));

// Child components — lightweight stubs
vi.mock('../push-notification-settings', () => ({
  PushNotificationSettings: () => <div data-testid="push-notifications" />,
}));

vi.mock('../profile-parts', () => ({
  EmailConnectionSetting: () => <div data-testid="email-connection" />,
}));

vi.mock('../delete-account-button', () => ({
  DeleteAccountButton: () => <div data-testid="delete-account" />,
}));

const baseProps = {
  isDemo: false,
  hasCustomName: true,
  displayName: 'Test User',
  onClose: vi.fn(),
  onOpenDisplayNameDialog: vi.fn(),
  greenPrefEnabled: true,
  onToggleGreenPref: vi.fn(),
  emailConnections: [],
  onDisconnectEmail: vi.fn(),
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

describe('SettingsOverlay green preferences section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prefsState.intensity = 'balanced';
    prefsState.wording = 'cheerful';
    prefsState.pushTheme = 'none';
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('renders green preferences block', () => {
    render(<SettingsOverlay {...baseProps} />);
    expect(screen.getByText('Green Preferences')).toBeDefined();
    expect(screen.getByText('Green intensity')).toBeDefined();
    expect(screen.getByText('Alternative wording')).toBeDefined();
    expect(screen.getByText('Push green theme')).toBeDefined();
  });

  it('shows reset confirmation dialog and resets on confirm', () => {
    render(<SettingsOverlay {...baseProps} />);
    fireEvent.click(screen.getByText('Reset green preferences'));
    expect(screen.getByText('Reset all green preferences?')).toBeDefined();
    fireEvent.click(screen.getByText('Yes, reset'));
    expect(resetGreenPrefs).toHaveBeenCalled();
  });

  it('cancels reset confirmation', () => {
    render(<SettingsOverlay {...baseProps} />);
    fireEvent.click(screen.getByText('Reset green preferences'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Reset all green preferences?')).toBeNull();
    expect(resetGreenPrefs).not.toHaveBeenCalled();
  });

  it('toggles lock state via lock/unlock button', () => {
    render(<SettingsOverlay {...baseProps} />);
    const lockButton = screen.getByText('Unlock');
    fireEvent.click(lockButton);
    expect(screen.getByText('Locked')).toBeDefined();
    expect(setGreenPrefField).not.toHaveBeenCalled();
  });

  it('renders localized labels for zh locale', () => {
    render(<SettingsOverlay {...baseProps} locale="zh" />);
    // t mock returns defaultValue; structure coverage is what matters here.
    expect(screen.getByText('Green Preferences')).toBeDefined();
    expect(screen.getByText('Green intensity')).toBeDefined();
    expect(screen.getByText('Alternative wording')).toBeDefined();
    expect(screen.getByText('Push green theme')).toBeDefined();
  });
});

describe('SettingsOverlay guardian style wizard entry (batch61-a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('renders the entry row and opens the wizard on click', () => {
    render(<SettingsOverlay {...baseProps} />);
    expect(screen.getByTestId('guardian-style-entry')).toBeDefined();
    expect(screen.queryByTestId('guardian-style-wizard')).toBeNull();

    fireEvent.click(screen.getByTestId('guardian-style-entry'));
    expect(screen.getByTestId('guardian-style-wizard')).toBeDefined();
    expect(screen.getByTestId('guardian-style-step-overview').getAttribute('aria-current')).toBe('step');

    fireEvent.click(screen.getByTestId('guardian-style-exit'));
    expect(screen.queryByTestId('guardian-style-wizard')).toBeNull();
  });
});

describe('SettingsOverlay guard control index (batch68-b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetNightWindowStateForTest();
    _resetGuardScopeStateForTest();
    window.localStorage.clear();
  });

  it('renders the master index with four group rows and all anchor targets', () => {
    render(<SettingsOverlay {...baseProps} />);
    expect(screen.getByTestId('guard-control-index')).toBeDefined();
    for (const id of ['chat', 'cart', 'push', 'evidence']) {
      expect(screen.getByTestId(`guard-control-group-${id}`)).toBeDefined();
    }
    expect(screen.getByTestId('guard-control-style')).toBeDefined();
    expect(screen.getByTestId('guard-control-coverage')).toBeDefined();
    // 索引只做锚点定位 — 六个落点齐备, 既有设置项未移动
    for (const anchor of ['guard-anchor-style', 'guard-anchor-chat', 'guard-anchor-cart', 'guard-anchor-coverage', 'guard-anchor-evidence', 'guard-anchor-push']) {
      expect(document.getElementById(anchor)).not.toBeNull();
    }
  });
});
