// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../auth-provider';

// ── mock 惯例 (对齐 src/hooks/__tests__/use-buddy-state-rq.test.tsx) ──
// callback 捕获模式: onAuthStateChange 存下 callback 供测试手动触发事件

type AuthCallback = (event: string, session: { user: User | null } | null) => void;

let authCallback: AuthCallback | null = null;
const unsubscribeMock = vi.fn();
const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const signOutSupabaseMock = vi.fn();
const createClientMock = vi.hoisted(() =>
  vi.fn(() => ({
    auth: {
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeMock } } };
      }),
      getUser: getUserMock,
      updateUser: updateUserMock,
      signOut: signOutSupabaseMock,
    },
  }))
);
const isConfiguredMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/lib/supabase-browser', () => ({
  createClient: createClientMock,
  isSupabaseConfigured: isConfiguredMock,
}));

const identifyMock = vi.hoisted(() => vi.fn());
const resetMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/posthog', () => ({ identifyUser: identifyMock, resetUser: resetMock }));

const apiFetchMock = vi.hoisted(() => vi.fn());
const apiFetchVoidMock = vi.hoisted(() => vi.fn((_path: string, _opts?: Record<string, unknown>) => Promise.resolve()));
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock, apiFetchVoid: apiFetchVoidMock }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const testUser = (id: string): User =>
  ({
    id,
    aud: 'authenticated',
    email: `${id}@test.dev`,
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: '2026-01-01',
  }) as unknown as User;

function Consumer() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="user-id">{user?.id ?? 'none'}</span>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
    </div>
  );
}

function setup() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
    localStorage.clear();
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
    isConfiguredMock.mockReturnValue(true);
    getUserMock.mockResolvedValue({ data: { user: null } });
    signOutSupabaseMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({});
    apiFetchMock.mockResolvedValue({ agentId: 'agent-1' });
  });

  afterEach(() => {
    cleanup();
  });

  it('starts in loading state and clears loading after getUser resolves', async () => {
    setup();
    expect(screen.getByTestId('loading').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('user-id').textContent).toBe('none');
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it('sets user from initial getUser result', async () => {
    getUserMock.mockResolvedValue({ data: { user: testUser('u-init') } });
    setup();
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('u-init'));
    expect(screen.getByTestId('loading').textContent).toBe('ready');
  });

  it('SIGNED_IN event sets user even when getUser is stale', async () => {
    // getUser 慢返回 null, 但 onAuthStateChange 先触发 SIGNED_IN — stale 结果必须被丢弃
    getUserMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { user: null } }), 50))
    );
    setup();
    authCallback?.('SIGNED_IN', { user: testUser('u-realtime') });
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('u-realtime'));
    await new Promise((r) => setTimeout(r, 80));
    // stale getUser 结果不覆盖 realtime 结果
    expect(screen.getByTestId('user-id').textContent).toBe('u-realtime');
  });

  it('TOKEN_REFRESHED updates user but keeps loading cleared', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    authCallback?.('TOKEN_REFRESHED', { user: testUser('u-refreshed') });
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('u-refreshed'));
  });

  it('SIGNED_OUT clears user', async () => {
    getUserMock.mockResolvedValue({ data: { user: testUser('u-out') } });
    setup();
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('u-out'));
    authCallback?.('SIGNED_OUT', null);
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('none'));
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = setup();
    await waitFor(() => expect(getUserMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('identifies user and ensures agent after login', async () => {
    getUserMock.mockResolvedValue({ data: { user: testUser('u-agent') } });
    setup();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/letta/agent', {
      method: 'POST',
      body: { action: 'ensure' },
    }));
    expect(identifyMock).toHaveBeenCalledWith('u-agent');
  });

  it('unconfigured supabase resolves loading immediately with no client calls', async () => {
    isConfiguredMock.mockReturnValue(false);
    setup();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(createClientMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('user-id').textContent).toBe('none');
  });

  it('getUser rejection resolves loading with null user', async () => {
    getUserMock.mockRejectedValue(new Error('network'));
    setup();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('user-id').textContent).toBe('none');
  });

  it('signOut: clears user, resets posthog, clears cookies and redirects', async () => {
    // 准备: 残留 supabase cookie (模拟 signOut 抛错时 cookie 残留)
    document.cookie = 'sb-test-auth-token=abc; Path=/';
    getUserMock.mockResolvedValue({ data: { user: testUser('u-signout') } });

    function SignOutConsumer() {
      const { signOut, user } = useAuth();
      return (
        <div>
          <span data-testid="user-id">{user?.id ?? 'none'}</span>
          <button type="button" onClick={() => void signOut()}>signout</button>
        </div>
      );
    }
    render(
      <AuthProvider>
        <SignOutConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('u-signout'));

    document.cookie = 'sb-test-auth-token=abc; Path=/';
    const { getByText } = { getByText: screen.getByText };
    getByText('signout').click();
    await waitFor(() => expect(signOutSupabaseMock).toHaveBeenCalledWith({ scope: 'global' }));
    await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(1));
    // cookie 被强制清除 (belt-and-suspenders)
    await waitFor(() => expect(document.cookie).not.toContain('sb-test-auth-token'));
  });

  it('signOut still clears cookies when supabase signOut throws', async () => {
    signOutSupabaseMock.mockRejectedValue(new Error('network down'));
    getUserMock.mockResolvedValue({ data: { user: testUser('u-throw') } });

    function SignOutConsumer() {
      const { signOut } = useAuth();
      return <button type="button" onClick={() => void signOut()}>signout</button>;
    }
    render(
      <AuthProvider>
        <SignOutConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(getUserMock).toHaveBeenCalledTimes(1));
    document.cookie = 'sb-xyz-auth-token.0=chunk; Path=/';
    screen.getByText('signout').click();
    // 抛错路径: finally 里仍然强制清 cookie
    await waitFor(() => expect(document.cookie).not.toContain('sb-xyz-auth-token'));
  });

  it('locale sync posts once per user (completed-set guard)', async () => {
    localStorage.setItem('symy-locale', 'zh');
    getUserMock.mockResolvedValue({ data: { user: testUser('u-locale') } });
    setup();
    await waitFor(() =>
      expect(apiFetchVoidMock).toHaveBeenCalledWith('/api/user/locale', {
        method: 'POST',
        body: expect.objectContaining({ locale: 'zh' }),
      })
    );
    // 同一用户再次触发 auth 事件不再重复 POST (completed set)
    authCallback?.('SIGNED_IN', { user: testUser('u-locale') });
    await new Promise((r) => setTimeout(r, 30));
    const localePosts = apiFetchVoidMock.mock.calls.filter(
      (c) => c[0] === '/api/user/locale'
    );
    expect(localePosts).toHaveLength(1);
  });
});
