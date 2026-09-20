/**
 * @vitest-environment happy-dom
 *
 * Settings refactor safety net for the planned five default rows plus an
 * advanced disclosure. The final "advanced content currently renders" test is
 * intentionally expected to fail after the disclosure lands; invert it then.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
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

  it('currently renders advanced guard settings without expanding (invert after refactor)', () => {
    renderOverlay();
    expect(screen.getByTestId('guard-intensity-options')).toBeDefined();
    expect(screen.getByTestId('night-window-options')).toBeDefined();
    expect(screen.getByTestId('guard-scope-categories')).toBeDefined();
    expect(screen.getByText('Green intensity')).toBeDefined();
  });
});
