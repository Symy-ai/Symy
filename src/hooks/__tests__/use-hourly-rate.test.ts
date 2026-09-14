/**
 * Test: rateIsDefault 单例标记 (batch26-b)
 *
 * @vitest-environment happy-dom
 *
 * 服务端 GET /api/user/hourly-rate 现回传 isDefault (DB null = 从未设置)。
 * hook 需:
 *   - GET isDefault 两态都能落到 rateIsDefault
 *   - setHourlyRate 成功后置 false
 *   - 标记变化广播给所有订阅者 (单例共享态 — 胶囊/周报/分享卡同步显隐)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1' }, loading: false, signOut: vi.fn() })),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useHourlyRate, _resetHourlyRateStateForTest } from '@/hooks/use-hourly-rate';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/components/auth/auth-provider';

function authed() {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'u1', email: 'u1@test.dev' } as never,
    loading: false,
    signOut: vi.fn(),
  });
}

describe('rateIsDefault shared flag (batch26-b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetHourlyRateStateForTest();
    authed();
  });

  it('GET isDefault:true → rateIsDefault true (用户从未设置)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ hourlyRate: 20, default: true, isDefault: true });

    const { result } = renderHook(() => useHourlyRate());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rateIsDefault).toBe(true);
  });

  it('GET isDefault:false → rateIsDefault false (已自设)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ hourlyRate: 80, default: false, isDefault: false });

    const { result } = renderHook(() => useHourlyRate());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rateIsDefault).toBe(false);
  });

  it('setHourlyRate success → flag flips false and every subscriber receives the update', async () => {
    vi.mocked(apiFetch).mockImplementation(((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ success: true });
      return Promise.resolve({ hourlyRate: 20, default: true, isDefault: true });
    }) as typeof apiFetch);

    // 两个订阅者共享同一份单例态 (真实场景: 周报 + 胶囊 + 分享卡同时在线)
    const first = renderHook(() => useHourlyRate());
    const second = renderHook(() => useHourlyRate());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    expect(second.result.current.rateIsDefault).toBe(true);
    expect(second.result.current.hourlyRate).toBe(20);

    await act(async () => {
      await first.result.current.setHourlyRate(100);
    });

    // 写方: 值与标记同时更新
    expect(first.result.current.hourlyRate).toBe(100);
    expect(first.result.current.rateIsDefault).toBe(false);
    // 订阅方: 广播到达 (数字变化 → 「赢回 X 小时」换算点全量生效)
    expect(second.result.current.hourlyRate).toBe(100);
    expect(second.result.current.rateIsDefault).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/user/hourly-rate',
      { method: 'POST', body: { hourlyRate: 100 } }
    );
  });
});
