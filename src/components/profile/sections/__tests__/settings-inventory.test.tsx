/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsOverlay } from '../settings-overlay';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
    locale: 'en',
    setLocale: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 25,
    rateIsDefault: false,
    setHourlyRate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/lib/hooks/use-spending-cap', () => ({
  useSpendingCap: () => ({ data: undefined, refetch: vi.fn(() => Promise.resolve({})) }),
  useSpendingCapForm: () => ({ draft: '', setAmount: vi.fn() }),
}));

vi.mock('@/hooks/use-green-impact', () => ({
  useGreenImpact: () => ({
    data: { itemsSaved: 0, hoursReclaimed: 0, currentStreak: 0 },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/use-green-alt-adoption', () => ({
  useGreenAltAdoption: () => ({ total: 0 }),
}));

vi.mock('@/hooks/use-guard-style-profile', () => ({
  fetchGuardStyleEvents: () => Promise.resolve([]),
  useGuardStyleProfile: () => ({
    profile: null,
    savedEstimates: { guard: 0, alt: 0, reuse: 0 },
    isLoading: false,
  }),
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
  loadGuardPushProbe: () =>
    Promise.resolve({
      frequency: 'daily',
      channels: { missYou: true, dreamFund: true, challenge: true, weeklyGuardian: true },
    }),
}));

vi.mock('@/lib/push/use-push-notifications', () => ({
  usePushNotifications: () => ({
    isSupported: true,
    isSubscribed: false,
    isLoading: false,
    error: null,
    subscribe: vi.fn(() => Promise.resolve(false)),
    unsubscribe: vi.fn(() => Promise.resolve(false)),
  }),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

vi.mock('../../profile-parts', () => ({
  EmailConnectionSetting: () => <section data-testid="email-connection-setting" />,
}));

vi.mock('../../delete-account-button', () => ({
  DeleteAccountButton: () => <section data-testid="delete-account-button" />,
}));

vi.mock('@/lib/inventory-client', () => ({
  INVENTORY_QUERY_KEY: ['inventory'],
  fetchInventory: () => Promise.resolve({ inventoryEnabled: false, items: [] }),
  deleteInventoryItem: vi.fn(() => Promise.resolve()),
  groupInventoryItems: () => [],
}));

function renderSettingsOverlay() {
  function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(
      () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return render(
    <SettingsOverlay
      isDemo={false}
      hasCustomName
      displayName="Inventory User"
      onClose={vi.fn()}
      onOpenDisplayNameDialog={vi.fn()}
      greenPrefEnabled
      onToggleGreenPref={vi.fn()}
      emailConnections={[]}
      onDisconnectEmail={vi.fn()}
      isEmailMonitorEnabled={false}
      showComingSoonToast={vi.fn()}
      darkMode
      resolvedTheme="dark"
      onToggleDarkMode={vi.fn()}
      locale="en"
      setLocale={vi.fn()}
      showPremiumToastMsg={vi.fn()}
      onOpenFaqDialog={vi.fn()}
    />,
    { wrapper: Wrapper },
  );
}

describe('SettingsOverlay section inventory', () => {
  it('mounts the current settings sections exactly once', async () => {
    window.localStorage.clear();
    renderSettingsOverlay();

    const testIds = [
      'guard-control-index',
      'time-value-options',
      'guard-intensity-options',
      'guard-scope-categories',
      'night-window-options',
      'spending-cap-setting',
      'guard-policy-preview-setting',
      'guard-rule-coverage-setting',
      'guard-profile-export-block',
      'guard-data-management-block',
      'guardian-style-entry',
      'green-impact-dashboard',
      'inventory-list-card-disabled',
      'email-connection-setting',
      'delete-account-button',
    ];

    for (const testId of testIds) {
      expect(await screen.findAllByTestId(testId)).toHaveLength(1);
    }

    expect(screen.getByText('Green Preferences')).toBeDefined();
    expect(screen.getByText('Push Notifications')).toBeDefined();
  });

  it('mounts both current intensity selectors with disjoint persisted state', async () => {
    window.localStorage.clear();
    renderSettingsOverlay();

    expect(await screen.findAllByTestId('guard-intensity-options')).toHaveLength(1);
    expect(screen.getByText('Green intensity')).toBeDefined();

    fireEvent.click(screen.getByTestId('guard-intensity-strict'));
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    expect(window.localStorage.getItem('symy-green-prefs')).toBeNull();

    fireEvent.click(screen.getByText('Firm'));
    expect(window.localStorage.getItem('symy-green-prefs')).toBe(
      JSON.stringify({ intensity: 'firm', wording: 'cheerful', pushTheme: 'none' }),
    );
  });
});
