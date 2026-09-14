// @vitest-environment happy-dom
// 🔧 b68-hotfix2 回归测试: ?guest=true 必须响应式 — /zh 上点「体验演示」是同路由
//   query 变化 (router.push('/zh?guest=true')), 组件不重挂载。旧实现 useState +
//   空依赖 useEffect 只在 mount 读一次 URL → isGuest 恒 false → LandingPage 不消失。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeMeApp from '../page';

// auth 状态可按用例切换 (default: 未登录、loading 完成 → isDemo 分支)
const authState = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  loading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // 读 live URL — 模拟真实 useSearchParams 随 query 变化返回新值
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'zh' }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => null,
  isSupabaseConfigured: () => false,
}));

// 页面子树 (登录用例的 onboarding/daily-tasks/hourly-rate 等) 会发 fetch —
// 空实现避免 happy-dom teardown 时 in-flight fetch abort → unhandled rejection
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({})),
  apiFetchVoid: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('@/hooks/use-buddy-state-rq', () => ({
  useBuddyStateRQ: () => ({
    buddyState: { streak: 0, totalSaved: 0, challengesCompleted: 0, badges: [], dreamFunds: [] },
    addTokens: vi.fn(),
    useHealingKit: vi.fn(),
    revive: vi.fn(),
    forceRefresh: vi.fn(),
    createDreamFund: vi.fn(),
    updateDreamFund: vi.fn(),
    deleteDreamFund: vi.fn(),
    reorderDreamFunds: vi.fn(),
    isLoaded: true,
    syncError: null,
  }),
}));

vi.mock('@/hooks/use-home-data', () => ({
  useHomeData: () => ({ emailReceipts: [], healthEvents: [], isHomeDataLoading: false }),
}));

vi.mock('@/hooks/use-companion-effects', () => ({
  useCompanionEffects: () => ({ challengeStats: null }),
}));

// 定时器型 hooks — mock 掉避免 teardown 后 pending timer unhandled rejection
vi.mock('@/hooks/use-milestone-toasts', () => ({ useMilestoneToasts: () => {} }));
vi.mock('@/hooks/use-ref-code-tracking', () => ({
  captureRefCode: vi.fn(),
  useRefCodeTracking: () => {},
}));

// 被测目标是 page 的 early-return 决策, 重子组件用 stub 断言渲染分支
vi.mock('@/components/landing-page', () => ({
  LandingPage: () => <div data-testid="landing-page" />,
}));
vi.mock('@/components/app-tab-content', () => ({
  AppTabContent: () => <div data-testid="demo-app-content" />,
}));

function goto(url: string) {
  window.history.replaceState({}, '', url);
}

describe('WeMeApp ?guest=true early-return (b68-hotfix2)', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    goto('/zh');
  });

  it('无 query: /zh 渲染 LandingPage (老行为不回归)', () => {
    render(<WeMeApp />);
    expect(screen.getByTestId('landing-page')).toBeTruthy();
    expect(screen.queryByTestId('demo-app-content')).toBeNull();
  });

  it('?guest=true 直达: 不渲染 LandingPage, 直接渲染演示 app', () => {
    goto('/zh?guest=true');
    render(<WeMeApp />);
    expect(screen.queryByTestId('landing-page')).toBeNull();
    expect(screen.getByTestId('demo-app-content')).toBeTruthy();
  });

  it('同路由 query push (bug 场景): /zh → /zh?guest=true 重渲染后 LandingPage 消失', () => {
    const { rerender } = render(<WeMeApp />);
    expect(screen.getByTestId('landing-page')).toBeTruthy();

    // 模拟 router.push('/zh?guest=true'): URL 变化 + Next 触发的重渲染 (组件不重挂载)
    goto('/zh?guest=true');
    rerender(<WeMeApp />);

    expect(screen.queryByTestId('landing-page')).toBeNull();
    expect(screen.getByTestId('demo-app-content')).toBeTruthy();
  });

  it('登录用户: 无 query 也不渲染 LandingPage (既有逻辑不变)', () => {
    authState.user = { id: 'u1', user_metadata: {} };
    render(<WeMeApp />);
    expect(screen.queryByTestId('landing-page')).toBeNull();
    expect(screen.getByTestId('demo-app-content')).toBeTruthy();
  });
});
