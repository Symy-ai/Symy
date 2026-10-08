// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：全部子设置件 (锁本组件编排层: 折叠/持久化/锚点/透传) ———
vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key }),
}));
// react-query: 子设置链上有 useBuddyStateRQ — mock 掉 query 层
vi.mock('@/hooks/use-buddy-state-rq', () => ({
  useBuddyStateRQ: () => ({ buddyState: null, refreshBuddyState: vi.fn() }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());
vi.mock('@/i18n/config', () => ({
  LOCALES: ['en', 'zh'],
  DEFAULT_LOCALE: 'en',
}));
vi.mock('@/components/profile-parts/setting-components', () => ({
  SettingToggle: (p: Record<string, unknown>) => <div data-testid="setting-toggle" data-label={String(p.label)} />,
  SettingLink: (p: Record<string, unknown>) => <div data-testid="setting-link" data-label={String(p.label)} />,
}));
vi.mock('../../profile-parts', () => ({
  EmailConnectionSetting: (p: Record<string, unknown>) => <div data-testid="email-setting" data-demo={String(p.isDemo)} />,
}));
vi.mock('../../delete-account-button', () => ({
  DeleteAccountButton: () => <div data-testid="delete-account" />,
}));
vi.mock('@/components/profile-parts/green-impact-dashboard', () => ({
  GreenImpactDashboard: () => <div data-testid="green-dashboard" />,
}));
vi.mock('../guard-intensity-setting', () => ({
  GuardIntensitySetting: () => <div data-testid="guard-intensity" />,
}));
vi.mock('../guard-scope-setting', () => ({
  GuardScopeSetting: () => <div data-testid="guard-scope" />,
}));
vi.mock('../night-window-setting', () => ({
  NightWindowSetting: () => <div data-testid="night-window" />,
}));
vi.mock('../time-value-setting', () => ({
  TimeValueSetting: (p: Record<string, unknown>) => <div data-testid="time-value" data-demo={String(p.isDemo)} />,
}));
vi.mock('../guard-profile-export-setting', () => ({
  GuardProfileExportSetting: (p: Record<string, unknown>) => <div data-testid="guard-export" data-demo={String(p.isDemo)} />,
}));
vi.mock('../guard-data-management-setting', () => ({
  GuardDataManagementSetting: (p: Record<string, unknown>) => <div data-testid="guard-data" data-demo={String(p.isDemo)} />,
}));
vi.mock('../guard-control-index', () => ({
  GuardControlIndex: (p: Record<string, unknown>) => <div data-testid="guard-index" data-green={String(p.greenGuardEnabled)} />,
}));
vi.mock('../guard-policy-preview-setting', () => ({
  GuardPolicyPreviewSetting: (p: Record<string, unknown>) => <div data-testid="guard-preview" data-demo={String(p.isDemo)} />,
}));
vi.mock('../guard-rule-coverage-setting', () => ({
  GuardRuleCoverageSetting: () => <div data-testid="guard-coverage" />,
}));
vi.mock('@/components/profile-parts/spending-cap-setting', () => ({
  SpendingCapSetting: (p: Record<string, unknown>) => <div data-testid="spending-cap" data-demo={String(p.isDemo)} />,
}));
vi.mock('../green-preferences-section', () => ({
  GreenPreferencesSection: (p: Record<string, unknown>) => <div data-testid="green-prefs" data-locale={String(p.locale)} />,
}));

import { SettingsAdvancedSection } from '../settings-advanced-section';

// Props 未导出 — 本地同签名 (照源文件 63-77 行)
type TFunc = (key: string, opts?: { defaultValue?: string }) => string;
interface LocalProps {
  isDemo: boolean;
  greenPrefEnabled: boolean;
  emailConnections: Parameters<typeof SettingsAdvancedSection>[0]['emailConnections'];
  onNavigateMonitor?: () => void;
  isEmailMonitorEnabled: boolean;
  onDisconnectEmail: (connectionId: string) => Promise<void>;
  showComingSoonToast: () => void;
  showPremiumToastMsg: (msg: string) => void;
  locale: 'en' | 'zh';
  setLocale: (locale: 'en' | 'zh') => void;
  onOpenGuardianStyleWizard: () => void;
  t: TFunc;
}

const t = (key: string, opts?: { defaultValue?: string }) => ({
  'profile.settingsAdvanced': '高级设置',
  'profile.settingsAdvancedDesc': '渐进披露的进阶选项',
  'profile.guardianStyleTitle': '我的守护风格',
  'profile.guardianStyleEntryDesc': '四渠道聚合向导',
})[key] ?? opts?.defaultValue ?? key;

function sectionProps(overrides: Record<string, unknown> = {}) {
  return {
    isDemo: false,
    greenPrefEnabled: true,
    emailConnections: [],
    onNavigateMonitor: vi.fn(),
    isEmailMonitorEnabled: false,
    onDisconnectEmail: vi.fn(() => Promise.resolve()),
    showComingSoonToast: vi.fn(),
    showPremiumToastMsg: vi.fn(),
    locale: 'zh' as const,
    setLocale: vi.fn(),
    onOpenGuardianStyleWizard: vi.fn(),
    t,
    ...overrides,
  };
}

function renderSection(overrides: Record<string, unknown> = {}) {
  const p = sectionProps(overrides);
  const utils = render(<SettingsAdvancedSection {...(p as unknown as LocalProps)} />);
  return { ...utils, props: p };
}

describe('SettingsAdvancedSection (214行 高级设置折叠区)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });
  afterEach(() => cleanup());

  it('默认收起: 折叠头渲染, 内容不挂载', () => {
    const { unmount } = renderSection();
    expect(screen.getByTestId('settings-advanced-toggle')).toBeTruthy();
    expect(screen.getByText('高级设置')).toBeTruthy();
    expect(screen.queryByTestId('guard-intensity')).toBeNull();
    expect(screen.getByTestId('settings-advanced-toggle').getAttribute('aria-expanded')).toBe('false');
    unmount();
  });

  it('点击展开: 全部子设置挂载 + aria-expanded true + localStorage 持久化', () => {
    const { unmount } = renderSection();
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    for (const tid of ['guard-index','guard-intensity','guard-scope','night-window','spending-cap','guard-preview','guard-coverage','guard-export','guard-data','time-value','green-dashboard','email-setting','delete-account','green-prefs']) {
      expect(screen.getByTestId(tid), tid).toBeTruthy();
    }
    expect(screen.getByTestId('settings-advanced-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(window.localStorage.getItem('symy-settings-advanced-open')).toBe('true');
    unmount();
  });

  it('再点击收起: 内容卸载 + localStorage false', () => {
    const { unmount } = renderSection();
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    expect(screen.queryByTestId('guard-intensity')).toBeNull();
    expect(window.localStorage.getItem('symy-settings-advanced-open')).toBe('false');
    unmount();
  });

  it('localStorage 预置 true: 首渲染即展开 (mount 后)', () => {
    window.localStorage.setItem('symy-settings-advanced-open', 'true');
    const { unmount } = renderSection();
    expect(screen.getByTestId('guard-intensity')).toBeTruthy();
    unmount();
  });

  it('isDemo 透传到需要 demo 感知的子设置', () => {
    const { unmount } = renderSection({ isDemo: true });
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    expect(screen.getByTestId('time-value').getAttribute('data-demo')).toBe('true');
    expect(screen.getByTestId('guard-export').getAttribute('data-demo')).toBe('true');
    expect(screen.getByTestId('spending-cap').getAttribute('data-demo')).toBe('true');
    unmount();
  });

  it('greenPrefEnabled 透传: 总控索引 + 绿色偏好区', () => {
    const { unmount } = renderSection({ greenPrefEnabled: false });
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    expect(screen.getByTestId('guard-index').getAttribute('data-green')).toBe('false');
    expect(screen.getByTestId('green-prefs').getAttribute('data-locale')).toBe('zh'); // 99-d: 只透传 t/locale, 强度唯一入口在 GuardIntensitySetting
    unmount();
  });

  it('守护风格向导入口: 点击调 onOpenGuardianStyleWizard', () => {
    const { unmount, props } = renderSection();
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    fireEvent.click(screen.getByTestId('guardian-style-entry'));
    expect(props.onOpenGuardianStyleWizard).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('锚点 id 就位: style/cart/coverage/evidence 四落点', () => {
    const { unmount } = renderSection();
    fireEvent.click(screen.getByTestId('settings-advanced-toggle'));
    for (const id of ['guard-anchor-style', 'guard-anchor-cart', 'guard-anchor-coverage', 'guard-anchor-evidence']) {
      expect(document.getElementById(id), id).toBeTruthy();
    }
    unmount();
  });
});
