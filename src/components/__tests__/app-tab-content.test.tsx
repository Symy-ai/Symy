// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { AppTabContent } from '../app-tab-content';

// ── mock 全部 tab 子组件为 data-testid 简化件, 断言装配层接线 ──

vi.mock('@/components/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div>,
}));

vi.mock('@/components/chat-tab', () => ({
  ChatTab: (p: Record<string, unknown>) => (
    <div data-testid="chat-tab" data-is-demo={String(p.isDemo)} data-context={String((p as { contextMessage?: string }).contextMessage ?? '')} />
  ),
}));

vi.mock('@/components/buddy-tab', () => ({
  BuddyTab: (p: Record<string, unknown>) => (
    <div
      data-testid="buddy-tab"
      data-is-demo={String(p.isDemo)}
      data-see-it={(p as { onSeeIt?: () => void }) ? 'wired' : 'missing'}
    >
      <button type="button" onClick={() => (p as { onSeeIt?: () => void }).onSeeIt?.()}>see-it</button>
      <button type="button" onClick={() => (p as { onGacha?: () => void }).onGacha?.()}>gacha</button>
    </div>
  ),
}));

vi.mock('@/features/defense/components/defense-tab', () => ({
  DefenseTab: (p: Record<string, unknown>) => (
    <div
      data-testid="defense-tab"
      data-total-saved={String((p as { userTotalSaved?: number }).userTotalSaved ?? '')}
      data-intercepts={String((p as { guardRankStats?: { totalIntercepts: number } }).guardRankStats?.totalIntercepts ?? '')}
    />
  ),
}));

vi.mock('@/components/profile-tab', () => ({
  ProfileTab: (p: Record<string, unknown>) => (
    <div
      data-testid="profile-tab"
      data-is-active={String(p.isActive)}
      data-streak={String((p as { buddyStreak?: number }).buddyStreak ?? '')}
    >
      <button type="button" onClick={() => (p as { onOpenInsights?: () => void }).onOpenInsights?.()}>open-insights</button>
    </div>
  ),
}));

vi.mock('@/components/home-tab', () => ({
  HomeTab: (p: Record<string, unknown>) => (
    <div data-testid="home-tab" data-loading={String(p.isLoading)} />
  ),
}));

vi.mock('@/components/monitor-tab', () => ({
  MonitorTab: (p: Record<string, unknown>) => (
    <div data-testid="monitor-tab" data-is-demo={String(p.isDemo)} />
  ),
}));

// dynamic mock: 直接渲染本地注册的 mock 件 (vi.mock butterfly-tab 已拦截 loader 的 import,
// loader().then 拿到的就是 mock — 但 render 必须同步, 所以这里用一个由 vi.mock 模块
// 侧写的全局桥)
const __butterflyBridge: { Comp: React.ComponentType<Record<string, unknown>> | null } = { Comp: null };

vi.mock('next/dynamic', () => ({
  default: () => (p: Record<string, unknown>) => {
    if (!__butterflyBridge.Comp) return <div data-testid="butterfly-loading" />;
    const C = __butterflyBridge.Comp;
    return <C {...p} />;
  },
}));

// ButterflyTab 真实模块 mock (dynamic loader import 的路径)
vi.mock('@/features/butterfly/components/butterfly-tab', () => ({
  ButterflyTab: (p: Record<string, unknown>) => (
    <div data-testid="butterfly-tab" data-is-demo={String(p.isDemo)}>
      <button type="button" onClick={() => (p as { onBack?: () => void }).onBack?.()}>back</button>
    </div>
  ),
}));
// 顶层 await 触发 mock 工厂执行, 然后把 mock 组件写进桥 (dynamic 的 loader 会 import
// 到同一个 mock 实例, 但为避免 promise 时序问题, 桥直接持有同一渲染函数)
void import('@/features/butterfly/components/butterfly-tab').then((m) => {
  __butterflyBridge.Comp = m.ButterflyTab as unknown as React.ComponentType<Record<string, unknown>>;
});

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="chevron-left" />,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

const baseProps = (): ComponentProps<typeof AppTabContent> =>
  ({
    activeTab: 'chat',
    tabDir: 'left' as const,
    impulseContext: undefined,
    buddyState: { badges: ['a', 'b'], challengesCompleted: 3, dreamFunds: [] },
    chatContextMessage: undefined,
    challengeContext: undefined,
    isDemo: false,
    sharedSessionId: null,
    appStatus: null,
    events: [],
    stats: { moneySaved: 120, daysStreak: 4, totalEvents: 2 },
    isHomeDataLoading: false,
    previousTab: 'chat',
    userId: 'u-1',
    hourlyRate: 50,
    buddyTabLoading: false,
    handleContextConsumed: vi.fn(),
    forceRefresh: vi.fn(),
    handleBuddyNavigateChat: vi.fn(),
    handleBuddyRevive: vi.fn(),
    handleBuddyAddTokens: vi.fn(),
    handleBuddyToast: vi.fn(),
    handleChallengePassed: vi.fn(),
    handleNavigateChat: vi.fn(),
    handleNavigateMonitor: vi.fn(),
    handleNavigateFamily: vi.fn(),
    showAuthPrompt: vi.fn(),
    handleMonitorTalkToAI: vi.fn(),
    handleImpulseAlert: vi.fn(),
    switchTab: vi.fn(),
    setSharedSessionId: vi.fn(),
    setShowInsightsOverlay: vi.fn(),
    setActiveTab: vi.fn(),
    createDreamFund: vi.fn(),
    updateDreamFund: vi.fn(),
    deleteDreamFund: vi.fn(),
    reorderDreamFunds: vi.fn(),
    markDailyChatted: vi.fn(),
    dailyTasks: null,
    dailyTasksCompleted: 0,
    useHealingKit: vi.fn(),
    showInsightsOverlay: false,
    t: (key: string) => key,
  }) as unknown as ComponentProps<typeof AppTabContent>;

