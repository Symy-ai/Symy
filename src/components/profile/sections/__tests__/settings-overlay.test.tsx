/**
 * @vitest-environment happy-dom
 *
 * batch95-a 迁移: 设置页两层结构 (小白默认区 + 高级折叠区)。
 * 按 /tmp/b99e-map.md 分类 — A 类断言仍成立; B 类改「折叠不渲染 + 展开渲染」;
 * C 类 (强度双份) 按去重定案改为唯一 guard-intensity-options 断言。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  // batch95-a: overlay 挂载时跑强度收敛迁移, 迁移模块消费这两个导出
  // (工厂被 hoist, 顶层 const 须惰性转发, 不可直接引用)
  getGreenPrefs: () => ({ ...prefsState }),
  getLegacyGreenIntensity: () => undefined,
  clearLegacyGreenIntensity: () => undefined,
  setGreenPrefField: (...args: Parameters<typeof setGreenPrefField>) => setGreenPrefField(...args),
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
// (路径须从 __tests__ 上跳两级到 profile/ — 旧文件的 '../x' 从未命中真实模块, batch95-a 修正)
vi.mock('../../push-notification-settings', () => ({
  PushNotificationSettings: () => <div data-testid="push-notifications" />,
}));

vi.mock('../../guardian-style-wizard', () => ({
  GuardianStyleWizard: () => <div data-testid="guardian-style-wizard" />,
}));

// 挂载即 fetch 的子面板 (GuardPolicyPreview / GuardRuleCoverage) — 全局 stub 掉 fetch,
// 不发真网络请求 (悬挂的在途 fetch 会被 happy-dom teardown abort 成 unhandled AbortError);
// 与 guard-rule-coverage-setting.test.tsx 同一模式, 默认无实现 → 组件走失败降级路径
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('../../profile-parts', () => ({
  EmailConnectionSetting: () => <div data-testid="email-connection" />,
}));

vi.mock('../../delete-account-button', () => ({
  DeleteAccountButton: () => <div data-testid="delete-account" />,
}));

// batch84-a: 物品清单卡挂默认区 — mock 数据通路, disabled 态 testid 稳定可断言
vi.mock('@/lib/inventory-client', () => ({
  INVENTORY_QUERY_KEY: ['inventory'],
  fetchInventory: () => Promise.resolve({ inventoryEnabled: false, items: [] }),
  deleteInventoryItem: vi.fn(() => Promise.resolve()),
  groupInventoryItems: () => [],
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

/** batch84-a: overlay 挂了物品清单卡 (React Query 消费者) — 与 app 根 QueryProvider 同构包装 */
function renderOverlay(props: Partial<Omit<typeof baseProps, 'locale'>> & { locale?: 'en' | 'zh' } = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<SettingsOverlay {...baseProps} {...props} />, { wrapper: Wrapper });
}

