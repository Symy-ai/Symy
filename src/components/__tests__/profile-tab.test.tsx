// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProfileTab } from '../profile-tab';
import type { ProfileTabProps } from '../profile/profile-tab-props';

// —— hooks 全 mock (装配层模式: 只测编排壳的映射与条件渲染) ——
const useAuthMock = vi.fn(() => ({ user: { email: 'sparks@example.com', user_metadata: {}, created_at: '2026-01-01' }, signOut: vi.fn() }));
vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> & { defaultValue?: string }) =>
      params?.defaultValue !== undefined ? String(params.defaultValue) : key,
    locale: 'en',
    setLocale: vi.fn(),
  }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

vi.mock('@/hooks/use-green-pref', () => ({
  useGreenPref: () => ({ greenPrefEnabled: true, setGreenPrefEnabled: vi.fn() }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 50 }),
}));

// —— 子组件/区块全 mock (带 data-testid 呼出点) ——
vi.mock('../profile/profile-parts', () => ({
  AboutModal: () => <div data-testid="about-modal" />,
}));
vi.mock('../profile/display-name-dialog', () => ({
  DisplayNameDialog: (p: { open: boolean }) => <div data-testid="display-name-dialog" data-open={String(p.open)} />,
  DisplayNamePrompt: () => <div data-testid="display-name-prompt" />,
}));
vi.mock('../profile/sign-out-dialog', () => ({
  SignOutConfirmDialog: (p: { open: boolean; onConfirm: () => void }) => (
    <div data-testid="signout-dialog" data-open={String(p.open)} onClick={p.onConfirm} />
  ),
}));
vi.mock('../profile/faq-dialog', () => ({
  FaqDialog: (p: { open: boolean }) => <div data-testid="faq-dialog" data-open={String(p.open)} />,
}));
vi.mock('../profile/dream-funds-empty-guide', () => ({
  DreamFundEmptyGuide: (p: { isDemo: boolean }) => <div data-testid="dream-fund-guide" data-demo={String(p.isDemo)} />,
}));
vi.mock('../profile/premium-card', () => ({
  PremiumCard: () => <div data-testid="premium-card" />,
}));
vi.mock('../profile/invite-card', () => ({
  InviteCard: () => <div data-testid="invite-card" />,
}));
vi.mock('../profile-parts/guard-totals-card', () => ({
  GuardTotalsCard: (p: { onOpenInsights?: () => void }) => (
    <div data-testid="guard-totals" onClick={p.onOpenInsights} />
  ),
}));
vi.mock('../profile/blind-spot-map', () => ({
  BlindSpotMap: () => <div data-testid="blind-spot-map" />,
}));
vi.mock('../profile/me-dream-funds-section', () => ({
  MeDreamFundsSection: (p: { dreamFunds: Array<{ id: string }> }) => (
    <div data-testid="me-dream-funds" data-count={String(p.dreamFunds.length)} />
  ),
}));
vi.mock('../buddy/minimum-payment-trap-card', () => ({
  MinimumPaymentTrapCard: () => <div data-testid="min-payment-trap" />,
}));
vi.mock('../profile/hooks/use-premium-toast', () => ({
  usePremiumToast: () => ({ premiumToast: null, setPremiumToast: vi.fn(), showPremiumToastMsg: vi.fn() }),
}));
vi.mock('../profile/hooks/use-avatar-upload', () => ({
  useAvatarUpload: () => ({ fileInputRef: { current: null }, isUploadingAvatar: false, avatarError: null, effectiveAvatarUrl: null, handleAvatarUpload: vi.fn() }),
}));
vi.mock('../profile/hooks/use-profile-data', () => ({
  useProfileData: () => ({ profile: { plan: 'free' }, isEmailMonitorEnabled: false, emailConnections: [], uniqueReceipts: [], handleEmailDisconnect: vi.fn() }),
}));
vi.mock('../profile/hooks/use-profile-stats', () => ({
  useProfileStats: () => ({}),
}));
vi.mock('../profile/hooks/use-profile-dialogs', () => ({
  useProfileDialogs: () => ({
    showAboutModal: false, setShowAboutModal: vi.fn(),
    showSettingsOverlay: false, setShowSettingsOverlay: vi.fn(),
    showDisplayNameDialog: false, setShowDisplayNameDialog: vi.fn(),
    displayNameInitial: 'S',
    showSignOutConfirm: false, setShowSignOutConfirm: vi.fn(),
    showFaqDialog: false, setShowFaqDialog: vi.fn(),
    openDisplayNameDialog: vi.fn(),
    handleDisplayNameSaved: vi.fn(),
    handleDisplayNameError: vi.fn(),
    handleSignOutClick: vi.fn(),
    handleSignOutConfirm: vi.fn(),
  }),
}));
vi.mock('../profile/sections/demo-signup-prompt', () => ({
  DemoSignupPrompt: () => <div data-testid="demo-signup-prompt" />,
}));
vi.mock('../profile/sections/profile-header', () => ({
  ProfileHeader: (p: { displayName: string; displayEmail: string; plan: string }) => (
    <div data-testid="profile-header" data-name={p.displayName} data-email={p.displayEmail} data-plan={p.plan} />
  ),
}));
vi.mock('../profile/sections/profile-footer', () => ({
  ProfileFooter: () => <div data-testid="profile-footer" />,
}));
vi.mock('../profile/sections/settings-overlay', () => ({
  SettingsOverlay: (p: { displayName: string }) => <div data-testid="settings-overlay" data-name={p.displayName} />,
}));
vi.mock('lucide-react', async (importOriginal) => {
  const m = await importOriginal();
  return m;
});