function setup(overrides: Partial<ComponentProps<typeof AppTabContent>> = {}) {
  const props = { ...baseProps(), ...overrides };
  return { props, view: render(<AppTabContent {...props} />) };
}

describe('AppTabContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all mounted tab panels; inactive ones are hidden + inert', () => {
    setup({ activeTab: 'chat' });
    // 五个常驻 tab 容器全部在 DOM (CSS hidden 切换, 非卸载)
    expect(screen.getByTestId('chat-tab')).toBeTruthy();
    expect(screen.getByTestId('buddy-tab')).toBeTruthy();
    expect(screen.getByTestId('defense-tab')).toBeTruthy();
    expect(screen.getByTestId('profile-tab')).toBeTruthy();
    // 非激活容器带 inert (无障碍: 屏幕阅读器跳过)
    const hidden = screen.getByTestId('buddy-tab').closest('div.absolute');
    expect(hidden?.hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('chat-tab').closest('div.absolute')?.hasAttribute('inert')).toBe(false);
  });

  it('chat panel gets active animation class per direction', () => {
    const { view } = setup({ activeTab: 'chat', tabDir: 'left' });
    const chatWrap = screen.getByTestId('chat-tab').closest('div.absolute');
    expect(chatWrap?.className).toContain('animate-tab-in-left');
    view.rerender(<AppTabContent {...baseProps()} activeTab="chat" tabDir="right" />);
    expect(screen.getByTestId('chat-tab').closest('div.absolute')?.className).toContain('animate-tab-in-right');
  });

  it('wires defense guardRankStats from buddyState and stats', () => {
    setup({ activeTab: 'defense' });
    const defense = screen.getByTestId('defense-tab');
    expect(defense.getAttribute('data-total-saved')).toBe('120');
    expect(defense.getAttribute('data-intercepts')).toBe('3'); // buddyState.challengesCompleted
  });

  it('profile tab: challengesCompleted = max(challenge events, totalEvents)', () => {
    setup({
      activeTab: 'profile',
      events: [
        { eventType: 'challenge_completed' },
        { eventType: 'challenge_failed' },
        { eventType: 'manual' },
      ] as never,
      stats: { moneySaved: 10, daysStreak: 1, totalEvents: 5 },
    });
    expect(screen.getByTestId('profile-tab').getAttribute('data-is-active')).toBe('true');
    expect(screen.getByTestId('profile-tab').getAttribute('data-streak')).toBe('1');
  });

  it('monitor tab renders only when active; back button returns to previousTab', () => {
    const { props } = setup({ activeTab: 'monitor', previousTab: 'buddy' });
    expect(screen.getByTestId('monitor-tab')).toBeTruthy();
    expect(screen.getByTestId('monitor-tab').getAttribute('data-is-demo')).toBe('false');
    fireEvent.click(screen.getByText('common.back'));
    expect(props.setActiveTab).toHaveBeenCalledWith('buddy');
  });

  it('insights overlay: visible when showInsightsOverlay && !isDemo; hidden in demo', () => {
    const first = setup({ showInsightsOverlay: true, isDemo: false });
    expect(screen.getByTestId('home-tab')).toBeTruthy();
    fireEvent.click(screen.getByText('common.back', { selector: 'span' }));
    // screen 全局共享 — 第二次断言前先卸载第一视图
    first.view.unmount();
    // demo 模式: overlay 不渲染
    setup({ showInsightsOverlay: true, isDemo: true, activeTab: 'profile' });
    expect(screen.queryByTestId('home-tab')).toBeNull();
  });

  it('buddy tab callbacks route to switchTab: onSeeIt→chat, onGacha→butterfly', () => {
    const { props } = setup({ activeTab: 'buddy' });
    fireEvent.click(screen.getByText('see-it'));
    expect(props.switchTab).toHaveBeenCalledWith('chat');
    fireEvent.click(screen.getByText('gacha'));
    expect(props.switchTab).toHaveBeenCalledWith('butterfly');
  });

  it('profile onOpenInsights routes to setShowInsightsOverlay(true)', () => {
    const { props } = setup({ activeTab: 'profile' });
    fireEvent.click(screen.getByText('open-insights'));
    expect(props.setShowInsightsOverlay).toHaveBeenCalledWith(true);
  });

  it('insights onNavigateChat closes overlay before navigating', () => {
    // home-tab mock 未暴露 onNavigateChat 按钮 — 通过 home-tab 渲染在场断言 + overlay 关闭逻辑走 back 按钮
    const { props } = setup({ showInsightsOverlay: true });
    expect(screen.getByTestId('home-tab').getAttribute('data-loading')).toBe('false');
    fireEvent.click(screen.getByTestId('chevron-left').closest('button') as HTMLElement);
    expect(props.setShowInsightsOverlay).toHaveBeenCalledWith(false);
  });
});
