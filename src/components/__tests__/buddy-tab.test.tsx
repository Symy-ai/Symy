// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }),
}));
vi.mock('@/hooks/use-animated-number', () => ({ useAnimatedNumber: (v: number) => v }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 25 }) }));
vi.mock('@/hooks/use-health-events', () => ({
  useHealthEvents: () => ({ healthEvents: [], isLoadingEvents: false, healthEventsError: null, retryFetch: vi.fn() }),
}));
vi.mock('../buddy/hooks/use-pattern-alert', () => ({ usePatternAlert: () => null }));
vi.mock('../buddy/hooks/use-health-notification', () => ({ useHealthNotification: () => null }));
vi.mock('../buddy/hooks/use-healing-kit', () => ({
  useHealingKit: () => ({ healingPulse: null, handleCompanionClick: vi.fn() }),
}));
vi.mock('../buddy/hooks/use-challenge-flow', () => ({
  useChallengeFlow: () => ({
    showChallengeModal: false, handleCloseChallengeModal: vi.fn(), isCheckingChallenge: false,
    challengePulse: null, challengeLimitData: null, handleSeeItClick: vi.fn(), startChallenge: vi.fn(),
  }),
}));
vi.mock('../buddy/hooks/use-redeem-dialog', () => ({
  useRedeemDialog: () => ({
    showRedeemDialog: false, setShowRedeemDialog: vi.fn(), redeemType: null,
    redeeming: false, openRedeemDialog: vi.fn(), handleRedeem: vi.fn(),
  }),
}));

// 子区块 mock — data-testid 接线断言 (装配层测法)
vi.mock('../buddy/buddy-tab-skeleton', () => ({ BuddyTabSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('../buddy/hero-section', () => ({ HeroSection: (p: { vitalityPct?: number; buddyState?: { tokens?: number } }) => <div data-testid="hero" data-v={p.vitalityPct} data-tokens={p.buddyState?.tokens} /> }));
vi.mock('../buddy/growth-milestone-overlay', () => ({ GrowthMilestoneOverlay: (p: { isLoading?: boolean }) => <div data-testid="milestone" data-loading={String(p.isLoading)} /> }));
vi.mock('../buddy/symy-ledger', () => ({ SymyLedger: () => <div data-testid="ledger" /> }));
vi.mock('../buddy/proactive-message-banner', () => ({ ProactiveMessageBanner: () => <div data-testid="proactive" /> }));
vi.mock('../buddy/companion-detail-modal', () => ({ CompanionDetailModal: (p: { open?: boolean }) => <div data-testid="companion" data-open={String(p.open)} /> }));
vi.mock('../buddy/challenge-modal', () => ({ ChallengeModal: (p: { open?: boolean }) => <div data-testid="challenge" data-open={String(p.open)} /> }));
vi.mock('../buddy/intercept-medal-banner', () => ({ InterceptMedalBanner: (p: { streakDays?: number }) => <div data-testid="medal" data-streak={p.streakDays} /> }));
vi.mock('../buddy/sections/health-notification-overlay', () => ({ HealthNotificationOverlay: () => <div data-testid="health-note" /> }));
vi.mock('../buddy/sections/buddy-ambient-background', () => ({ BuddyAmbientBackground: (p: { health?: string }) => <div data-testid="ambient" data-health={p.health} /> }));
vi.mock('../buddy/sections/pattern-alert-banner', () => ({ PatternAlertBanner: () => <div data-testid="pattern" /> }));
vi.mock('../buddy/sections/quick-actions', () => ({ QuickActions: () => <div data-testid="quick" /> }));
vi.mock('../buddy/sections/dormant-revival-prompt', () => ({ DormantRevivalPrompt: () => <div data-testid="revival" /> }));
vi.mock('../buddy/sections/redeem-dialog', () => ({ RedeemDialog: (p: { open?: boolean }) => <div data-testid="redeem" data-open={String(p.open)} /> }));

import { BuddyTab } from '../buddy-tab';

const buddyState = {
  health: 'healthy',
  vitality: 72,
  tokens: 120,
  streak: 3,
  level: 2,
  xp: 40,
  totalSaved: 500,
} as never;

const baseProps = {
  buddyState,
  onNavigateChat: vi.fn(),
  onRevive: vi.fn(),
  onAddTokens: vi.fn(),
  onUseHealingKit: vi.fn(),
  onBuddyStateRefresh: vi.fn(),
  onToast: vi.fn(),
  userId: 'u1',
};

/**
 * buddy-tab.tsx (173行) — 编排壳 (Round 91 拆分后: hooks 逻辑 + sections 区块)。
 *
 * 装配层锁定:
 * - isLoading → Skeleton 独占 (区块不渲染)
 * - HeroSection 透传 vitalityPct/tokens (动画数字)
 * - 勋章: streak>0 透传, 0/undefined → undefined
 * - Ambient 背景随 health
 * - 弹窗三件套默认关闭
 */
describe('BuddyTab 编排壳', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('isLoading → Skeleton 独占, 主区块不渲染', () => {
    render(<BuddyTab {...baseProps} isLoading />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    expect(screen.queryByTestId('hero')).toBeNull();
    expect(screen.queryByTestId('ledger')).toBeNull();
  });

  it('非 loading → 主区块编排 (hero/ledger/quick/ambient 全在)', () => {
    render(<BuddyTab {...baseProps} />);
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.getByTestId('hero')).toBeTruthy();
    expect(screen.getByTestId('ledger')).toBeTruthy();
    expect(screen.getByTestId('quick')).toBeTruthy();
    expect(screen.getByTestId('ambient').getAttribute('data-health')).toBe('healthy');
  });

  it('HeroSection 透传 vitalityPct + tokens', () => {
    render(<BuddyTab {...baseProps} />);
    const hero = screen.getByTestId('hero');
    expect(hero.getAttribute('data-v')).toBe('72');
    expect(hero.getAttribute('data-tokens')).toBe('120');
  });

  it('勋章: streak=3 透传; streak=0 → undefined', () => {
    render(<BuddyTab {...baseProps} />);
    expect(screen.getByTestId('medal').getAttribute('data-streak')).toBe('3');
    cleanup();
    render(<BuddyTab {...baseProps} buddyState={{ ...(buddyState as object), streak: 0 } as never} />);
    expect(screen.getByTestId('medal').getAttribute('data-streak')).toBeNull();
  });

  it('三弹窗默认关闭 (challenge/companion/redeem)', () => {
    render(<BuddyTab {...baseProps} />);
    expect(screen.getByTestId('challenge').getAttribute('data-open')).toBe('false');
    expect(screen.getByTestId('companion').getAttribute('data-open')).toBe('false');
    // RedeemDialog 条件渲染: 默认关闭 = 不存在
    expect(screen.queryByTestId('redeem')).toBeNull();
  });
});