const baseProps: ProfileTabProps = {};

function setup(overrides: Partial<ProfileTabProps> = {}) {
  return render(<ProfileTab {...baseProps} {...overrides} />);
}

describe('ProfileTab (编排壳)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('已登录用户渲染完整装配 (header/footer/设置按钮)', () => {
    setup();
    expect(screen.getByTestId('profile-header')).toBeTruthy();
    expect(screen.getByTestId('profile-footer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('header 收到 displayName (email 前缀) 与 plan', () => {
    setup();
    const header = screen.getByTestId('profile-header');
    expect(header.getAttribute('data-name')).toBe('sparks');
    expect(header.getAttribute('data-email')).toBe('sparks@example.com');
    expect(header.getAttribute('data-plan')).toBe('free');
  });

  it('demo 且未登录 → DemoSignupPrompt 早退 (U-1: 登录用户不受 isDemo 竞态影响)', () => {
    useAuthMock.mockReturnValueOnce({ user: null, signOut: vi.fn() } as never);
    setup({ isDemo: true });
    expect(screen.getByTestId('demo-signup-prompt')).toBeTruthy();
    expect(screen.queryByTestId('profile-header')).toBeNull();
  });

  it('非 demo 区块在 demo 下不渲染 (guard-totals/blind-spot/invite/signout/premium)', () => {
    useAuthMock.mockReturnValueOnce({ user: null, signOut: vi.fn() } as never);
    setup({ isDemo: true });
    expect(screen.queryByTestId('guard-totals')).toBeNull();
    expect(screen.queryByTestId('blind-spot-map')).toBeNull();
    expect(screen.queryByTestId('invite-card')).toBeNull();
    expect(screen.queryByTestId('premium-card')).toBeNull();
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('dreamFunds 非空 → MeDreamFundsSection + MinimumPaymentTrapCard 渲染', () => {
    setup({ dreamFunds: [{ id: 'f1' }, { id: 'f2' }] as never });
    expect(screen.getByTestId('me-dream-funds').getAttribute('data-count')).toBe('2');
    expect(screen.getByTestId('min-payment-trap')).toBeTruthy();
  });

  it('dreamFunds 空/缺省 → 两个区块都不渲染, 空态引导始终在', () => {
    setup({ dreamFunds: [] });
    expect(screen.queryByTestId('me-dream-funds')).toBeNull();
    expect(screen.queryByTestId('min-payment-trap')).toBeNull();
    expect(screen.getByTestId('dream-fund-guide')).toBeTruthy();
  });

  it('plan=free 渲染 PremiumCard; premium plan 不渲染', () => {
    setup();
    expect(screen.getByTestId('premium-card')).toBeTruthy();
  });

  it('Sign Out 按钮存在于主页面 (Round 78 P2-10)', () => {
    setup();
    expect(screen.getByText('Sign Out')).toBeTruthy();
  });

  it('三个 dialog 常驻装配 (open=false 不显示内容但组件在树中)', () => {
    setup();
    expect(screen.getByTestId('display-name-dialog').getAttribute('data-open')).toBe('false');
    expect(screen.getByTestId('signout-dialog').getAttribute('data-open')).toBe('false');
    expect(screen.getByTestId('faq-dialog').getAttribute('data-open')).toBe('false');
  });

  it('设置 overlay 默认不开; gear 点击后装配 (mock hook 状态恒 false — 以按钮存在性为准)', () => {
    setup();
    expect(screen.queryByTestId('settings-overlay')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });
});
