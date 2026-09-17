// @vitest-environment happy-dom

/**
 * home-tab 装配冒烟 (batch79-b — v7 §十三.2 断链子树成员, 此前零测试)
 *
 * 覆盖:
 *  - render 冒烟: mock 全部子件后渲染不抛 (hero + 状态灯 + 标语)
 *  - 顺序铁律 (owner 09-06): 代币行 → 日报 → 周挑战卡 → 周报 → 趋势图,
 *    五模块在渲染产物中按此顺序出现
 *  - isLoading 骨架: 五模块 + 状态灯全部不挂载
 *  - 空/undefined props 不抛: events=[] + 全零 stats + isLoading/isDemo 显式 undefined
 *  - 数据透传: events/stats/isDemo 到达日报; 有事件时 EventRow 渲染
 *  - 挑战管道: 非 demo 拉 /api/challenge/active, demo 不拉 (demo 无挑战后端)
 *  - 季横幅: getActiveGuardSeason 有季时挂载, 且位于日报与挑战卡之间
 *  - onStart 接线: CTA 态带本周挑战名进 chat; 进行中态只导航不带 message
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { HomeTab } from '../home-tab';
import { apiFetch } from '@/lib/api-client';
import { getActiveGuardSeason, GUARD_SEASON_DEFS } from '@/lib/guard-season';
import type { ImpulseEvent } from '@/lib/impulse-detector';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'zh' }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/guard-season', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/guard-season')>();
  return { ...actual, getActiveGuardSeason: vi.fn(() => null) };
});

// 子件桩 — 每个 render 一个可定位 marker, 顺序断言靠 DOM 序
vi.mock('../status-indicator', () => ({
  StatusText: ({ status }: { status: string }) => <div data-testid="status-text">{status}</div>,
}));
vi.mock('../profile-parts/token-row', () => ({
  TokenRow: () => <div data-testid="token-row" />,
}));
vi.mock('../daily-green-report', () => ({
  DailyGreenReport: (props: { events: unknown[]; isDemo: boolean }) => (
    <div
      data-testid="daily-green-report"
      data-demo={String(props.isDemo)}
      data-event-count={String(props.events.length)}
    />
  ),
}));
vi.mock('../home/guard-season-banner', () => ({
  GuardSeasonBanner: () => <div data-testid="guard-season-banner" />,
}));
vi.mock('../home/weekly-challenge-card', () => ({
  WeeklyChallengeCard: ({ weekly, onStart }: { weekly: { titleKey: string }; onStart?: (c: { titleKey: string }) => void }) => (
    <div data-testid="weekly-challenge-card">
      <button data-testid="wc-start" onClick={() => onStart?.(weekly)}>
        start
      </button>
    </div>
  ),
}));
vi.mock('../weekly-green-report', () => ({
  WeeklyGreenReport: () => <div data-testid="weekly-green-report" />,
}));
vi.mock('../spending-cap-card', () => ({
  SpendingCapCard: () => <div data-testid="spending-cap-card" />,
}));
vi.mock('../spending-trend-chart', () => ({
  SpendingTrendChart: () => <div data-testid="spending-trend-chart" />,
}));
vi.mock('../buddy/challenge-definitions', () => ({
  pickWeeklyFeatureChallenge: () => ({
    id: 'w1',
    period: 'weekly',
    titleKey: 'wc.titleKey',
    descKey: 'wc.descKey',
    doneTitleKey: 'wc.doneKey',
    progressSource: 'behavior_count',
    target: 3,
    rewardBadgeId: 'badge-1',
  }),
}));

function makeEvent(overrides: Partial<ImpulseEvent> = {}): ImpulseEvent {
  return {
    id: 'e1',
    platform: 'email',
    item: 'Espresso Machine',
    amount: 299,
    timestamp: new Date('2026-09-17T10:00:00Z'),
    category: 'electronics',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 72,
    reasons: ['flash sale'],
    ...overrides,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    status: 'stable' as const,
    events: [] as ImpulseEvent[],
    stats: { totalEvents: 0, impulseInterventions: 0, moneySaved: 0, daysStreak: 0 },
    onNavigateMonitor: () => {},
    onNavigateFamily: () => {},
    onNavigateChat: vi.fn(),
    ...overrides,
  };
}

const MODULE_ORDER = [
  'token-row',
  'daily-green-report',
  'weekly-challenge-card',
  'weekly-green-report',
  'spending-trend-chart',
];

function testidSequence(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
    el.getAttribute('data-testid'),
  ) as string[];
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HomeTab — 装配冒烟', () => {
  it('默认 props 渲染不抛: hero 图 + 状态灯 + 标语', () => {
    const { container } = render(<HomeTab {...baseProps()} />);
    expect(container.querySelector('img[alt="Symy"]')).toBeTruthy();
    const seq = testidSequence(container);
    expect(seq).toContain('status-text');
    expect(container.textContent).toContain('home.tagline');
  });

  it('顺序铁律 (owner 09-06): 代币行→日报→周挑战卡→周报→趋势图, 五模块按序出现', () => {
    const { container } = render(<HomeTab {...baseProps()} />);
    const seq = testidSequence(container);
    const positions = MODULE_ORDER.map((m) => seq.indexOf(m));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('isLoading 骨架: 五模块与状态灯全部不挂载', () => {
    const { container } = render(<HomeTab {...baseProps({ isLoading: true })} />);
    const seq = testidSequence(container);
    for (const m of [...MODULE_ORDER, 'status-text']) {
      expect(seq).not.toContain(m);
    }
  });

  it('空/undefined props 不抛: events=[] + 全零 stats + isLoading/isDemo 显式 undefined, 空态文案出现', () => {
    const { container } = render(
      <HomeTab {...baseProps({ isLoading: undefined, isDemo: undefined })} />,
    );
    expect(container.textContent).toContain('home.noImpulseEvents');
    expect(container.textContent).toContain('home.shoppingUnderControl');
  });

  it('数据透传: events/isDemo 到达日报; 有事件时 EventRow 渲染且金额走自由时间文案', () => {
    const { container } = render(
      <HomeTab {...baseProps({ isDemo: true, events: [makeEvent()] })} />,
    );
    const daily = container.querySelector('[data-testid="daily-green-report"]');
    expect(daily?.getAttribute('data-demo')).toBe('true');
    expect(daily?.getAttribute('data-event-count')).toBe('1');
    expect(container.textContent).toContain('Espresso Machine');
  });

  it('挑战管道: 非 demo 拉 /api/challenge/active; demo 不拉 (demo 无挑战后端)', async () => {
    const full = render(<HomeTab {...baseProps()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/challenge/active'));
    full.unmount();

    vi.mocked(apiFetch).mockClear();
    render(<HomeTab {...baseProps({ isDemo: true })} />);
    expect(apiFetch).toHaveBeenCalledTimes(0);
  });

  it('季横幅: 有活跃季时挂载, 且位于日报与周挑战卡之间', () => {
    vi.mocked(getActiveGuardSeason).mockReturnValueOnce(GUARD_SEASON_DEFS[0]!);
    const { container } = render(<HomeTab {...baseProps()} />);
    const seq = testidSequence(container);
    const daily = seq.indexOf('daily-green-report');
    const banner = seq.indexOf('guard-season-banner');
    const card = seq.indexOf('weekly-challenge-card');
    expect(banner).toBeGreaterThan(daily);
    expect(banner).toBeLessThan(card);
  });

  it('onStart 接线 — CTA 态: 导航 chat 并带本周挑战名 (t(titleKey))', () => {
    const onNavigateChat = vi.fn();
    const { container } = render(<HomeTab {...baseProps({ isDemo: true, onNavigateChat })} />);
    fireEvent.click(container.querySelector('[data-testid="wc-start"]')!);
    expect(onNavigateChat).toHaveBeenCalledWith({ type: 'challenge', message: 'wc.titleKey' });
  });

  it('onStart 接线 — 进行中态: 只导航, 不带 message (chat 侧自恢复 active 挑战)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      challenge: { id: 'c1', item_name: 'Coffee', amount: 5 },
    });
    const onNavigateChat = vi.fn();
    const { container } = render(<HomeTab {...baseProps({ onNavigateChat })} />);
    await waitFor(() => expect(onNavigateChat).not.toHaveBeenCalled());
    fireEvent.click(container.querySelector('[data-testid="wc-start"]')!);
    expect(onNavigateChat).toHaveBeenCalledWith({ type: 'challenge' });
  });
});
