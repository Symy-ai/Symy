// @vitest-environment happy-dom
/**
 * batch73-a 回归测试 — useBuddyStateRQ Realtime 频道多实例安全
 *
 * 用户报障 (09-13): 打开设置面板整页降级为空态+重试。
 * 根因: page.tsx (应用级) 与设置面板 GuardProfileExportSetting 同时挂载本 hook;
 *   旧实现用固定频道名 buddy_state_rq:<user.id>, 第二个实例 supabase.channel(同名)
 *   复用已 joined 的频道, 再 .on('postgres_changes') 被 supabase-js 同步 throw
 *   ("cannot add postgres_changes callbacks ... after subscribe()") — effect 抛错
 *   直抵 ErrorBoundary, 拖垮整个设置面板。
 *
 * 本测试用复刻 supabase-js 频道语义的 fake (同名复用 + on-after-subscribe throw)
 * 同时挂载两个 hook 实例, 锁定: 双实例共存不抛错、频道各自独立、卸载各自清理。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, createElement, type ReactNode } from 'react';

// ===== fake supabase — 复刻 supabase-js v2 频道语义 =====
const rt = vi.hoisted(() => {
  type FakeChannel = {
    topic: string;
    on: (type: string) => FakeChannel;
    subscribe: () => FakeChannel;
  };
  const registry = new Map<string, FakeChannel>();
  const subscribedTopics: string[] = [];
  const removedTopics: string[] = [];

  function makeChannel(topic: string): FakeChannel {
    let joined = false;
    const channel: FakeChannel = {
      topic,
      on(type: string) {
        // supabase-js v2 RealtimeChannel.on 原句: joined 后再挂回调同步 throw
        if (joined) {
          throw new Error(`cannot add \`${type}\` callbacks for realtime:${topic} after \`subscribe()\`.`);
        }
        return channel;
      },
      subscribe() {
        joined = true;
        subscribedTopics.push(topic);
        return channel;
      },
    };
    return channel;
  }

  const client = {
    channel(name: string): FakeChannel {
      const existing = registry.get(name);
      if (existing) return existing; // supabase-js: 同名返回既有频道
      const channel = makeChannel(name);
      registry.set(name, channel);
      return channel;
    },
    removeChannel(channel: FakeChannel): void {
      registry.delete(channel.topic);
      removedTopics.push(channel.topic);
    },
  };

  return {
    client,
    reset(): void {
      registry.clear();
      subscribedTopics.length = 0;
      removedTopics.length = 0;
    },
    subscribedTopics,
    removedTopics,
  };
});

vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => rt.client,
  isSupabaseConfigured: () => true,
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u-77' }, loading: false, signOut: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ buddyState: { streak: 1 }, version: 3 })),
  apiFetchVoid: vi.fn(() => Promise.resolve(undefined)),
  ApiError: class extends Error {},
}));

vi.mock('@/lib/posthog', () => ({
  symyEvents: { dreamFundCreated: vi.fn() },
}));

vi.mock('@/hooks/use-buddy-timers', () => ({
  useBuddyTimers: () => {},
}));

import { useBuddyStateRQ } from '../use-buddy-state-rq';

// 捕获 effect 抛错的探针边界 — 真实 app 里这是 app-tab-content 的 ErrorBoundary
class ProbeBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <div data-testid="probe-fallback">{String(this.state.error.message)}</div>;
    }
    return this.props.children as ReactNode;
  }
}

function Consumer({ testId }: { testId: string }) {
  useBuddyStateRQ(false);
  return <div data-testid={testId} />;
}

function renderTwoConsumers() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: queryClient },
      createElement(ProbeBoundary, null,
        createElement(Consumer, { testId: 'consumer-app' }),
        createElement(Consumer, { testId: 'consumer-settings' }),
      ),
    ),
  );
}

describe('useBuddyStateRQ realtime channel — multi-instance safety (batch73-a)', () => {
  beforeEach(() => {
    rt.reset();
    cleanup();
  });

  it('两个同挂载实例 (page.tsx + 设置面板) 不互相炸 — 面板不得整页降级', () => {
    renderTwoConsumers();
    expect(screen.getByTestId('consumer-app')).toBeDefined();
    expect(screen.getByTestId('consumer-settings')).toBeDefined();
    // effect 抛错会被边界接住 — 出现 fallback 即回归
    expect(screen.queryByTestId('probe-fallback')).toBeNull();
  });

  it('两实例各订独立频道, 卸载各自清理', () => {
    const { unmount } = renderTwoConsumers();
    expect(rt.subscribedTopics).toHaveLength(2);
    for (const topic of rt.subscribedTopics) {
      expect(topic).toContain('buddy_state_rq:u-77');
    }
    expect(new Set(rt.subscribedTopics).size).toBe(2);

    unmount();
    expect(rt.removedTopics.sort()).toEqual([...rt.subscribedTopics].sort());
  });

  it('单实例照常订阅 (行为不回归)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(QueryClientProvider, { client: queryClient },
        createElement(Consumer, { testId: 'consumer-single' }),
      ),
    );
    expect(rt.subscribedTopics).toHaveLength(1);
    expect(rt.subscribedTopics[0]).toContain('buddy_state_rq:u-77');
  });
});