/** batch95-a: 高级区默认收起 — 需要触达高级内容的用例先展开 */
function expandAdvanced() {
  fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
}

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
    fetchMock.mockReset();
  });

  it('renders green preferences block after expanding advanced', async () => {
    renderOverlay();
    expect(screen.queryByText('Green Preferences')).toBeNull();
    expandAdvanced();
    expect(await screen.findByText('Green Preferences')).toBeDefined();
    expect(screen.getByText('Alternative wording')).toBeDefined();
    expect(screen.getByText('Push green theme')).toBeDefined();
    // batch95-a 去重: 绿色偏好区不再有独立强度选择 (强度唯一入口 = guard-intensity-options)
    expect(screen.queryByText('Green intensity')).toBeNull();
    expect(await screen.findAllByTestId('guard-intensity-options')).toHaveLength(1);
  });

  it('shows reset confirmation dialog and resets on confirm after expanding advanced', async () => {
    renderOverlay();
    expandAdvanced();
    fireEvent.click(await screen.findByText('Reset green preferences'));
    expect(screen.getByText('Reset all green preferences?')).toBeDefined();
    fireEvent.click(screen.getByText('Yes, reset'));
    expect(resetGreenPrefs).toHaveBeenCalled();
  });

  it('cancels reset confirmation', () => {
    renderOverlay();
    expandAdvanced();
    fireEvent.click(screen.getByText('Reset green preferences'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Reset all green preferences?')).toBeNull();
    expect(resetGreenPrefs).not.toHaveBeenCalled();
  });

  it('toggles lock state via lock/unlock button', async () => {
    renderOverlay();
    expandAdvanced();
    const lockButton = await screen.findByText('Unlock');
    fireEvent.click(lockButton);
    expect(screen.getByText('Locked')).toBeDefined();
    expect(setGreenPrefField).not.toHaveBeenCalled();
  });

  it('renders localized labels for zh locale', async () => {
    renderOverlay({ locale: "zh" });
    expandAdvanced();
    // t mock returns defaultValue; structure coverage is what matters here.
    expect(await screen.findByText('Green Preferences')).toBeDefined();
    expect(screen.getByText('Alternative wording')).toBeDefined();
    expect(screen.getByText('Push green theme')).toBeDefined();
    expect(screen.queryByText('Green intensity')).toBeNull();
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
    fetchMock.mockReset();
  });

  it('renders the entry row inside advanced and opens the wizard on click', async () => {
    renderOverlay();
    // batch95-a: 向导入口收纳进高级折叠区, 默认不可见
    expect(screen.queryByTestId('guardian-style-entry')).toBeNull();
    expandAdvanced();
    expect(screen.getByTestId('guardian-style-entry')).toBeDefined();
    expect(screen.queryByTestId('guardian-style-wizard')).toBeNull();

    fireEvent.click(screen.getByTestId('guardian-style-entry'));
    expect(await screen.findByTestId('guardian-style-wizard')).toBeDefined();
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
    fetchMock.mockReset();
  });

  it('renders the master index with four group rows and all anchor targets after expanding advanced', () => {
    renderOverlay();
    // batch95-a: 总控索引随守护设置整体收纳进高级折叠区, 默认不挂载
    expect(screen.queryByTestId('guard-control-index')).toBeNull();
    expandAdvanced();
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

describe('SettingsOverlay two-layer layout (batch95-a)', () => {
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

  it('shows only the core rows while advanced stays collapsed by default', async () => {
    renderOverlay();
    // 默认区: 小白核心行 — 昵称 / 守护开关 / 通知 / 深色 / 帮助反馈 (+清单卡)
    expect(screen.getByText(/profile\.displayNameDialogTitle/)).toBeDefined();
    expect(screen.getByText('Green Guardian Mode')).toBeDefined();
    expect(screen.getByTestId('push-notifications')).toBeDefined();
    expect(screen.getByText(/profile\.darkMode/)).toBeDefined();
    expect(screen.getByText('Help & FAQ')).toBeDefined();
    expect(screen.getByText('Send Feedback')).toBeDefined();
    expect(await screen.findByTestId('inventory-list-card-disabled')).toBeDefined();
    // 折叠头默认可见
    expect(screen.getByTestId('settings-advanced-toggle')).toBeDefined();
    // 高级内容默认不挂载 (B 类: 折叠不渲染)
    expect(screen.queryByTestId('guard-control-index')).toBeNull();
    expect(screen.queryByTestId('guardian-style-entry')).toBeNull();
    expect(screen.queryByTestId('time-value-options')).toBeNull();
    expect(screen.queryByTestId('guard-intensity-options')).toBeNull();
    expect(screen.queryByTestId('guard-scope-categories')).toBeNull();
    expect(screen.queryByTestId('night-window-options')).toBeNull();
    expect(screen.queryByTestId('spending-cap-setting')).toBeNull();
    expect(screen.queryByTestId('guard-policy-preview-setting')).toBeNull();
    expect(screen.queryByTestId('guard-rule-coverage-setting')).toBeNull();
    expect(screen.queryByTestId('guard-profile-export-block')).toBeNull();
    expect(screen.queryByTestId('guard-data-management-block')).toBeNull();
    expect(screen.queryByText('Green Preferences')).toBeNull();
    expect(screen.queryByTestId('green-impact-dashboard')).toBeNull();
    expect(screen.queryByTestId('email-connection')).toBeNull();
    expect(screen.queryByTestId('delete-account')).toBeNull();
  });

  it('remembers expansion state across overlay remounts', async () => {
    const first = renderOverlay();
    expect(screen.queryByTestId('guard-intensity-options')).toBeNull();

    expandAdvanced();
    expect(await screen.findByTestId('guard-intensity-options')).toBeDefined();
    expect(window.localStorage.getItem('symy-settings-advanced-open')).toBe('true');
    first.unmount();

    // 重开设置 — 展开态记忆生效
    const second = renderOverlay();
    expect(await screen.findByTestId('guard-intensity-options')).toBeDefined();

    // 收起后回到默认收起态并持久化
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    expect(window.localStorage.getItem('symy-settings-advanced-open')).toBe('false');
    expect(screen.queryByTestId('guard-intensity-options')).toBeNull();
    second.unmount();

    renderOverlay();
    expect(screen.queryByTestId('guard-intensity-options')).toBeNull();
  });

  it('renders a single intensity selector writing only the guard key after dedup', () => {
    renderOverlay();
    expandAdvanced();
    // 去重断言: 强度选择器全 overlay 只出现一次, 且是三档系统入口
    expect(screen.getAllByTestId('guard-intensity-options')).toHaveLength(1);
    expect(screen.queryByText('Green intensity')).toBeNull();
    expect(screen.queryByText('Firm')).toBeNull();
    expect(screen.queryByText('Lockdown')).toBeNull();

    fireEvent.click(screen.getByTestId('guard-intensity-strict'));
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    // 绿色偏好不再被强度控件写入
    expect(window.localStorage.getItem('symy-green-prefs')).toBeNull();
  });
});
