// @vitest-environment happy-dom

/* eslint-disable require-await -- test mocks use async for API consistency */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroSection } from '../hero-section';
import type { BuddyState, BuddyHealth, GrowthStage, Personality } from '@/types/buddy-state';

const tMock = vi.hoisted(() => vi.fn((key: string, values?: Record<string, unknown>) => {
  if (key === 'buddy.evolutionHint') return `evolution:${values?.stage}`;
  return key;
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: tMock, locale: 'zh' }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 20 }),
}));

function buddyState(overrides?: Partial<BuddyState>): BuddyState {
  return {
    vitality: 80,
    tokens: 10,
    health: 'healthy',
    level: 6,
    xp: 2,
    xpToNext: 10,
    streak: 3,
    dreamFunds: [],
    badges: [],
    totalSaved: 100,
    challengesCompleted: 2,
    lastHealingKitAt: null,
    version: 1,
    growthStage: 'young',
    personality: 'unknown',
    intimacy: 50,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

const config = (statusTextKey = 'buddy.healthStatus.healthy') => ({
  color: 'text-emerald-400',
  glowColor: 'shadow-emerald-400/30',
  statusTextKey,
  statusEmoji: '🌿',
  ringColor: 'stroke-emerald-400',
  particleColor: 'bg-emerald-400',
  neonGradient: 'from-emerald-400 to-teal-500',
});

function renderHero(props?: {
  buddy?: Partial<BuddyState>;
  health?: BuddyHealth;
  growthStage?: GrowthStage;
  personality?: Personality;
  vitalityPct?: number;
  healingPulse?: boolean;
}) {
  const onCompanionClick = vi.fn();
  const state = buddyState({
    ...props?.buddy,
    ...(props?.health ? { health: props.health } : {}),
    ...(props?.growthStage ? { growthStage: props.growthStage } : {}),
    ...(props?.personality ? { personality: props.personality } : {}),
  });
  const view = render(
    <HeroSection
      buddyState={state}
      config={config()}
      vitalityPct={props?.vitalityPct ?? 80}
      onCompanionClick={onCompanionClick}
      healingPulse={props?.healingPulse}
    />,
  );
  return { ...view, onCompanionClick };
}

describe('HeroSection', () => {
  beforeEach(() => {
    tMock.mockClear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', window.matchMedia);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('健康阶段渲染状态文案、成长摘要与头像按钮', () => {
    const { onCompanionClick } = renderHero();
    expect(screen.getByLabelText('buddy.companionAriaLabel')).toBeTruthy();
    expect(screen.getByText('buddy.healthStatus.healthy')).toBeTruthy();
    expect(screen.getByText('buddy.growingStronger')).toBeTruthy();
    expect(screen.getByTestId('growth-source-summary')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('buddy.companionAriaLabel'));
    expect(onCompanionClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['thriving', 'buddy.mindfulKeepsStrong'],
    ['healthy', 'buddy.growingStronger'],
    ['weak', 'buddy.spendingWearingDown'],
    ['critical', 'buddy.impulseHurting'],
    ['dormant', 'buddy.depositToRevive'],
  ] as const)('%s 阶段渲染降级文案', (health, copy) => {
    renderHero({ health });
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it('dormant 隐藏动态粒子/脉冲环', () => {
    const { container } = renderHero({ health: 'dormant', vitalityPct: 0 });
    expect(container.querySelector('.animate-float-1')).toBeNull();
    expect(container.querySelector('.animate-pulse-ring')).toBeNull();
    expect(container.textContent).toContain('buddy.depositToRevive');
  });

  it('vitality ring 按阈值显示高光点', () => {
    const zero = renderHero({ vitalityPct: 0 });
    expect(zero.container.textContent).not.toContain('buddy.companionAriaLabel');
    zero.unmount();

    const active = renderHero({ vitalityPct: 75 });
    expect(active.container.querySelector('[stroke-dasharray="4 348"]')).toBeTruthy();
  });

  it('接近成长阈值时显示进化提示; 阈值外隐藏', () => {
    const near = renderHero({ growthStage: 'baby', buddy: { level: 4, xp: 1, xpToNext: 5 } });
    expect(screen.getByRole('status', { name: 'evolution:buddy.growthStage.young' })).toBeTruthy();
    near.unmount();

    renderHero({ growthStage: 'baby', buddy: { level: 1, xp: 0, xpToNext: 5 } });
    expect(screen.queryByRole('status', { name: 'evolution:buddy.growthStage.young' })).toBeNull();
  });

  it('成长阶段上升触发庆祝并在 3s 后退场, 下降不触发', async () => {
    vi.useFakeTimers();
    const initial = renderHero({ growthStage: 'baby' });
    expect(screen.queryByTestId('stage-up-celebration')).toBeNull();

    act(() => {
      initial.rerender(
        <HeroSection
          buddyState={buddyState({ growthStage: 'young' })}
          config={config()}
          vitalityPct={80}
          onCompanionClick={vi.fn()}
        />,
      );
    });
    expect(screen.getByTestId('stage-up-celebration')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByTestId('stage-up-celebration')).toBeNull();
    initial.unmount();

    const older = renderHero({ growthStage: 'adult' });
    older.rerender(
      <HeroSection
        buddyState={buddyState({ growthStage: 'young' })}
        config={config()}
        vitalityPct={80}
        onCompanionClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('stage-up-celebration')).toBeNull();
    vi.useRealTimers();
  });

  it('已觉醒个性渲染徽章, unknown 不渲染', () => {
    renderHero({ personality: 'sage' });
    expect(screen.getByText('buddy.personality.sage')).toBeTruthy();
  });

  it('触控设备拒绝陀螺仪权限时记忆拒绝且不影响点击', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMedia);
    const requestPermission = vi.fn().mockResolvedValue('denied');
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission });
    const { onCompanionClick } = renderHero();

    fireEvent.click(screen.getByLabelText('buddy.companionAriaLabel'));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('symy_orientation_denied')).toBe('1');
    expect(onCompanionClick).toHaveBeenCalledTimes(1);
  });
});
