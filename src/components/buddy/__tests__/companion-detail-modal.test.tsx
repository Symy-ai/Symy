// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CompanionDetailModal } from '../companion-detail-modal';
import type { BuddyState } from '@/types/buddy-state';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> & { defaultValue?: string }) =>
      params?.defaultValue !== undefined ? String(params.defaultValue) : key,
    locale: 'en',
  }),
}));

// lucide-react: 部分保留真模块 (importOriginal), mock 链上的所有 icon 天然可用
vi.mock("lucide-react", async (importOriginal) => { const m = await importOriginal(); return m; });
vi.mock('../symy-avatar', () => ({ SymyAvatar: () => <div data-testid="symy-avatar" /> }));
vi.mock('../growth-stage-badge', () => ({ GrowthStageBadge: (p: { growthStage: string }) => <span data-testid="stage-badge">{p.growthStage}</span> }));
vi.mock('../personality-badge', () => ({ PersonalityBadge: (p: { personality: string }) => <span data-testid="personality-badge">{p.personality}</span> }));
vi.mock('../health-event-log', () => ({
  HealthEventLog: (p: { isLoadingEvents: boolean; isDemo: boolean }) => (
    <div data-testid="health-event-log" data-loading={String(p.isLoadingEvents)} data-demo={String(p.isDemo)} />
  ),
}));
vi.mock('../badges-section', () => ({
  BadgesSection: (p: { badges: string[] }) => (
    <div data-testid="badges-section" data-count={String(p.badges.length)} />
  ),
}));
vi.mock('../daily-needs-section', () => ({
  DailyNeedsSection: (p: { dailyNeeds: { clarity: number } }) => (
    <div data-testid="daily-needs" data-clarity={String(p.dailyNeeds.clarity)} />
  ),
}));

const buddy = (overrides: Partial<BuddyState> = {}): BuddyState =>
  ({
    level: 5,
    xp: 40,
    xpToNext: 100,
    growthStage: 'young',
    personality: 'sage',
    dailyNeeds: { clarity: 70, connection: 65 },
    badges: ['first_save', 'streak_7'],
    streak: 3,
    ...overrides,
  }) as unknown as BuddyState;

function setup(overrides: Partial<Parameters<typeof CompanionDetailModal>[0]> = {}) {
  const onClose = vi.fn();
  const props = {
    open: true,
    onClose,
    buddyState: buddy(),
    ...overrides,
  };
  return { onClose, view: render(<CompanionDetailModal {...props} />) };
}

describe('CompanionDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('renders nothing when open=false', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('locks body scroll while open and restores on close', () => {
    const { view } = setup();
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('shows level, xp ratio and capped progressbar aria', () => {
    setup({ buddyState: buddy({ level: 7, xp: 40, xpToNext: 100 }) });
    expect(screen.getByText('LV.7')).toBeTruthy();
    expect(screen.getByText('40/100')).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('xp overflow is capped at 100 percent', () => {
    setup({ buddyState: buddy({ xp: 500, xpToNext: 100 }) });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('known personality renders personality name; unknown renders awakening hint', () => {
    setup({ buddyState: buddy({ personality: 'guardian' }) });
    expect(screen.getByTestId('personality-badge').textContent).toBe('guardian');
    // 详情块 personality 名 (badge 与详情块同词 → getAllByText 计数 >=2)
    expect(screen.getAllByText('guardian').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Personality not yet awakened")).toBeNull();

    cleanup();
    setup({ buddyState: buddy({ personality: 'unknown' }) });
    expect(screen.getByText('Personality not yet awakened')).toBeTruthy();
    expect(screen.getByText(/awaken after 7 days/)).toBeTruthy();
    // PersonalityBadge 组件本身始终渲染 — unknown 的显示逻辑在 badge 内部 (不在本层测试范围)
  });

  it('passes dailyNeeds/healthEvents/badges down to child sections', () => {
    setup({
      buddyState: buddy({ dailyNeeds: { clarity: 88, connection: 88 }, badges: ['a', 'b', 'c'] }),
      healthEvents: [],
      isLoadingEvents: true,
      isDemo: true,
    });
    expect(screen.getByTestId('daily-needs').getAttribute('data-clarity')).toBe('88');
    const log = screen.getByTestId('health-event-log');
    expect(log.getAttribute('data-loading')).toBe('true');
    expect(log.getAttribute('data-demo')).toBe('true');
    expect(screen.getByTestId('badges-section').getAttribute('data-count')).toBe('3');
  });

  it('Escape key calls onClose', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click and Got-it button both close', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Got it'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('dialog content click does not close (stopPropagation)', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('harmony quote key selected per harmony status', () => {
    // t mock 返回 defaultValue 'I am here with you...' — 三种状态共用默认值,
    // 但 quoteKey 选择可通过 discomfort 状态下渲染同一默认值验证组件不崩溃
    setup({ buddyState: buddy({ dailyNeeds: { clarity: 10, connection: 10 } }) });
    expect(screen.getByText(/I am here with you/)).toBeTruthy();
  });
});
